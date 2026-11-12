/**
 * `produccion.produccion_por_persona`: la gente activa del Taller, de quien lleva más piezas hoy a quien lleva menos,
 * con las operaciones que hace de base, sus piezas buenas de hoy y de esta semana (desde el primer día de trabajo de la
 * semana) y los lotes en proceso cuyo flujo tiene una operación suya. Solo las buenas de sus registros vigentes, también
 * las del corte. Sin tarifas ni importes.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Producción por persona»)
 */

import { inicioDeSemana } from "@uniformame/compartido/calculos/fechas";
import { produccionPorPersona } from "@uniformame/compartido/contratos/produccion/operaciones";
import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/**
 * El primer día de trabajo de la semana de hoy (`general.dias_de_trabajo`, del 1, lunes, al 7).
 * @param hoy El día de negocio.
 * @param diasDeTrabajo El parámetro, como texto («1,2,3,4,5,6»).
 */
function primerDiaDeTrabajo(hoy: Temporal.PlainDate, diasDeTrabajo: string): Temporal.PlainDate {
	const dias = diasDeTrabajo.split(",").map((dia) => Number(dia.trim()));
	const lunes = inicioDeSemana(hoy);
	const primero = Math.min(...dias.filter((dia) => dia >= 1 && dia <= 7));
	return Number.isFinite(primero) ? lunes.add({ days: primero - 1 }) : lunes;
}

export const consultaProduccionPorPersona = implementarConsulta(produccionPorPersona, async (contexto) => {
	const hoy = contexto.diaDeNegocio;
	const desde = primerDiaDeTrabajo(
		hoy,
		String(await contexto.lectura("admin.parametro", { clave: "general.dias_de_trabajo" })),
	);
	const { rows } = await contexto.base.execute(sql`
		SELECT p.id AS persona_id, p.nombre, p.puesto,
			coalesce((SELECT sum(r.piezas_buenas) FROM registros_operacion r
				WHERE r.persona_id = p.id AND r.estado = 'vigente' AND r.fecha = ${hoy.toString()}::date), 0)::int AS hoy,
			coalesce((SELECT sum(r.piezas_buenas) FROM registros_operacion r
				WHERE r.persona_id = p.id AND r.estado = 'vigente' AND r.fecha >= ${desde.toString()}::date
				AND r.fecha <= ${hoy.toString()}::date), 0)::int AS semana,
			coalesce((SELECT array_agg(DISTINCT o.nombre ORDER BY o.nombre) FROM flujo_operaciones f
				JOIN flujos fl ON fl.id = f.flujo_id AND fl.baja_en IS NULL
				JOIN operaciones o ON o.id = f.operacion_id
				WHERE f.persona_base_id = p.id AND f.baja_en IS NULL), '{}') AS operaciones,
			coalesce((SELECT array_agg(DISTINCT l.folio ORDER BY l.folio) FROM lotes l
				JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.baja_en IS NULL
				WHERE l.estado = 'en_proceso' AND f.persona_base_id = p.id), '{}') AS lotes
		FROM personas p WHERE p.area = 'taller' AND p.baja_en IS NULL
		ORDER BY 4 DESC, p.nombre`);
	return {
		resultado: {
			personas: z
				.array(
					z.object({
						persona_id: z.uuid(),
						nombre: z.string(),
						puesto: z.string().nullable(),
						operaciones: z.array(z.string()),
						hoy: z.number(),
						semana: z.number(),
						lotes: z.array(z.string()),
					}),
				)
				.parse(rows),
		},
	};
});
