/**
 * Las lecturas de los lotes: lo que un pedido tiene en producción, los lotes por cortar y los lotes sin terminar de
 * una talla.
 * Fase 12 · docs/modulos/produccion/lotes.md («Lecturas», regla 9)
 *
 * Ninguna lleva tarifas ni costos. Lo que un pedido tiene en reproceso se suma con Calidad (fase 13).
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { variantes } from "../../catalogo/tablas.ts";
import { cortes, corteTelas, lotes, loteTallas } from "../tablas.ts";

/** Las etapas en que un lote ya se cortó y sigue en el taller. */
const cortadoEnElTaller = ["en_proceso", "terminado", "revisado"] as const;

/**
 * `produccion.piezas_en_produccion`: por talla, lo que el pedido tiene en producción: las planeadas de sus lotes por
 * cortar, las cortadas − merma − las que van a Bodega de los que ya se cortaron, sin los que llegaron a aduana o se
 * cancelaron, y las de los reprocesos de los que ya llegaron a aduana (`calidad.en_reproceso_de_pedido`): antes de
 * aduana, lo rechazado sigue contado en su lote (regla 9, decisión 621).
 * @param contexto El contexto de quien lee (Ventas).
 * @param datos `pedido_id`.
 * @returns Por variante, sus piezas.
 */
export async function piezasEnProduccion(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = z.object({ pedido_id: z.uuid() }).parse(datos);
	const filas = await contexto.transaccion
		.select({
			variante_id: loteTallas.varianteId,
			piezas: sql<number>`sum(CASE WHEN ${lotes.estado} = 'por_cortar' THEN ${loteTallas.piezasPlaneadas}
				ELSE coalesce(${loteTallas.piezasCortadas}, 0) - ${loteTallas.piezasMerma} - ${loteTallas.piezasABodega} END)::int`,
		})
		.from(loteTallas)
		.innerJoin(lotes, eq(lotes.id, loteTallas.loteId))
		.where(and(eq(lotes.pedidoId, pedido_id), inArray(lotes.estado, ["por_cortar", ...cortadoEnElTaller])))
		.groupBy(loteTallas.varianteId)
		.orderBy(asc(loteTallas.varianteId));
	const enReproceso = z
		.object({ reprocesos: z.array(z.object({ lote_id: z.uuid(), variante_id: z.uuid(), piezas: z.number() })) })
		.parse(await contexto.lectura("calidad.en_reproceso_de_pedido", { pedido_id })).reprocesos;
	const enAduana =
		enReproceso.length === 0
			? new Set<string>()
			: new Set(
					(
						await contexto.transaccion
							.select({ id: lotes.id })
							.from(lotes)
							.where(
								and(
									inArray(lotes.id, [...new Set(enReproceso.map((suyo) => suyo.lote_id))]),
									eq(lotes.estado, "en_aduana"),
								),
							)
					).map((lote) => lote.id),
				);
	const porVariante = new Map(filas.map((fila) => [fila.variante_id, fila.piezas]));
	for (const suyo of enReproceso.filter((reproceso) => enAduana.has(reproceso.lote_id))) {
		porVariante.set(suyo.variante_id, (porVariante.get(suyo.variante_id) ?? 0) + suyo.piezas);
	}
	return {
		variantes: [...porVariante.entries()]
			.map(([variante_id, piezas]) => ({ variante_id, piezas }))
			.sort((una, otra) => una.variante_id.localeCompare(otra.variante_id)),
	};
}

/**
 * `produccion.lotes_por_cortar`: los lotes por cortar con su prenda, sus piezas planeadas por talla, su fecha de corte,
 * para quién y si su prenda tiene receta.
 * @param contexto El contexto de quien lee (Compras y Bodega).
 * @returns Los lotes, por fecha de corte.
 */
export async function lotesPorCortar(contexto: ContextoDeAccion) {
	const porCortar = await contexto.transaccion
		.select({
			lote_id: lotes.id,
			folio: lotes.folio,
			producto_id: lotes.productoId,
			fecha_corte: lotes.fechaCorte,
			destino: lotes.destino,
			pedido_id: lotes.pedidoId,
			ubicacion_destino_id: lotes.ubicacionDestinoId,
		})
		.from(lotes)
		.where(eq(lotes.estado, "por_cortar"))
		.orderBy(asc(lotes.fechaCorte), asc(lotes.folio));
	const tallas =
		porCortar.length === 0
			? []
			: await contexto.transaccion
					.select({
						loteId: loteTallas.loteId,
						variante_id: loteTallas.varianteId,
						talla_id: variantes.tallaId,
						piezas_planeadas: loteTallas.piezasPlaneadas,
					})
					.from(loteTallas)
					.innerJoin(variantes, eq(variantes.id, loteTallas.varianteId))
					.where(
						inArray(
							loteTallas.loteId,
							porCortar.map((lote) => lote.lote_id),
						),
					);
	const conReceta = new Map<string, boolean>();
	for (const productoId of new Set(porCortar.map((lote) => lote.producto_id))) {
		const receta = z
			.object({ tiene_receta: z.boolean() })
			.parse(await contexto.lectura("patronaje.receta_cubre_tallas", { producto_id: productoId, talla_ids: [] }));
		conReceta.set(productoId, receta.tiene_receta);
	}
	return {
		lotes: porCortar.map((lote) => ({
			...lote,
			tiene_receta: conReceta.get(lote.producto_id) ?? false,
			tallas: tallas
				.filter((talla) => talla.loteId === lote.lote_id)
				.map(({ variante_id, talla_id, piezas_planeadas }) => ({ variante_id, talla_id, piezas_planeadas })),
		})),
	};
}

/**
 * `produccion.lotes_sin_terminar_de_variante`: los folios de los lotes por cortar, en proceso, terminados o revisados
 * que llevan esa talla. Catálogo la usa para no dar de baja una talla que se está fabricando.
 * @param contexto El contexto de quien lee.
 * @param datos `variante_id`.
 * @returns Los folios.
 */
export async function lotesSinTerminarDeVariante(contexto: ContextoDeAccion, datos: unknown) {
	const { variante_id } = z.object({ variante_id: z.uuid() }).parse(datos);
	const filas = await contexto.transaccion
		.select({ folio: lotes.folio })
		.from(lotes)
		.innerJoin(loteTallas, eq(loteTallas.loteId, lotes.id))
		.where(and(eq(loteTallas.varianteId, variante_id), inArray(lotes.estado, ["por_cortar", ...cortadoEnElTaller])))
		.orderBy(asc(lotes.folio));
	return { folios: filas.map((fila) => fila.folio) };
}

/**
 * `produccion.cortes_de_prenda`: los cortes cerrados de una prenda (o de todas), con la versión de receta con que se
 * cortó cada lote, sus piezas cortadas por talla y los metros que usó su tela principal: la suma de lo que salió de sus
 * rollos, que es lo que pidió la receta salvo que se cambiara lo que quedó o los rollos no alcanzaran (decisión 618).
 * Patronaje la usa para el desperdicio medido.
 * Fase 12 · docs/modulos/patronaje/cuenta-de-material.md (reglas 5 y 6)
 * @param contexto El contexto de quien lee.
 * @param datos `producto_id`, opcional.
 */
export async function cortesDePrenda(contexto: ContextoDeAccion, datos: unknown) {
	const { producto_id } = z.object({ producto_id: z.uuid().optional() }).parse(datos);
	const { transaccion } = contexto;
	const deLosCortes = await transaccion
		.select({
			lote_id: lotes.id,
			producto_id: lotes.productoId,
			receta_version_id: lotes.recetaVersionId,
			metros_usados: sql<string>`(SELECT sum(r.metros_usados) FROM corte_rollos r
				WHERE r.corte_tela_id = ${corteTelas.id})::numeric(12, 3)::text`,
		})
		.from(cortes)
		.innerJoin(lotes, eq(lotes.id, cortes.loteId))
		.innerJoin(corteTelas, and(eq(corteTelas.corteId, cortes.id), eq(corteTelas.papel, "tela_principal")))
		.where(producto_id === undefined ? undefined : eq(lotes.productoId, producto_id))
		.orderBy(asc(cortes.cerradoEn));
	const tallas =
		deLosCortes.length === 0
			? []
			: await transaccion
					.select({ loteId: loteTallas.loteId, talla_id: variantes.tallaId, piezas: loteTallas.piezasCortadas })
					.from(loteTallas)
					.innerJoin(variantes, eq(variantes.id, loteTallas.varianteId))
					.where(
						inArray(
							loteTallas.loteId,
							deLosCortes.map((corte) => corte.lote_id),
						),
					);
	return {
		cortes: deLosCortes.map((corte) => ({
			...corte,
			tallas: tallas
				.filter((talla) => talla.loteId === corte.lote_id && (talla.piezas ?? 0) > 0)
				.map((talla) => ({ talla_id: talla.talla_id, piezas: talla.piezas ?? 0 })),
		})),
	};
}
