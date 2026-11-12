/**
 * Las compensaciones: lo que un tercero nos compró se descuenta de lo que le debemos, sin mover dinero, y se cancela
 * como un pago.
 * Fase 17 · docs/modulos/contaduria/terceros-y-deudas.md (regla 5, «`contaduria.compensar`» y
 * «`contaduria.cancelar_compensacion`»)
 *
 * El orden de los candados es el de `dominio/cuentas-por-pagar.ts`: los documentos de las cuentas por pagar, las
 * cuentas por cobrar y luego las cuentas por pagar, en orden de id.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { cancelarCompensacion, compensar } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { and, eq, gt, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { aplicarACuenta, bloquearCuentas, regresarAplicacionesPorCobrar } from "../dominio/cuentas.ts";
import {
	alPagarse,
	aplicacionesPorPagarDe,
	aplicarACuentaPorPagar,
	bloquearCuentasPorPagar,
	bloquearDocumentosDeCuentas,
	regresarAplicacionesPorPagar,
} from "../dominio/cuentas-por-pagar.ts";
import { nombreDelTercero } from "../dominio/facturas.ts";

import { compensaciones, cuentasPorCobrar, cuentasPorPagar, terceros } from "../tablas.ts";

/** Lo que una cuenta tiene para ordenar: primero las que vencen antes. */
function primeroLasQueVencenAntes(una: { vence: string; id: string }, otra: { vence: string; id: string }): number {
	return una.vence === otra.vence ? una.id.localeCompare(otra.id) : una.vence.localeCompare(otra.vence);
}

/**
 * Reparte un monto entre unas cuentas, primero las que vencen antes, hasta el saldo de cada una.
 * @param cuentas Las cuentas con su saldo.
 * @param monto Lo que se reparte.
 * @returns Lo que baja cada cuenta, sin las que no bajan.
 */
export function repartirEnCuentas<Cuenta extends { id: string; vence: string; saldoCentavos: number }>(
	cuentas: readonly Cuenta[],
	monto: number,
): { cuenta: Cuenta; monto: number }[] {
	let falta = monto;
	const repartido: { cuenta: Cuenta; monto: number }[] = [];
	for (const cuenta of [...cuentas].sort(primeroLasQueVencenAntes)) {
		if (falta === 0) break;
		const baja = Math.min(falta, cuenta.saldoCentavos);
		if (baja > 0) repartido.push({ cuenta, monto: baja });
		falta -= baja;
	}
	return repartido;
}

/** La suma de los saldos de unas cuentas. */
function sumaDeSaldos(cuentas: Iterable<{ saldoCentavos: number }>): number {
	let suma = 0;
	for (const cuenta of cuentas) suma += cuenta.saldoCentavos;
	return suma;
}

export const accionCompensar = implementarAccion(compensar, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [ficha] = await transaccion
		.select({ nombre: terceros.nombre })
		.from(terceros)
		.where(eq(terceros.id, datos.tercero_id));
	if (ficha === undefined) throw noExiste();
	const tercero = ficha.nombre;
	// Lo que le debemos sin las detenidas (regla 4 de las cuentas por pagar) y lo que nos debe.
	const porPagarIds = (
		await transaccion
			.select({ id: cuentasPorPagar.id })
			.from(cuentasPorPagar)
			.where(
				and(
					eq(cuentasPorPagar.terceroId, datos.tercero_id),
					inArray(cuentasPorPagar.estado, ["por_pagar", "pagada_en_parte"]),
				),
			)
	).map((cuenta) => cuenta.id);
	const porCobrarIds = (
		await transaccion
			.select({ id: cuentasPorCobrar.id })
			.from(cuentasPorCobrar)
			.where(and(eq(cuentasPorCobrar.terceroId, datos.tercero_id), gt(cuentasPorCobrar.saldoCentavos, 0)))
	).map((cuenta) => cuenta.id);
	// Los candados en orden: los documentos de lo que le debemos, lo que nos debe y lo que le debemos.
	const documentos = await bloquearDocumentosDeCuentas(contexto, porPagarIds);
	const porCobrar = [...(await bloquearCuentas(transaccion, porCobrarIds)).values()].filter(
		(cuenta) => cuenta.saldoCentavos > 0,
	);
	const porPagar = [...(await bloquearCuentasPorPagar(transaccion, porPagarIds)).values()].filter((cuenta) =>
		["por_pagar", "pagada_en_parte"].includes(cuenta.estado),
	);
	const [nosDebe, leDebemos] = [sumaDeSaldos(porCobrar), sumaDeSaldos(porPagar)];
	if (nosDebe === 0 || leDebemos === 0) {
		throw errorDeRegla(
			"sin_saldo_para_compensar",
			`${tercero} no nos debe y le debemos a la vez: no hay qué compensar.`,
		);
	}
	const maximo = Math.min(nosDebe, leDebemos);
	if (datos.monto_centavos > maximo) throw errorDeRegla("monto_mayor_que_maximo", `Hasta ${enPesos(maximo)}.`);
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(compensaciones).values({
		id,
		terceroId: datos.tercero_id,
		fecha: contexto.diaDeNegocio.toString(),
		montoCentavos: datos.monto_centavos,
		creadoPor: quien,
	});
	// El mismo total de cada lado, primero las que vencen antes.
	for (const { cuenta, monto } of repartirEnCuentas(porCobrar, datos.monto_centavos)) {
		await aplicarACuenta(contexto, cuenta, monto, { compensacionId: id });
	}
	let algunaPagada = false;
	for (const { cuenta, monto } of repartirEnCuentas(porPagar, datos.monto_centavos)) {
		const quedo = await aplicarACuentaPorPagar(contexto, cuenta, monto, { compensacionId: id });
		algunaPagada ||= quedo.estado === "pagada";
	}
	const cambiaron = algunaPagada ? await alPagarse(contexto, documentos) : { ordenes: [], deudas: [] };
	contexto.guardarEvento({
		tipo: "compensacion.registrada",
		datos: { compensacion_id: id, tercero_id: datos.tercero_id },
		tablas: ["compensaciones", "aplicaciones_pago", "cuentas_por_cobrar", "cuentas_por_pagar"],
		entidad: "compensaciones",
		entidadId: id,
	});
	const monto = enPesos(datos.monto_centavos);
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} compensó ${monto} con ${tercero}`,
		entidad: "compensaciones",
		entidadId: id,
		antes: { nos_debe_centavos: nosDebe, le_debemos_centavos: leDebemos },
		despues: {
			nos_debe_centavos: nosDebe - datos.monto_centavos,
			le_debemos_centavos: leDebemos - datos.monto_centavos,
			...(cambiaron.ordenes.length === 0 ? {} : { ordenes_cerradas: cambiaron.ordenes }),
			...(cambiaron.deudas.length === 0 ? {} : { deudas_saldadas: cambiaron.deudas }),
		},
	});
	return {
		resultado: { mensaje: `Compensación registrada: ${monto} con ${tercero}`, compensacion_id: id },
		entidad: { nombre: "compensaciones", id },
	};
});

export const accionCancelarCompensacion = implementarAccion(cancelarCompensacion, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const { motivo } = datos;
	// Los documentos de lo que bajó por pagar primero, luego la compensación con su versión.
	await bloquearDocumentosDeCuentas(
		contexto,
		(await aplicacionesPorPagarDe(transaccion, { compensacionId: datos.compensacion_id })).map(
			(aplicacion) => aplicacion.cuentaId,
		),
	);
	const [compensacion] = await transaccion
		.select()
		.from(compensaciones)
		.where(eq(compensaciones.id, datos.compensacion_id))
		.for("update");
	if (compensacion === undefined) throw noExiste();
	await tomarVersion(contexto, compensaciones, compensacion.id, version, async () => ({
		compensacion_id: compensacion.id,
		estado: compensacion.estado,
	}));
	if (compensacion.estado === "cancelada") {
		throw errorDeRegla("compensacion_cancelada", "Esa compensación ya está cancelada.");
	}
	const origen = { compensacionId: compensacion.id };
	const porCobrar = await regresarAplicacionesPorCobrar(contexto, origen, motivo);
	const porPagar = await regresarAplicacionesPorPagar(contexto, origen, motivo);
	const quien = quienCambia(contexto);
	await transaccion
		.update(compensaciones)
		.set({
			estado: "cancelada",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: motivo,
		})
		.where(eq(compensaciones.id, compensacion.id));
	contexto.guardarEvento({
		tipo: "compensacion.cancelada",
		datos: { compensacion_id: compensacion.id, tercero_id: compensacion.terceroId },
		tablas: [
			"compensaciones",
			"aplicaciones_pago",
			"cuentas_por_cobrar",
			"cuentas_por_pagar",
			// Compras se entera si una factura dejó de estar pagada (decisión 716).
			...(porPagar.conFacturas ? ["facturas_proveedor"] : []),
		],
		entidad: "compensaciones",
		entidadId: compensacion.id,
	});
	const tercero = await nombreDelTercero(transaccion, compensacion.terceroId);
	const confirmado = confirmadoConGoogle(contexto);
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} canceló la compensación de ${enPesos(compensacion.montoCentavos)} con ${tercero}: ${motivo}`,
		entidad: "compensaciones",
		entidadId: compensacion.id,
		antes: { estado: compensacion.estado },
		despues: {
			estado: "cancelada",
			cuentas_por_cobrar: porCobrar.map(({ cuenta_por_cobrar_id, despues }) => ({
				cuenta_por_cobrar_id,
				saldo_centavos: despues,
			})),
			cuentas_por_pagar: porPagar.cuentas.map(({ cuenta_por_pagar_id, despues }) => ({
				cuenta_por_pagar_id,
				saldo_centavos: despues,
			})),
		},
		confirmadoConGoogleEn: confirmado,
	});
	for (const revisada of porPagar.facturasRevisadas) {
		contexto.bitacora({
			descripcion: revisada.descripcion,
			entidad: "facturas_proveedor",
			entidadId: revisada.factura_proveedor_id,
			entidadFolio: revisada.folio,
			despues: { estado: revisada.estado },
		});
	}
	for (const orden of porPagar.ordenesReabiertas) {
		contexto.bitacora({
			descripcion: `${orden} vuelve a Recibida: se canceló su pago`,
			entidad: "compensaciones",
			entidadId: compensacion.id,
		});
	}
	return {
		resultado: { mensaje: `Compensación con ${tercero} cancelada`, compensacion_id: compensacion.id },
		entidad: { nombre: "compensaciones", id: compensacion.id },
	};
});
