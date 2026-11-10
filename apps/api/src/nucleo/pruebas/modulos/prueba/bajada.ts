/**
 * Lo que baja del módulo de prueba a la tablet: los lotes abiertos de su ubicación y sus bultos.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Cómo se construye»)
 *
 * El filtro de los bultos vive en otra tabla (su lote abierto y de la ubicación de la tablet) y en un
 * parámetro (`prueba.atendidos_bajan`): cerrar un lote toca sus bultos, y cambiar el parámetro pide la foto.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../../modulos.ts";

/** Las tablas del módulo de prueba que bajan a la tablet. */
export const bajadaDePrueba: readonly TablaQueBaja[] = [
	{
		tabla: "prueba_lotes",
		aparatos: ["tablet_taller"],
		orden: 10,
		columnas: ["nombre", "ubicacion_id"],
		filtro: (aparato) => sql`t.ubicacion_id = ${aparato.ubicacionId}::uuid AND NOT t.cerrado`,
	},
	{
		tabla: "prueba_bultos",
		aparatos: ["tablet_taller"],
		orden: 20,
		columnas: ["lote_id", "piezas", "atendido"],
		filtro: (aparato) => sql`NOT t.cancelado
			AND EXISTS (SELECT 1 FROM prueba_lotes l WHERE l.id = t.lote_id AND l.ubicacion_id = ${aparato.ubicacionId}::uuid AND NOT l.cerrado)
			AND (NOT t.atendido OR coalesce((SELECT p.valor_booleano FROM parametros p WHERE p.clave = 'prueba.atendidos_bajan' AND p.ubicacion_id IS NULL), false))`,
		parametros: ["prueba.atendidos_bajan"],
	},
];
