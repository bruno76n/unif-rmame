/**
 * Las lecturas de Inventario para las alertas de Dirección: la existencia de unas variantes sumada en todas las
 * ubicaciones (`inventario.existencia_de_variantes`) y el último cuadre de la noche (`inventario.ultimo_cuadre`).
 * Fase 18 · docs/modulos/inventario/existencias-y-cuadre.md («Lecturas»)
 */

import { desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { cuadres, existencias } from "../tablas.ts";

/** Lo que recibe `inventario.existencia_de_variantes`. */
const deVariantes = z.object({ variante_ids: z.array(z.uuid()) }).strict();

/**
 * `inventario.existencia_de_variantes`: por variante, la suma de su existencia en todas sus ubicaciones.
 * @param datos `variante_ids`.
 * @returns Por variante con existencia, sus piezas; la que no tiene no viene.
 */
export async function existenciaDeVariantes(contexto: ContextoDeAccion, datos: unknown) {
	const { variante_ids } = deVariantes.parse(datos);
	if (variante_ids.length === 0) return { piezas: {} };
	const filas = await contexto.transaccion
		.select({ varianteId: existencias.varianteId, piezas: sql<string>`sum(${existencias.piezas})` })
		.from(existencias)
		.where(inArray(existencias.varianteId, variante_ids))
		.groupBy(existencias.varianteId);
	return { piezas: Object.fromEntries(filas.map((fila) => [fila.varianteId, Number(fila.piezas)])) };
}

/**
 * `inventario.ultimo_cuadre`: el último cuadre, con su id, su fecha, su estado, cuándo empezó y terminó, sus contadores y
 * su error; o nada si no ha corrido ninguno.
 */
export async function ultimoCuadre(contexto: ContextoDeAccion) {
	const [cuadre] = await contexto.transaccion.select().from(cuadres).orderBy(desc(cuadres.fecha)).limit(1);
	if (cuadre === undefined) return { cuadre: null };
	return {
		cuadre: {
			cuadre_id: cuadre.id,
			fecha: cuadre.fecha,
			estado: cuadre.estado,
			iniciado_en: cuadre.iniciadoEn,
			terminado_en: cuadre.terminadoEn,
			renglones_revisados: cuadre.renglonesRevisados,
			proyecciones_corregidas: cuadre.proyeccionesCorregidas,
			diferencias_creadas: cuadre.diferenciasCreadas,
			excepciones_creadas: cuadre.excepcionesCreadas,
			error: cuadre.error,
		},
	};
}
