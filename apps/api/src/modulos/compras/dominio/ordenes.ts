/**
 * Lo que comparten las acciones, las internas y las lecturas de las órdenes de compra: leer la orden con candado,
 * sus líneas con su material, revisar una línea y la fecha prometida, lo recibido y sus eventos.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md (reglas 3, 6, 7, 8, 10 y 16)
 *
 * Lo recibido de cada línea no se guarda aquí: lo da `inventario.recibido_de_ordenes` (fase 11). Sin esa lectura
 * (un servidor sin el módulo de inventario), nada está recibido.
 */

import { fallaDeCantidad } from "@uniformame/compartido/calculos/compras";
import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { listaDeUnidades } from "../siembra.ts";
import { materiales, ordenCompraLineas, ordenesCompra } from "../tablas.ts";
import { leerMaterial, leerProveedor } from "./comunes.ts";

/** Una orden como se guarda, con el nombre de su proveedor. */
export type Orden = typeof ordenesCompra.$inferSelect & { proveedor: string };

/** Una línea con su material. */
export interface LineaDeOrden {
	id: string;
	materialId: string;
	material: string;
	unidad: string;
	/** `tela`, `avio` o `consumible`. */
	tipo: string;
	/** Si su unidad se cuenta entera (conos, piezas). */
	seCuentaEntera: boolean;
	multiploCompra: string;
	cantidad: string;
	precioOrdenCentavos: number;
	precioNotaCentavos: number | null;
}

/** Lo que regresa `inventario.recibido_de_ordenes`: por línea, lo recibido menos lo devuelto; por orden, sus recepciones. */
export const recibidoDeOrdenes = z.object({
	lineas: z.record(z.string(), z.string()),
	recepciones: z.record(z.string(), z.array(z.object({ recepcion_id: z.uuid(), dia: z.iso.date() }))),
});

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
			tipo: materiales.tipo,
			seCuentaEntera: sql<boolean>`coalesce(${listaValores.seCuentaEntera}, false)`,
			multiploCompra: materiales.multiploCompra,
			cantidad: ordenCompraLineas.cantidad,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
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
 * Revisa la cantidad de una línea con `fallaDeCantidad` del paquete compartido: hasta `compras.cantidad_maxima_linea` y
 * múltiplo de lo que se compra junto.
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
	const falla = fallaDeCantidad(cantidad, {
		multiplo: Number(material.multiploCompra),
		maxima: await parametroNumero(contexto, "compras.cantidad_maxima_linea"),
		unidad: material.unidad,
	});
	if (falla !== null) throw errorDeRegla(falla.codigo, falla.mensaje);
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
 * `inventario.recibido_de_ordenes`. Sin esa lectura, nada está recibido.
 * @param contexto El contexto de quien pregunta.
 * @param lineaIds Las líneas.
 * @returns Por línea, lo recibido en milésimos de su unidad.
 */
export async function recibidoDeLineas(
	contexto: ContextoDeAccion,
	lineaIds: readonly string[],
): Promise<Map<string, bigint>> {
	const nada = new Map(lineaIds.map((id) => [id, 0n]));
	if (lineaIds.length === 0 || !contexto.hayLectura("inventario.recibido_de_ordenes")) return nada;
	const { lineas } = recibidoDeOrdenes.parse(
		await contexto.lectura("inventario.recibido_de_ordenes", { orden_compra_linea_ids: lineaIds }),
	);
	return new Map(lineaIds.map((id) => [id, aMilesimosConSigno(lineas[id] ?? "0")]));
}

/**
 * Lo que falta de cada línea: lo pedido menos lo recibido, en milésimos, nunca menos de cero.
 * @param contexto El contexto de quien pregunta.
 * @param lineas Las líneas.
 */
export async function faltanteDeLineas(
	contexto: ContextoDeAccion,
	lineas: readonly Pick<LineaDeOrden, "id" | "cantidad">[],
): Promise<Map<string, bigint>> {
	const recibidas = await recibidoDeLineas(
		contexto,
		lineas.map((linea) => linea.id),
	);
	return new Map(
		lineas.map((linea) => {
			const falta = aMilesimosConSigno(linea.cantidad) - (recibidas.get(linea.id) ?? 0n);
			return [linea.id, falta > 0n ? falta : 0n];
		}),
	);
}

/**
 * Bloquea los materiales de una orden en el orden de su id, antes de bloquear la orden: sus proveedores y su último
 * precio son parte del material. Es el mismo orden de `levantar_orden` (los materiales y luego el borrador), así que
 * nunca se cruzan.
 * @param contexto El contexto de la acción.
 * @param ordenId La orden.
 */
export async function bloquearMaterialesDeOrden(contexto: ContextoDeAccion, ordenId: string): Promise<void> {
	const suyos = await contexto.transaccion
		.selectDistinct({ materialId: ordenCompraLineas.materialId })
		.from(ordenCompraLineas)
		.where(eq(ordenCompraLineas.ordenCompraId, ordenId))
		.orderBy(asc(ordenCompraLineas.materialId));
	for (const { materialId } of suyos) await leerMaterial(contexto, materialId);
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

/**
 * Una entrega de un proveedor: una recepción de una de sus órdenes, los días que tardó desde que se envió y si llegó a
 * tiempo (lo que dice hoy que tarda, o menos). La pantalla de Proveedores (fase 19) las cuenta.
 */
export interface Entrega {
	ordenCompraId: string;
	recepcionId: string;
	dias: number;
	aTiempo: boolean;
}

/**
 * Las entregas y el plazo real de unos proveedores: cada recepción de sus órdenes es una entrega, y tardó el día
 * de la recepción menos el día (en hora de México) en que se envió su orden. El plazo real es el promedio redondeado;
 * sin entregas, lo que dice que tarda.
 * Fase 11 · docs/modulos/compras/proveedores-y-precios.md (reglas 5 y 6)
 * @param contexto El contexto de quien lee.
 * @param proveedores Los proveedores, con lo que dice cada uno que tarda.
 * @returns Por proveedor, su plazo real, si está fuera de plazo (su plazo real pasa de lo que dice) y sus entregas.
 */
export async function plazosReales(
	contexto: ContextoDeAccion,
	proveedores: readonly { id: string; diasDiceTardar: number }[],
): Promise<Map<string, { plazo: number; fueraDePlazo: boolean; entregas: Entrega[] }>> {
	const resultado = new Map(
		proveedores.map((proveedor) => [
			proveedor.id,
			{ plazo: proveedor.diasDiceTardar, fueraDePlazo: false, entregas: [] as Entrega[] },
		]),
	);
	const dicen = new Map(proveedores.map((proveedor) => [proveedor.id, proveedor.diasDiceTardar]));
	if (proveedores.length === 0 || !contexto.hayLectura("inventario.recibido_de_ordenes")) return resultado;
	const enviadas = await contexto.transaccion
		.select({ id: ordenesCompra.id, proveedorId: ordenesCompra.proveedorId, enviadaEn: ordenesCompra.enviadaEn })
		.from(ordenesCompra)
		.where(
			and(
				inArray(
					ordenesCompra.proveedorId,
					proveedores.map((proveedor) => proveedor.id),
				),
				isNotNull(ordenesCompra.enviadaEn),
			),
		);
	if (enviadas.length === 0) return resultado;
	const { recepciones } = recibidoDeOrdenes.parse(
		await contexto.lectura("inventario.recibido_de_ordenes", { orden_compra_ids: enviadas.map((orden) => orden.id) }),
	);
	for (const orden of enviadas) {
		if (orden.enviadaEn === null) continue;
		const enviadaEl = diaDeNegocio(Temporal.Instant.from(orden.enviadaEn));
		for (const recepcion of recepciones[orden.id] ?? []) {
			const dias = enviadaEl.until(Temporal.PlainDate.from(recepcion.dia)).days;
			const dice = dicen.get(orden.proveedorId) ?? 0;
			resultado
				.get(orden.proveedorId)
				?.entregas.push({ ordenCompraId: orden.id, recepcionId: recepcion.recepcion_id, dias, aTiempo: dias <= dice });
		}
	}
	for (const [id, suyo] of resultado) {
		if (suyo.entregas.length === 0) continue;
		const total = suyo.entregas.reduce((suma, entrega) => suma + entrega.dias, 0);
		suyo.plazo = Math.round(total / suyo.entregas.length);
		suyo.fueraDePlazo = suyo.plazo > (dicen.get(id) ?? 0);
	}
	return resultado;
}
