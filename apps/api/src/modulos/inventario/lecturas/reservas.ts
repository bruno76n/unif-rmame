/**
 * Las lecturas de las reservas que usan otros módulos: las piezas libres y lo listo en aduana de un pedido.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («`inventario.libres`») y reservas.md
 * («`inventario.listo_en_aduana`»)
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { libresEn } from "../dominio/reservas.ts";
import { reservas, ubicaciones } from "../tablas.ts";

/** Lo que recibe `inventario.libres`. */
const pedidoDeLibres = z.object({ ubicacion_id: z.uuid(), variante_id: z.uuid() });

/**
 * `inventario.libres`: existencia menos reservas activas de una variante en una ubicación. Puede salir negativo.
 * @param contexto El contexto de la acción.
 * @param datos `ubicacion_id` y `variante_id`.
 */
export async function libres(contexto: ContextoDeAccion, datos: unknown): Promise<{ libres: number }> {
	const { ubicacion_id, variante_id } = pedidoDeLibres.parse(datos);
	return { libres: await libresEn(contexto.transaccion, ubicacion_id, variante_id) };
}

/** Lo que recibe `inventario.listo_en_aduana`. */
const pedidoDeListo = z.object({ pedido_id: z.uuid() });

/**
 * `inventario.listo_en_aduana`: por variante de un pedido externo, lo listo en Aduana sin nota, lo apartado en
 * Bodega y lo que viene en camino a aduana (sus reservas `pedido_externo` activas en cada lugar).
 * @param contexto El contexto de la acción.
 * @param datos `pedido_id`.
 */
export async function listoEnAduana(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ variantes: { variante_id: string; listas: number; de_bodega: number; en_camino: number }[] }> {
	const { pedido_id } = pedidoDeListo.parse(datos);
	const suma = (tipo: string) =>
		sql<number>`coalesce(sum(${reservas.piezas}) FILTER (WHERE ${ubicaciones.tipo} = ${tipo}), 0)`.mapWith(Number);
	const filas = await contexto.transaccion
		.select({
			variante_id: reservas.varianteId,
			listas: suma("aduana"),
			de_bodega: suma("bodega"),
			en_camino: suma("en_camino_aduana"),
		})
		.from(reservas)
		.innerJoin(ubicaciones, eq(ubicaciones.id, reservas.ubicacionId))
		.where(and(eq(reservas.estado, "activa"), eq(reservas.motivo, "pedido_externo"), eq(reservas.pedidoId, pedido_id)))
		.groupBy(reservas.varianteId)
		.orderBy(reservas.varianteId);
	return { variantes: filas };
}
