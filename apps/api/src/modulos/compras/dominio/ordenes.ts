/**
 * Lo que comparten las acciones, las internas y las lecturas de las órdenes de compra: leer la orden con candado,
 * sus líneas con su material, revisar una línea y la fecha prometida, lo recibido, la versión y sus eventos.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md (reglas 3, 6, 7, 8, 10 y 16)
 *
 * Lo recibido de cada línea no se guarda aquí: lo da `inventario.recibido_de_ordenes`, que llega con Aduana en la
 * fase 11. Hasta entonces nada está recibido.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { materiales, ordenCompraLineas, ordenesCompra } from "../tablas.ts";
import { leerProveedor, parametroNumero } from "./comunes.ts";

/** Una orden como se guarda, con el nombre de su proveedor. */
export type Orden = typeof ordenesCompra.$inferSelect & { proveedor: string };

/** Una línea con su material. */
export interface LineaDeOrden {
	id: string;
	materialId: string;
	material: string;
	unidad: string;
	multiploCompra: string;
	cantidad: string;
	precioOrdenCentavos: number;
	precioNotaCentavos: number | null;
}

/** Lo que regresa `inventario.recibido_de_ordenes`: por línea, lo recibido menos lo devuelto. */
const recibido = z.record(z.string(), z.string());

/**
 * Lee una orden con el nombre de su proveedor y la bloquea.
 * @throws `404` si no existe.
 */
export async function leerOrden(contexto: ContextoDeAccion, id: string): Promise<Orden> {
	const [orden] = await contexto.transaccion.select().from(ordenesCompra).where(eq(ordenesCompra.id, id)).for("update");
	if (orden === undefined) throw noExiste();
	const proveedor = await leerProveedor(contexto, orden.proveedorId, "share");
	return { ...orden, proveedor: proveedor.nombre };
}

/**
 * Las líneas de unas órdenes, con su material, en el orden del nombre del material.
 * @param transaccion La transacción.
 * @param ordenIds Las órdenes.
 */
export async function lineasDeOrdenes(
	transaccion: Transaccion,
	ordenIds: readonly string[],
): Promise<(LineaDeOrden & { ordenCompraId: string })[]> {
	if (ordenIds.length === 0) return [];
	return transaccion
		.select({
			id: ordenCompraLineas.id,
			ordenCompraId: ordenCompraLineas.ordenCompraId,
			materialId: ordenCompraLineas.materialId,
			material: materiales.nombre,
			unidad: materiales.unidad,
			multiploCompra: materiales.multiploCompra,
			cantidad: ordenCompraLineas.cantidad,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.where(inArray(ordenCompraLineas.ordenCompraId, [...ordenIds]))
		.orderBy(asc(materiales.nombre));
}

/**
 * El precio vigente de una línea: el de la nota, si cobró otro, o el de la orden.
 * @param linea La línea.
 */
export function precioVigente(linea: Pick<LineaDeOrden, "precioOrdenCentavos" | "precioNotaCentavos">): number {
	return linea.precioNotaCentavos ?? linea.precioOrdenCentavos;
}

/**
 * Revisa la cantidad de una línea: hasta `compras.cantidad_maxima_linea` y múltiplo de lo que se compra junto.
 * @param contexto El contexto de la acción.
 * @param material El material, con su unidad y su múltiplo.
 * @param cantidad La cantidad, entera.
 * @throws `422 cantidad_demasiada` («Es demasiado: revisa la cantidad»); `422 no_es_multiplo` («Se compra de {n} en
 * {n} {unidad}. Prueba con {cantidad más cercana}»).
 */
export async function revisarCantidad(
	contexto: ContextoDeAccion,
	material: { unidad: string; multiploCompra: string },
	cantidad: number,
): Promise<void> {
	if (cantidad > (await parametroNumero(contexto, "compras.cantidad_maxima_linea"))) {
		throw errorDeRegla("cantidad_demasiada", "Es demasiado: revisa la cantidad");
	}
	const multiplo = Number(material.multiploCompra);
	if (cantidad % multiplo !== 0) {
		const cercana = Math.max(multiplo, Math.round(cantidad / multiplo) * multiplo);
		throw errorDeRegla(
			"no_es_multiplo",
			`Se compra de ${multiplo} en ${multiplo} ${material.unidad}. Prueba con ${cercana}`,
		);
	}
}

/**
 * Revisa la fecha prometida: de hoy a hoy más `compras.dias_max_fecha_prometida` días.
 * @throws `400` en `fecha_prometida`: «La fecha no puede ser anterior a hoy» o «Es muy lejana: máximo {n} días».
 */
export async function revisarFechaPrometida(contexto: ContextoDeAccion, fecha: string): Promise<void> {
	const dia = Temporal.PlainDate.from(fecha);
	if (Temporal.PlainDate.compare(dia, contexto.diaDeNegocio) < 0) {
		throw errorDeCampo("fecha_prometida", "La fecha no puede ser anterior a hoy");
	}
	const maximo = await parametroNumero(contexto, "compras.dias_max_fecha_prometida");
	if (Temporal.PlainDate.compare(dia, contexto.diaDeNegocio.add({ days: maximo })) > 0) {
		throw errorDeCampo("fecha_prometida", `Es muy lejana: máximo ${maximo} días`);
	}
}

/**
 * Lo recibido de unas líneas: lo que Aduana recibió menos lo que se devolvió al proveedor, de
 * `inventario.recibido_de_ordenes`. Mientras esa lectura no existe (hasta la fase 11), nada está recibido.
 * @param contexto El contexto de quien pregunta.
 * @param lineaIds Las líneas.
 * @returns Por línea, lo recibido en milésimos de su unidad.
 */
export async function recibidoDeLineas(
	contexto: ContextoDeAccion,
	lineaIds: readonly string[],
): Promise<Map<string, number>> {
	const nada = new Map(lineaIds.map((id) => [id, 0]));
	if (lineaIds.length === 0 || !contexto.hayLectura("inventario.recibido_de_ordenes")) return nada;
	const leido = recibido.parse(
		await contexto.lectura("inventario.recibido_de_ordenes", { orden_compra_linea_ids: lineaIds }),
	);
	return new Map(lineaIds.map((id) => [id, Math.round(Number(leido[id] ?? "0") * 1000)]));
}

/**
 * Lo que falta de cada línea: lo pedido menos lo recibido, en milésimos, nunca menos de cero.
 * @param contexto El contexto de quien pregunta.
 * @param lineas Las líneas.
 */
export async function faltanteDeLineas(
	contexto: ContextoDeAccion,
	lineas: readonly Pick<LineaDeOrden, "id" | "cantidad">[],
): Promise<Map<string, number>> {
	const recibidas = await recibidoDeLineas(
		contexto,
		lineas.map((linea) => linea.id),
	);
	return new Map(
		lineas.map((linea) => [
			linea.id,
			Math.max(0, Math.round(Number(linea.cantidad) * 1000) - (recibidas.get(linea.id) ?? 0)),
		]),
	);
}

/**
 * Sube la versión de la orden: cualquier cambio en sus líneas cambia el agregado.
 * @param transaccion La transacción.
 * @param ordenId La orden.
 */
export async function subirVersionDeOrden(transaccion: Transaccion, ordenId: string): Promise<void> {
	await transaccion.execute(
		sql`UPDATE ${ordenesCompra} SET actualizado_en = now(), version = nextval('public.version_global') WHERE id = ${ordenId}`,
	);
}

/** Los eventos de una orden. */
export type EventoDeOrden =
	| "orden_compra.levantada"
	| "orden_compra.cambiada"
	| "orden_compra.enviada"
	| "orden_compra.cancelada"
	| "orden_compra.cerrada_con_faltante"
	| "orden_compra.recibida"
	| "orden_compra.reabierta";

/**
 * Guarda un evento de una orden.
 * @param contexto El contexto de la acción.
 * @param tipo El evento.
 * @param orden La orden.
 */
export function eventoDeOrden(contexto: ContextoDeAccion, tipo: EventoDeOrden, orden: { id: string; folio: string }) {
	contexto.guardarEvento({
		tipo,
		datos: { orden_compra_id: orden.id },
		tablas: ["ordenes_compra", "orden_compra_lineas"],
		entidad: "ordenes_compra",
		entidadId: orden.id,
		entidadFolio: orden.folio,
	});
}

/** Los estados de una orden abierta: en borrador, enviada o recibida en parte. */
export const ordenesAbiertas = ["borrador", "enviada", "recibida_en_parte"] as const;

/**
 * Las órdenes abiertas (en borrador, enviadas o recibidas en parte) que cumplen un filtro, por folio.
 * @param contexto El contexto de la acción.
 * @param filtro Las órdenes de un proveedor, o con un material.
 */
export async function foliosDeOrdenesAbiertas(
	contexto: ContextoDeAccion,
	filtro: { proveedorId?: string; materialId?: string; estados?: readonly string[] },
): Promise<string[]> {
	const estados = [...(filtro.estados ?? ordenesAbiertas)];
	const filas = await contexto.transaccion
		.selectDistinct({ folio: ordenesCompra.folio })
		.from(ordenesCompra)
		.leftJoin(ordenCompraLineas, eq(ordenCompraLineas.ordenCompraId, ordenesCompra.id))
		.where(
			and(
				inArray(ordenesCompra.estado, estados),
				filtro.proveedorId === undefined ? undefined : eq(ordenesCompra.proveedorId, filtro.proveedorId),
				filtro.materialId === undefined ? undefined : eq(ordenCompraLineas.materialId, filtro.materialId),
			),
		)
		.orderBy(asc(ordenesCompra.folio));
	return filas.map((fila) => fila.folio);
}
