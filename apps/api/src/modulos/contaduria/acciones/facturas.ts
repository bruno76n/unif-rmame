/**
 * Las facturas de proveedor: capturarlas con sus tres puntas y los precios de su nota, cancelarlas sin pagos y
 * registrar la nota de crédito del proveedor que aclara la diferencia de una autorizada.
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md (reglas 1 a 8, «Acciones»)
 */

import {
	cancelarFacturaProveedor,
	capturarFacturaProveedor,
	registrarNotaCreditoProveedor,
} from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { and, eq, ne } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	bloquearCuentaDeFactura,
	bloquearFactura,
	bloquearOrdenes,
	guardarPuntas,
	nombreDelTercero,
	type OrdenParaFactura,
	ordenesDeFacturas,
	puntasDeOrdenes,
	revisarFacturas,
	tresPuntas,
} from "../dominio/facturas.ts";
import { enPesos } from "../dominio/pagos.ts";
import { cuentasPorPagar, facturaProveedorOrdenes, facturasProveedor } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `compras.registrar_precios_nota`. */
const preciosRegistrados = z.object({
	lineas: z.array(
		z.object({
			orden_compra_linea_id: z.uuid(),
			material: z.string(),
			antes: z.number().int(),
			nuevo: z.number().int(),
			aviso: z.string().optional(),
		}),
	),
});

/** Los estados de una orden a la que no se le captura factura. */
const sinFactura = new Set(["borrador", "cancelada"]);

/**
 * Revisa las órdenes escogidas: que existan, que se les pueda capturar factura y que sean del mismo proveedor.
 * @throws `404` si falta una; `422 orden_no_facturable`; `422 ordenes_de_otro_proveedor`.
 */
function revisarOrdenes(ordenes: readonly OrdenParaFactura[], pedidas: readonly string[]): OrdenParaFactura {
	if (ordenes.length !== pedidas.length) throw noExiste();
	for (const orden of ordenes) {
		if (sinFactura.has(orden.estado)) {
			throw errorDeRegla(
				"orden_no_facturable",
				`${orden.folio} está en borrador o cancelada: no se le captura factura.`,
			);
		}
	}
	const [primera] = ordenes;
	if (primera === undefined) throw noExiste();
	if (ordenes.some((orden) => orden.proveedor_id !== primera.proveedor_id)) {
		throw errorDeRegla("ordenes_de_otro_proveedor", "Todas las órdenes deben ser del mismo proveedor.");
	}
	return primera;
}

/**
 * Lo de cada orden, sin IVA: con una sola orden, el subtotal si no se escribió; con varias, el de cada una, que juntas
 * suman el subtotal (regla 2).
 * @throws `422 importes_no_suman`.
 */
function importesPorOrden(
	ordenes: readonly { orden_compra_id: string; importe_sin_iva_centavos?: number | undefined }[],
	subtotal: number,
): Map<string, number> {
	const importes = new Map<string, number>();
	for (const orden of ordenes) {
		const importe = orden.importe_sin_iva_centavos ?? (ordenes.length === 1 ? subtotal : undefined);
		if (importe === undefined) throw errorDeCampo("ordenes", "Escribe lo de cada orden en pesos");
		importes.set(orden.orden_compra_id, importe);
	}
	const suma = [...importes.values()].reduce((total, importe) => total + importe, 0);
	if (suma !== subtotal) {
		throw errorDeRegla(
			"importes_no_suman",
			`Lo de cada orden suma ${enPesos(suma)} y el subtotal es ${enPesos(subtotal)}.`,
		);
	}
	return importes;
}

/**
 * Revisa que el folio del proveedor y el UUID no estén ya en otra factura (regla 1).
 * @throws `422 folio_repetido`; `422 uuid_repetido`.
 */
async function revisarRepetidos(
	contexto: ContextoDeAccion,
	orden: OrdenParaFactura,
	folioProveedor: string,
	uuidCfdi: string | undefined,
): Promise<void> {
	const [repetida] = await contexto.transaccion
		.select({ folio: facturasProveedor.folio })
		.from(facturasProveedor)
		.where(
			and(
				eq(facturasProveedor.proveedorId, orden.proveedor_id),
				eq(facturasProveedor.folioProveedor, folioProveedor),
				ne(facturasProveedor.estado, "cancelada"),
			),
		);
	if (repetida !== undefined) {
		throw errorDeRegla(
			"folio_repetido",
			`${orden.proveedor} ya tiene la factura ${folioProveedor}: es ${repetida.folio}.`,
		);
	}
	if (uuidCfdi === undefined) return;
	const [conUuid] = await contexto.transaccion
		.select({ folio: facturasProveedor.folio })
		.from(facturasProveedor)
		.where(eq(facturasProveedor.uuidCfdi, uuidCfdi));
	if (conUuid !== undefined) throw errorDeRegla("uuid_repetido", `Ese UUID ya está en ${conUuid.folio}.`);
}

/**
 * Los precios de la nota, primero (regla 3): por orden, las líneas que cobran otro precio pasan a Compras.
 * @returns Las líneas que cambiaron, con su orden.
 * @throws `422 linea_de_otra_orden`.
 */
async function registrarPreciosDeLaNota(
	contexto: ContextoDeAccion,
	ordenes: readonly OrdenParaFactura[],
	precios: readonly { orden_compra_linea_id: string; precio_centavos: number }[],
) {
	const ordenDe = new Map(
		ordenes.flatMap((orden) => orden.lineas.map((linea) => [linea.orden_compra_linea_id, orden] as const)),
	);
	if (precios.some((precio) => !ordenDe.has(precio.orden_compra_linea_id))) {
		throw errorDeRegla("linea_de_otra_orden", "Ese material no es de las órdenes escogidas.");
	}
	const cambiaron: (z.infer<typeof preciosRegistrados>["lineas"][number] & { orden: OrdenParaFactura })[] = [];
	for (const orden of ordenes) {
		const suyas = precios.filter((precio) => ordenDe.get(precio.orden_compra_linea_id) === orden);
		if (suyas.length === 0) continue;
		const { lineas } = preciosRegistrados.parse(
			await contexto.interna("compras.registrar_precios_nota", {
				orden_compra_id: orden.orden_compra_id,
				lineas: suyas,
			}),
		);
		cambiaron.push(...lineas.map((linea) => ({ ...linea, orden })));
	}
	return cambiaron;
}

/**
 * El día en que vence la cuenta de una factura (regla 2 de las cuentas por pagar): la fecha de la factura (o, sin
 * ella, la de captura) más los días de crédito menores de sus órdenes; de contado, ese día.
 * @param fecha La fecha base.
 * @param ordenes Las órdenes, con los días de crédito que se copiaron al enviarlas.
 */
export function venceLaFactura(fecha: string, ordenes: readonly Pick<OrdenParaFactura, "dias_credito">[]): string {
	const dias = Math.min(...ordenes.map((orden) => orden.dias_credito ?? 0));
	return Temporal.PlainDate.from(fecha).add({ days: dias }).toString();
}

export const accionCapturarFacturaProveedor = implementarAccion(capturarFacturaProveedor, async (contexto, datos) => {
	const { transaccion } = contexto;
	const hoy = contexto.diaDeNegocio.toString();
	if (datos.fecha_factura !== undefined && datos.fecha_factura > hoy) {
		throw errorDeCampo("fecha_factura", "La fecha de la factura no puede ser futura");
	}
	if (datos.subtotal_centavos + datos.iva_centavos !== datos.total_centavos) {
		throw errorDeRegla("total_no_suma", "Subtotal más IVA no da el total: revisa los tres.");
	}
	const pedidas = datos.ordenes.map((orden) => orden.orden_compra_id);
	if (new Set(pedidas).size !== pedidas.length) throw errorDeCampo("ordenes", "Cada orden va una sola vez");
	const importes = importesPorOrden(datos.ordenes, datos.subtotal_centavos);
	// Las órdenes, bloqueadas en orden de id: sus facturas se capturan y se revisan una a la vez.
	const ordenes = await bloquearOrdenes(contexto, pedidas);
	const proveedor = revisarOrdenes(ordenes, pedidas);
	await revisarRepetidos(contexto, proveedor, datos.folio_proveedor, datos.uuid_cfdi);
	const precios = await registrarPreciosDeLaNota(contexto, ordenes, datos.precios_nota ?? []);
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "factura_proveedor" }));
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(facturasProveedor).values({
		id,
		folio,
		folioProveedor: datos.folio_proveedor,
		uuidCfdi: datos.uuid_cfdi ?? null,
		proveedorId: proveedor.proveedor_id,
		terceroId: proveedor.tercero_id,
		fechaCaptura: hoy,
		fechaFactura: datos.fecha_factura ?? null,
		subtotalCentavos: datos.subtotal_centavos,
		ivaCentavos: datos.iva_centavos,
		totalFacturadoCentavos: datos.total_centavos,
		valorRecibidoCentavos: 0,
		estado: "conciliada",
		archivoXmlId: datos.archivo_xml_id ?? null,
		archivoPdfId: datos.archivo_pdf_id ?? null,
		creadoPor: quien,
	});
	await transaccion.insert(facturaProveedorOrdenes).values(
		ordenes.map((orden) => ({
			id: uuidv7(),
			facturaProveedorId: id,
			ordenCompraId: orden.orden_compra_id,
			importeFacturadoCentavos: importes.get(orden.orden_compra_id) ?? 0,
			valorRecibidoCentavos: 0,
			sinRecepcion: false,
			creadoPor: quien,
		})),
	);
	// Las tres puntas, con los precios ya corregidos y después de las facturas que se capturaron antes.
	const puntas = (await puntasDeOrdenes(contexto, ordenes)).get(id) ?? [];
	const resultado = tresPuntas(datos.subtotal_centavos, puntas);
	await guardarPuntas(transaccion, { id }, puntas, resultado);
	await transaccion.insert(cuentasPorPagar).values({
		id: uuidv7(),
		terceroId: proveedor.tercero_id,
		tipo: "proveedor",
		facturaProveedorId: id,
		fecha: hoy,
		vence: venceLaFactura(datos.fecha_factura ?? hoy, ordenes),
		importeCentavos: datos.total_centavos,
		saldoCentavos: datos.total_centavos,
		estado: resultado.estado === "detenida" ? "detenida" : "por_pagar",
		creadoPor: quien,
	});
	for (const archivo of [datos.archivo_xml_id, datos.archivo_pdf_id]) {
		if (archivo === undefined) continue;
		await contexto.interna("admin.ligar_archivo", {
			archivo_id: archivo,
			proposito: "factura_proveedor",
			modulo: "contaduria",
			entidad: "facturas_proveedor",
			entidad_id: id,
		});
	}
	const tablas = ["facturas_proveedor", "factura_proveedor_ordenes", "cuentas_por_pagar"];
	contexto.guardarEvento({
		tipo: "factura_proveedor.capturada",
		datos: { factura_proveedor_id: id },
		tablas,
		entidad: "facturas_proveedor",
		entidadId: id,
		entidadFolio: folio,
	});
	if (resultado.estado === "detenida") {
		contexto.guardarEvento({
			tipo: "factura_proveedor.detenida",
			datos: { factura_proveedor_id: id },
			tablas,
			entidad: "facturas_proveedor",
			entidadId: id,
			entidadFolio: folio,
		});
	}
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} capturó la factura ${folio} de ${proveedor.proveedor}`,
		entidad: "facturas_proveedor",
		entidadId: id,
		entidadFolio: folio,
		despues: {
			folio_proveedor: datos.folio_proveedor,
			total_centavos: datos.total_centavos,
			valor_recibido_centavos: resultado.valorRecibido,
			estado: resultado.estado,
			...(resultado.motivo === null ? {} : { motivo: resultado.motivo }),
		},
	});
	for (const precio of precios) {
		contexto.bitacora({
			descripcion: `Precio de ${precio.material} con ${proveedor.proveedor}: ${enPesos(precio.antes)} → ${enPesos(precio.nuevo)} (${precio.orden.folio}, según la nota)`,
			entidad: "orden_compra_lineas",
			entidadId: precio.orden_compra_linea_id,
			entidadFolio: precio.orden.folio,
			antes: { precio_centavos: precio.antes },
			despues: { precio_centavos: precio.nuevo },
		});
	}
	const nuevos =
		precios.length === 0
			? ""
			: `. Precio nuevo: ${precios.map((precio) => `${precio.material} a ${enPesos(precio.nuevo)}`).join(", ")}`;
	return {
		resultado: {
			mensaje:
				resultado.estado === "conciliada"
					? `${folio} conciliada con la orden y la recepción${nuevos}`
					: `${folio} registrada con diferencias: pago detenido${nuevos}`,
			factura_proveedor_id: id,
			folio,
			estado: resultado.estado,
		},
		avisos: precios.flatMap((precio) => (precio.aviso === undefined ? [] : [precio.aviso])),
		entidad: { nombre: "facturas_proveedor", id },
	};
});

export const accionCancelarFacturaProveedor = implementarAccion(
	cancelarFacturaProveedor,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		await revisarMotivo(contexto, datos.motivo);
		const { motivo } = datos;
		// Sus órdenes primero, luego la factura y su cuenta: el orden de los candados.
		const ordenIds = await ordenesDeFacturas(transaccion, [datos.factura_proveedor_id]);
		const ordenes = await bloquearOrdenes(contexto, ordenIds);
		const factura = await bloquearFactura(transaccion, datos.factura_proveedor_id);
		await tomarVersion(contexto, facturasProveedor, factura.id, version, async () => ({
			factura_proveedor_id: factura.id,
			estado: factura.estado,
		}));
		const cuenta = await bloquearCuentaDeFactura(transaccion, factura.id);
		if (cuenta.saldoCentavos < cuenta.importeCentavos) {
			throw errorDeRegla("factura_con_pagos", `${factura.folio} ya tiene pagos: no se puede cancelar.`);
		}
		if (factura.estado !== "detenida" && factura.estado !== "conciliada") {
			throw errorDeRegla("factura_no_cancelable", "Solo se cancela una factura detenida o lista para pagar.");
		}
		const quien = quienCambia(contexto);
		const cancelacion = { canceladoEn: contexto.ahora.toString(), canceladoPor: quien, motivoCancelacion: motivo };
		await transaccion
			.update(facturasProveedor)
			.set({ estado: "cancelada", ...cancelacion })
			.where(eq(facturasProveedor.id, factura.id));
		await transaccion
			.update(cuentasPorPagar)
			.set({ estado: "cancelada", ...cancelacion })
			.where(eq(cuentasPorPagar.id, cuenta.id));
		// Las facturas de esas órdenes que se capturaron después ya no las cubre esta (regla 7).
		const revisadas = await revisarFacturas(contexto, ordenIds, `al cancelar ${factura.folio}`);
		contexto.guardarEvento({
			tipo: "factura_proveedor.cancelada",
			datos: { factura_proveedor_id: factura.id },
			tablas: ["facturas_proveedor", "cuentas_por_pagar"],
			entidad: "facturas_proveedor",
			entidadId: factura.id,
			entidadFolio: factura.folio,
		});
		const proveedor = ordenes[0]?.proveedor ?? "";
		contexto.bitacora({
			descripcion: `${await nombreDeCuenta(contexto, quien)} canceló la factura ${factura.folio} de ${proveedor}: ${motivo}`,
			entidad: "facturas_proveedor",
			entidadId: factura.id,
			entidadFolio: factura.folio,
			antes: { estado: factura.estado },
			despues: { estado: "cancelada" },
		});
		for (const revisada of revisadas) {
			contexto.bitacora({
				descripcion: revisada.descripcion,
				entidad: "facturas_proveedor",
				entidadId: revisada.factura_proveedor_id,
				entidadFolio: revisada.folio,
				despues: { estado: revisada.estado },
			});
		}
		return {
			resultado: { mensaje: `${factura.folio} cancelada`, factura_proveedor_id: factura.id },
			entidad: { nombre: "facturas_proveedor", id: factura.id },
		};
	},
);

export const accionRegistrarNotaCreditoProveedor = implementarAccion(
	registrarNotaCreditoProveedor,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const factura = await bloquearFactura(transaccion, datos.factura_proveedor_id);
		await tomarVersion(contexto, facturasProveedor, factura.id, version, async () => ({
			factura_proveedor_id: factura.id,
			estado: factura.estado,
		}));
		if (factura.notaCreditoProveedor !== null) {
			throw errorDeRegla(
				"diferencia_ya_aclarada",
				`La diferencia de ${factura.folio} ya se aclaró con ${factura.notaCreditoProveedor}.`,
			);
		}
		if (factura.estado !== "autorizada") {
			throw errorDeRegla(
				"factura_no_autorizada",
				"Solo una factura autorizada por Dirección tiene diferencia por aclarar.",
			);
		}
		const quien = quienCambia(contexto);
		await transaccion
			.update(facturasProveedor)
			.set({
				notaCreditoProveedor: datos.folio_nota,
				diferenciaAclaradaEn: contexto.ahora.toString(),
				diferenciaAclaradaPor: quien,
				diferenciaAclaradaArchivoId: datos.archivo_id ?? null,
			})
			.where(eq(facturasProveedor.id, factura.id));
		if (datos.archivo_id !== undefined) {
			await contexto.interna("admin.ligar_archivo", {
				archivo_id: datos.archivo_id,
				proposito: "factura_proveedor",
				modulo: "contaduria",
				entidad: "facturas_proveedor",
				entidad_id: factura.id,
			});
		}
		contexto.guardarEvento({
			tipo: "factura_proveedor.diferencia_aclarada",
			datos: { factura_proveedor_id: factura.id },
			tablas: ["facturas_proveedor"],
			entidad: "facturas_proveedor",
			entidadId: factura.id,
			entidadFolio: factura.folio,
		});
		const proveedor = await nombreDelTercero(transaccion, factura.terceroId);
		contexto.bitacora({
			descripcion: `${await nombreDeCuenta(contexto, quien)} registró la nota de crédito ${datos.folio_nota} de ${proveedor} para ${factura.folio}`,
			entidad: "facturas_proveedor",
			entidadId: factura.id,
			entidadFolio: factura.folio,
			despues: { nota_credito_proveedor: datos.folio_nota },
		});
		return {
			resultado: {
				mensaje: `Diferencia de ${factura.folio} aclarada con ${datos.folio_nota}`,
				factura_proveedor_id: factura.id,
			},
			entidad: { nombre: "facturas_proveedor", id: factura.id },
		};
	},
);
