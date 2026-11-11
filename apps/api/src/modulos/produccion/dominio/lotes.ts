/**
 * Lo que comparten la orden que levanta Producción y las internas de Ventas: la prenda que se fabrica, sus tallas, y
 * la orden y el lote que nacen.
 * Fase 12 · docs/modulos/produccion/ordenes-de-produccion.md (reglas 1, 4 y 5) y lotes.md (reglas 1 y 4)
 *
 * La orden y el lote no llevan dinero ni movimiento: solo dicen qué se fabrica, para quién y cuándo.
 */

import { and, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../../catalogo/tablas.ts";
import { type etapasDeLote, lotes, loteTallas, type motivosDeOrden, ordenesProduccion } from "../tablas.ts";

/** El aviso de una prenda que entra sin receta. */
export const avisoSinReceta = "Falta la receta: no se corta hasta que Patronaje la capture";

/** Una prenda que se fabrica: su nombre y si ya tiene receta. */
export interface PrendaQueSeFabrica {
	id: string;
	nombre: string;
	tieneReceta: boolean;
}

/**
 * Revisa que una prenda pase por el taller: activa, que no sea un servicio y con flujo (regla 4). La lee con
 * `FOR SHARE`: mientras nace su lote, nadie la da de baja ni le quita el flujo.
 * @throws `400` si no existe; `422 prenda_no_se_fabrica`: «{prenda} no pasa por el taller.».
 */
export async function prendaQueSeFabrica(contexto: ContextoDeAccion, productoId: string): Promise<PrendaQueSeFabrica> {
	const [prenda] = await contexto.transaccion
		.select({
			id: productos.id,
			nombre: productos.nombre,
			bajaEn: productos.bajaEn,
			esServicio: productos.esServicio,
			flujoId: productos.flujoId,
		})
		.from(productos)
		.where(eq(productos.id, productoId))
		.for("share");
	if (prenda === undefined) throw errorDeCampo("producto_id", "Escoge la prenda.");
	if (prenda.bajaEn !== null || prenda.esServicio || prenda.flujoId === null) {
		throw errorDeRegla("prenda_no_se_fabrica", `${prenda.nombre} no pasa por el taller.`);
	}
	const receta = z
		.object({ tiene_receta: z.boolean() })
		.parse(await contexto.lectura("patronaje.receta_cubre_tallas", { producto_id: prenda.id, talla_ids: [] }));
	return { id: prenda.id, nombre: prenda.nombre, tieneReceta: receta.tiene_receta };
}

/** Las piezas de una talla. */
export interface PiezasDeTalla {
	varianteId: string;
	piezas: number;
}

/**
 * Revisa las tallas que se fabrican: de esa prenda y no descontinuadas (regla 5). Junta las repetidas.
 * @returns Las que llevan piezas, en el orden en que llegaron.
 * @throws `400` «Esa talla no es de {prenda}.»; `422 talla_descontinuada`: «La talla {t} ya no se fabrica.».
 */
export async function tallasQueSeFabrican(
	contexto: ContextoDeAccion,
	prenda: PrendaQueSeFabrica,
	pedidas: readonly PiezasDeTalla[],
): Promise<PiezasDeTalla[]> {
	const juntas = new Map<string, number>();
	for (const { varianteId, piezas } of pedidas) juntas.set(varianteId, (juntas.get(varianteId) ?? 0) + piezas);
	const ids = [...juntas.keys()];
	const suyas =
		ids.length === 0
			? []
			: await contexto.transaccion
					.select({
						id: variantes.id,
						productoId: variantes.productoId,
						descontinuadaEn: variantes.descontinuadaEn,
						bajaEn: variantes.bajaEn,
						talla: tallas.nombre,
					})
					.from(variantes)
					.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
					.where(inArray(variantes.id, ids));
	for (const id of ids) {
		const suya = suyas.find((variante) => variante.id === id);
		if (suya === undefined || suya.productoId !== prenda.id) {
			throw errorDeCampo("tallas", `Esa talla no es de ${prenda.nombre}.`);
		}
		if ((suya.descontinuadaEn !== null || suya.bajaEn !== null) && (juntas.get(id) ?? 0) > 0) {
			throw errorDeRegla("talla_descontinuada", `La talla ${suya.talla} ya no se fabrica.`);
		}
	}
	return [...juntas].flatMap(([varianteId, piezas]) => (piezas > 0 ? [{ varianteId, piezas }] : []));
}

/** Toma un folio del servidor (OP- o L-). */
async function tomarFolio(contexto: ContextoDeAccion, tipo: "orden_produccion" | "lote"): Promise<string> {
	return z.object({ folio: z.string() }).parse(await contexto.interna("admin.tomar_folio", { tipo })).folio;
}

/** Lo que dice una orden nueva. */
export interface OrdenNueva {
	motivo: (typeof motivosDeOrden)[number];
	pedidoId?: string;
	pedidoVersionId?: string;
	ubicacionDestinoId?: string;
	referencia?: string;
	fechaEntrega: string;
}

/**
 * Crea una orden abierta con la fecha de hoy y guarda `orden_produccion.creada`.
 * @returns Su id y su folio.
 */
export async function nuevaOrden(
	contexto: ContextoDeAccion,
	orden: OrdenNueva,
): Promise<{ id: string; folio: string }> {
	const id = uuidv7();
	const folio = await tomarFolio(contexto, "orden_produccion");
	await contexto.transaccion.insert(ordenesProduccion).values({
		id,
		folio,
		motivo: orden.motivo,
		pedidoId: orden.pedidoId ?? null,
		pedidoVersionId: orden.pedidoVersionId ?? null,
		ubicacionDestinoId: orden.ubicacionDestinoId ?? null,
		referencia: orden.referencia ?? null,
		fecha: contexto.diaDeNegocio.toString(),
		fechaEntrega: orden.fechaEntrega,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "orden_produccion.creada",
		datos: { orden_produccion_id: id },
		tablas: ["ordenes_produccion"],
		entidad: "ordenes_produccion",
		entidadId: id,
		entidadFolio: folio,
	});
	return { id, folio };
}

/** Lo que dice un lote nuevo. */
export interface LoteNuevo {
	ordenProduccionId: string;
	productoId: string;
	destino: "pedido" | "tienda" | "temporada";
	pedidoId?: string;
	ubicacionDestinoId?: string;
	fechaCorte: string;
	fechaEntrega: string;
	tallas: readonly PiezasDeTalla[];
}

/**
 * Crea un lote por cortar con sus tallas planeadas y guarda `lote.creado`.
 * @returns Su id y su folio.
 */
export async function nuevoLote(contexto: ContextoDeAccion, lote: LoteNuevo): Promise<{ id: string; folio: string }> {
	const id = uuidv7();
	const folio = await tomarFolio(contexto, "lote");
	const quien = quienCambia(contexto);
	await contexto.transaccion.insert(lotes).values({
		id,
		folio,
		ordenProduccionId: lote.ordenProduccionId,
		productoId: lote.productoId,
		destino: lote.destino,
		pedidoId: lote.pedidoId ?? null,
		ubicacionDestinoId: lote.ubicacionDestinoId ?? null,
		fechaCorte: lote.fechaCorte,
		fechaEntrega: lote.fechaEntrega,
		creadoPor: quien,
	});
	await contexto.transaccion.insert(loteTallas).values(
		lote.tallas.map((talla) => ({
			id: uuidv7(),
			loteId: id,
			varianteId: talla.varianteId,
			piezasPlaneadas: talla.piezas,
			creadoPor: quien,
		})),
	);
	contexto.guardarEvento({
		tipo: "lote.creado",
		datos: { lote_id: id },
		tablas: ["lotes", "lote_tallas"],
		entidad: "lotes",
		entidadId: id,
		entidadFolio: folio,
	});
	return { id, folio };
}

/** Los lotes de un pedido en las etapas que se piden, bloqueados para cambiarlos. */
export function lotesDelPedido(
	contexto: ContextoDeAccion,
	pedidoId: string,
	etapas: readonly (typeof etapasDeLote)[number][],
) {
	return contexto.transaccion
		.select()
		.from(lotes)
		.where(and(eq(lotes.pedidoId, pedidoId), inArray(lotes.estado, [...etapas])))
		.orderBy(lotes.id)
		.for("update");
}
