/**
 * Lo que mueve el saldo de una cuenta por pagar: bloquear sus documentos y luego la cuenta, aplicarle un pago o una
 * compensación, lo que pasa cuando queda pagada (la orden se cierra, la deuda se salda) y regresar lo que se cancela
 * (la orden se reabre, la deuda vuelve a abierta).
 * Fase 17 · docs/modulos/contaduria/cuentas-por-pagar.md (reglas 3, 5 y 7) y terceros-y-deudas.md (regla 7)
 *
 * El orden de los candados (decisiones 698 y 705): los documentos de las cuentas por pagar (las órdenes de sus
 * facturas, con `compras.ordenes_para_factura`, y sus deudas, en orden de id); el pago o la compensación; el anticipo;
 * el crédito; las cuentas por cobrar y luego las cuentas por pagar, en orden de id; y al final el folio. Así dos pagos a
 * cuentas de la misma orden o de la misma deuda se ponen en fila y el segundo ve el primero.
 */

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { aplicacionesPago, cuentasPorPagar, deudaMensualidades, deudas, facturasProveedor } from "../tablas.ts";
import { cancelarAplicaciones } from "./cuentas.ts";
import {
	bloquearOrdenes,
	type CuentaPorPagar,
	type FacturaRevisada,
	ordenesDeFacturas,
	ordenesPagadas,
	revisarFacturas,
} from "./facturas.ts";

/** Lo que regresa `compras.cerrar_orden_pagada`. */
const ordenCerrada = z.object({ cerrada: z.boolean() });

/** Lo que regresa `compras.reabrir_orden_pagada`. */
const ordenReabierta = z.object({ reabierta: z.boolean() });

/**
 * El estado de una cuenta por pagar que se puede pagar, con su saldo.
 * @param saldo El saldo, de 0 al importe.
 * @param importe Su importe.
 */
export function estadoConSaldo(saldo: number, importe: number): "pagada" | "pagada_en_parte" | "por_pagar" {
	if (saldo === 0) return "pagada";
	return saldo === importe ? "por_pagar" : "pagada_en_parte";
}

/** Los documentos de unas cuentas por pagar: las órdenes de sus facturas y sus deudas. */
export interface DocumentosDeCuentas {
	ordenIds: string[];
	deudaIds: string[];
}

/**
 * Los documentos de unas cuentas por pagar, sin bloquear.
 * @param transaccion La transacción.
 * @param cuentaIds Las cuentas.
 */
export async function documentosDeCuentas(
	transaccion: Transaccion,
	cuentaIds: readonly string[],
): Promise<DocumentosDeCuentas> {
	if (cuentaIds.length === 0) return { ordenIds: [], deudaIds: [] };
	const filas = await transaccion
		.select({ facturaId: cuentasPorPagar.facturaProveedorId, deudaId: deudaMensualidades.deudaId })
		.from(cuentasPorPagar)
		.leftJoin(deudaMensualidades, eq(deudaMensualidades.id, cuentasPorPagar.deudaMensualidadId))
		.where(inArray(cuentasPorPagar.id, [...cuentaIds]));
	const facturaIds = filas.flatMap((fila) => (fila.facturaId === null ? [] : [fila.facturaId]));
	return {
		ordenIds: await ordenesDeFacturas(transaccion, facturaIds),
		deudaIds: [...new Set(filas.flatMap((fila) => (fila.deudaId === null ? [] : [fila.deudaId])))].sort(),
	};
}

/**
 * Bloquea los documentos de unas cuentas por pagar, antes que las cuentas: las órdenes de sus facturas y sus deudas,
 * en orden de id.
 * @param contexto El contexto de la acción.
 * @param cuentaIds Las cuentas.
 * @returns Sus documentos.
 */
export async function bloquearDocumentosDeCuentas(
	contexto: ContextoDeAccion,
	cuentaIds: readonly string[],
): Promise<DocumentosDeCuentas> {
	const documentos = await documentosDeCuentas(contexto.transaccion, cuentaIds);
	await bloquearOrdenes(contexto, documentos.ordenIds);
	if (documentos.deudaIds.length > 0) {
		await contexto.transaccion
			.select({ id: deudas.id })
			.from(deudas)
			.where(inArray(deudas.id, documentos.deudaIds))
			.orderBy(asc(deudas.id))
			.for("update");
	}
	return documentos;
}

/**
 * Bloquea unas cuentas por pagar en orden de id.
 * @param transaccion La transacción.
 * @param ids Las cuentas.
 * @returns Las cuentas ya bloqueadas, por id.
 */
export async function bloquearCuentasPorPagar(
	transaccion: Transaccion,
	ids: readonly string[],
): Promise<Map<string, CuentaPorPagar>> {
	if (ids.length === 0) return new Map();
	const cuentas = await transaccion
		.select()
		.from(cuentasPorPagar)
		.where(inArray(cuentasPorPagar.id, [...new Set(ids)]))
		.orderBy(asc(cuentasPorPagar.id))
		.for("update");
	return new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
}

/** De dónde sale lo que baja una cuenta por pagar. */
export type OrigenPorPagar = { pagoId: string } | { compensacionId: string };

/**
 * Aplica un monto a una cuenta por pagar ya bloqueada: su aplicación vigente, su saldo, su estado y `pagada_en`.
 * @param contexto El contexto de la acción.
 * @param cuenta La cuenta, bloqueada por quien llama.
 * @param monto Lo que baja, mayor que 0 y hasta el saldo (quien llama ya lo revisó con su mensaje).
 * @param origen El pago o la compensación.
 * @returns La cuenta como quedó.
 */
export async function aplicarACuentaPorPagar(
	contexto: ContextoDeAccion,
	cuenta: CuentaPorPagar,
	monto: number,
	origen: OrigenPorPagar,
): Promise<CuentaPorPagar> {
	if (monto <= 0 || monto > cuenta.saldoCentavos) {
		throw new Error(`no se aplican ${monto} a una cuenta por pagar con saldo ${cuenta.saldoCentavos}`);
	}
	await contexto.transaccion.insert(aplicacionesPago).values({
		id: uuidv7(),
		...origen,
		cuentaPorPagarId: cuenta.id,
		montoCentavos: monto,
		fecha: contexto.diaDeNegocio.toString(),
		creadoPor: quienCambia(contexto),
	});
	const saldo = cuenta.saldoCentavos - monto;
	const estado = estadoConSaldo(saldo, cuenta.importeCentavos);
	const pagadaEn = estado === "pagada" ? contexto.ahora.toString() : null;
	await contexto.transaccion
		.update(cuentasPorPagar)
		.set({ saldoCentavos: saldo, estado, pagadaEn })
		.where(eq(cuentasPorPagar.id, cuenta.id));
	if (estado === "pagada") {
		contexto.guardarEvento({
			tipo: "cuenta_por_pagar.pagada",
			datos: { cuenta_por_pagar_id: cuenta.id },
			// La de una factura también avisa a Compras, que lee si su orden ya está pagada (decisión 716).
			tablas: cuenta.facturaProveedorId === null ? ["cuentas_por_pagar"] : ["cuentas_por_pagar", "facturas_proveedor"],
			entidad: "cuentas_por_pagar",
			entidadId: cuenta.id,
		});
	}
	return { ...cuenta, saldoCentavos: saldo, estado, pagadaEn };
}

/** Lo que cambió en los documentos al pagarse o al regresar sus cuentas. */
export interface DocumentosQueCambiaron {
	ordenes: string[];
	deudas: string[];
}

/**
 * Lo que pasa cuando unas cuentas se pagan (regla 5 de las cuentas por pagar y regla 7 de las deudas): Compras
 * cierra cada orden cuyas facturas quedaron todas pagadas, y cada deuda sin nada por pagar queda saldada. Quien llama
 * ya tiene los documentos bloqueados.
 * @param contexto El contexto de la acción.
 * @param documentos Los documentos de las cuentas que se pagaron.
 * @returns Las órdenes que se cerraron y las deudas que se saldaron.
 */
export async function alPagarse(
	contexto: ContextoDeAccion,
	documentos: DocumentosDeCuentas,
): Promise<DocumentosQueCambiaron> {
	const cambiaron: DocumentosQueCambiaron = { ordenes: [], deudas: [] };
	for (const ordenId of await ordenesPagadas(contexto.transaccion, documentos.ordenIds)) {
		const { cerrada } = ordenCerrada.parse(
			await contexto.interna("compras.cerrar_orden_pagada", { orden_compra_id: ordenId }),
		);
		if (cerrada) cambiaron.ordenes.push(ordenId);
	}
	for (const deuda of await deudasConEstado(contexto.transaccion, documentos.deudaIds)) {
		if (deuda.estado !== "abierta" || !deuda.todoPagado) continue;
		await contexto.transaccion
			.update(deudas)
			.set({ estado: "saldada", saldadaEn: contexto.ahora.toString() })
			.where(eq(deudas.id, deuda.id));
		eventoDeDeuda(contexto, "deuda.saldada", deuda);
		cambiaron.deudas.push(deuda.folio);
	}
	return cambiaron;
}

/**
 * Cada deuda con su estado y si todas sus cuentas están pagadas.
 * @param transaccion La transacción.
 * @param deudaIds Las deudas.
 */
async function deudasConEstado(transaccion: Transaccion, deudaIds: readonly string[]) {
	if (deudaIds.length === 0) return [];
	const filas = await transaccion
		.select({ id: deudas.id, folio: deudas.folio, estado: deudas.estado, cuenta: cuentasPorPagar.estado })
		.from(deudas)
		.innerJoin(deudaMensualidades, eq(deudaMensualidades.deudaId, deudas.id))
		.innerJoin(cuentasPorPagar, eq(cuentasPorPagar.deudaMensualidadId, deudaMensualidades.id))
		.where(inArray(deudas.id, [...deudaIds]));
	return [...new Set(filas.map((fila) => fila.id))].map((id) => {
		const suyas = filas.filter((fila) => fila.id === id);
		return {
			id,
			folio: suyas[0]?.folio ?? "",
			estado: suyas[0]?.estado ?? "",
			todoPagado: suyas.every((fila) => fila.cuenta === "pagada"),
		};
	});
}

/** Guarda el evento de una deuda. */
function eventoDeDeuda(
	contexto: ContextoDeAccion,
	tipo: "deuda.saldada" | "deuda.abierta",
	deuda: { id: string; folio: string },
): void {
	contexto.guardarEvento({
		tipo,
		datos: { deuda_id: deuda.id },
		tablas: ["deudas"],
		entidad: "deudas",
		entidadId: deuda.id,
		entidadFolio: deuda.folio,
	});
}

/** Lo que regresó a una cuenta por pagar. */
export interface CuentaQueRegreso {
	cuenta_por_pagar_id: string;
	antes: number;
	despues: number;
}

/**
 * Cancela las aplicaciones vigentes de un pago o de una compensación a cuentas por pagar y regresa su monto. Una
 * orden con una factura que deja de estar pagada se reabre (`compras.reabrir_orden_pagada`), una deuda saldada
 * vuelve a abierta, y una factura que se queda sin pagos se vuelve a comparar con lo recibido (regla 6 de las
 * facturas). Quien llama ya tiene bloqueados los documentos de esas cuentas.
 * @param contexto El contexto de la acción.
 * @param origen El pago o la compensación que se cancela.
 * @param motivo El motivo de la cancelación.
 * @returns Las cuentas con su saldo antes y después, los folios de las órdenes que se reabrieron y las facturas que
 * cambiaron de estado, con su renglón de bitácora.
 */
export async function regresarAplicacionesPorPagar(
	contexto: ContextoDeAccion,
	origen: OrigenPorPagar,
	motivo: string,
): Promise<{ cuentas: CuentaQueRegreso[]; ordenesReabiertas: string[]; facturasRevisadas: FacturaRevisada[] }> {
	const { transaccion } = contexto;
	const vigentes = await aplicacionesPorPagarDe(transaccion, origen);
	const cuentas = await bloquearCuentasPorPagar(
		transaccion,
		vigentes.map((aplicacion) => aplicacion.cuentaId),
	);
	const regresaron: CuentaQueRegreso[] = [];
	const dejaronDeEstarPagadas: string[] = [];
	for (const cuenta of cuentas.values()) {
		const regresa = vigentes
			.filter((aplicacion) => aplicacion.cuentaId === cuenta.id)
			.reduce((suma, aplicacion) => suma + aplicacion.monto, 0);
		const saldo = cuenta.saldoCentavos + regresa;
		await transaccion
			.update(cuentasPorPagar)
			.set({ saldoCentavos: saldo, estado: estadoConSaldo(saldo, cuenta.importeCentavos), pagadaEn: null })
			.where(eq(cuentasPorPagar.id, cuenta.id));
		if (cuenta.estado === "pagada") dejaronDeEstarPagadas.push(cuenta.id);
		regresaron.push({ cuenta_por_pagar_id: cuenta.id, antes: cuenta.saldoCentavos, despues: saldo });
	}
	await cancelarAplicaciones(
		contexto,
		vigentes.map((aplicacion) => aplicacion.id),
		motivo,
	);
	// Una factura que vuelve a no tener pagos se compara otra vez con lo recibido de hoy (decisión 716).
	const sinPagos = regresaron
		.filter((regreso) => regreso.despues === cuentas.get(regreso.cuenta_por_pagar_id)?.importeCentavos)
		.map((regreso) => regreso.cuenta_por_pagar_id);
	const deLasSinPagos = await documentosDeCuentas(transaccion, sinPagos);
	const facturasRevisadas =
		deLasSinPagos.ordenIds.length === 0
			? []
			: await revisarFacturas(contexto, deLasSinPagos.ordenIds, "al regresar su pago");
	const documentos = await documentosDeCuentas(transaccion, dejaronDeEstarPagadas);
	const ordenes = await bloquearOrdenes(contexto, documentos.ordenIds);
	const ordenesReabiertas: string[] = [];
	for (const orden of ordenes) {
		const { reabierta } = ordenReabierta.parse(
			await contexto.interna("compras.reabrir_orden_pagada", { orden_compra_id: orden.orden_compra_id }),
		);
		if (reabierta) ordenesReabiertas.push(orden.folio);
	}
	for (const deuda of await deudasConEstado(transaccion, documentos.deudaIds)) {
		if (deuda.estado !== "saldada") continue;
		await transaccion.update(deudas).set({ estado: "abierta", saldadaEn: null }).where(eq(deudas.id, deuda.id));
		eventoDeDeuda(contexto, "deuda.abierta", deuda);
	}
	return { cuentas: regresaron, ordenesReabiertas, facturasRevisadas };
}

/**
 * Las aplicaciones vigentes de un pago o de una compensación a cuentas por pagar.
 * @param transaccion La transacción.
 * @param origen El pago o la compensación.
 */
export async function aplicacionesPorPagarDe(
	transaccion: Transaccion,
	origen: OrigenPorPagar,
): Promise<{ id: string; cuentaId: string; monto: number }[]> {
	const filas = await transaccion
		.select({
			id: aplicacionesPago.id,
			cuentaId: aplicacionesPago.cuentaPorPagarId,
			monto: aplicacionesPago.montoCentavos,
		})
		.from(aplicacionesPago)
		.where(
			and(
				"pagoId" in origen
					? eq(aplicacionesPago.pagoId, origen.pagoId)
					: eq(aplicacionesPago.compensacionId, origen.compensacionId),
				eq(aplicacionesPago.estado, "vigente"),
				isNotNull(aplicacionesPago.cuentaPorPagarId),
			),
		);
	return filas.flatMap((fila) => (fila.cuentaId === null ? [] : [{ ...fila, cuentaId: fila.cuentaId }]));
}

/**
 * Cómo se nombra el documento de una cuenta por pagar: el FP- de su factura, o «PR-08 · mensualidad 3 de 12».
 * @param transaccion La transacción.
 * @param cuenta La cuenta.
 */
export async function documentoDeCuenta(
	transaccion: Transaccion,
	cuenta: Pick<CuentaPorPagar, "facturaProveedorId" | "deudaMensualidadId">,
): Promise<string> {
	if (cuenta.facturaProveedorId !== null) {
		const [factura] = await transaccion
			.select({ folio: facturasProveedor.folio })
			.from(facturasProveedor)
			.where(eq(facturasProveedor.id, cuenta.facturaProveedorId));
		return factura?.folio ?? "La factura";
	}
	if (cuenta.deudaMensualidadId === null) return "La cuenta";
	const [mensualidad] = await transaccion
		.select({ folio: deudas.folio, numero: deudaMensualidades.numero, de: deudas.numeroMensualidades })
		.from(deudaMensualidades)
		.innerJoin(deudas, eq(deudas.id, deudaMensualidades.deudaId))
		.where(eq(deudaMensualidades.id, cuenta.deudaMensualidadId));
	return mensualidad === undefined
		? "La mensualidad"
		: `${mensualidad.folio} · mensualidad ${mensualidad.numero} de ${mensualidad.de}`;
}
