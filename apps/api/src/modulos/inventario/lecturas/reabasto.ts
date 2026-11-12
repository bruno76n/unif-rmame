/**
 * Las lecturas del reabasto: las sugerencias de fabricar (para Producción) y los mínimos vigentes (para Configuración).
 * Fase 14 · docs/modulos/inventario/minimos-y-reabasto.md («Lecturas»)
 *
 * Ninguna lleva precios ni costos.
 */

import { asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, variantes } from "../../catalogo/tablas.ts";
import { ordenesProduccion } from "../../produccion/tablas.ts";
import { minimos, sugerenciasReabasto, ubicaciones } from "../tablas.ts";

/**
 * `inventario.sugerencias_de_fabricar`: por sugerencia, su variante con su prenda, su ubicación, sus piezas y su
 * estado, con su orden si ya se levantó.
 * @param datos `sugerencia_ids`.
 */
export async function sugerenciasDeFabricar(contexto: ContextoDeAccion, datos: unknown) {
	const { sugerencia_ids } = z.object({ sugerencia_ids: z.array(z.uuid()) }).parse(datos);
	if (sugerencia_ids.length === 0) return { sugerencias: [] };
	const sugerencias = await contexto.transaccion
		.select({
			sugerencia_id: sugerenciasReabasto.id,
			variante_id: sugerenciasReabasto.varianteId,
			producto_id: variantes.productoId,
			prenda: productos.nombre,
			ubicacion_id: sugerenciasReabasto.ubicacionId,
			ubicacion: ubicaciones.nombre,
			tipo_ubicacion: ubicaciones.tipo,
			piezas: sugerenciasReabasto.piezas,
			estado: sugerenciasReabasto.estado,
			orden: ordenesProduccion.folio,
		})
		.from(sugerenciasReabasto)
		.innerJoin(variantes, eq(variantes.id, sugerenciasReabasto.varianteId))
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(ubicaciones, eq(ubicaciones.id, sugerenciasReabasto.ubicacionId))
		.leftJoin(ordenesProduccion, eq(ordenesProduccion.id, sugerenciasReabasto.ordenProduccionId))
		.where(inArray(sugerenciasReabasto.id, sugerencia_ids))
		.orderBy(asc(sugerenciasReabasto.id));
	return { sugerencias };
}

/**
 * `inventario.minimos_vigentes`: por ubicación con mínimo, los dos vigentes con su versión.
 */
export async function minimosVigentes(contexto: ContextoDeAccion) {
	const vigentes = await contexto.transaccion
		.select({
			minimo_id: minimos.id,
			ubicacion_id: minimos.ubicacionId,
			ubicacion: ubicaciones.nombre,
			nivel: minimos.nivel,
			piezas: minimos.piezas,
			version: minimos.version,
		})
		.from(minimos)
		.innerJoin(ubicaciones, eq(ubicaciones.id, minimos.ubicacionId))
		.where(isNull(minimos.bajaEn))
		.orderBy(asc(ubicaciones.orden), asc(minimos.nivel));
	return { minimos: vigentes };
}
