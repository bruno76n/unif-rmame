/**
 * `mantenimiento.fallas_que_detienen`: las fallas abiertas que detuvieron su máquina, con sus horas de paro.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («Lecturas», reglas 6 y 11)
 *
 * La usan Producción (el atorado por máquina en la salud de los lotes) y Dirección (sus alertas, fase 18). No lleva
 * costos.
 */

import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";
import { horasDeParo } from "../dominio/paro.ts";

/** Una falla abierta que detuvo su máquina. */
const deLaFalla = z.object({
	falla_id: z.uuid(),
	folio: z.string(),
	maquina_id: z.uuid(),
	maquina: z.string(),
	maquina_folio: z.string(),
	persona_id: z.uuid().nullable(),
	persona_asignada_id: z.uuid().nullable(),
	motivo: z.string(),
	parada_desde: z.string(),
	parada_el_dia: z.string(),
});

/**
 * Las fallas abiertas que detuvieron una máquina: su folio, la máquina, quién la trae (con ella se cruza el atorado por
 * máquina, regla 11) y quién la traía al fallar, qué le pasa, desde cuándo está parada y sus horas de paro.
 */
export async function fallasQueDetienen(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id AS falla_id, f.folio, m.id AS maquina_id, m.nombre AS maquina, m.folio AS maquina_folio,
			m.persona_id, f.persona_asignada_id, mf.nombre AS motivo,
			to_char(f.parada_desde AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS parada_desde,
			(f.parada_desde AT TIME ZONE 'America/Mexico_City')::date::text AS parada_el_dia
		FROM fallas f JOIN maquinas m ON m.id = f.maquina_id JOIN motivos_falla mf ON mf.id = f.motivo_falla_id
		WHERE f.estado <> 'resuelta' AND f.detuvo_maquina
		ORDER BY f.parada_desde`);
	const abiertas = z.array(deLaFalla).parse(rows);
	if (abiertas.length === 0) return { fallas: [] };
	const numero = async (clave: string) => Number(await contexto.lectura("admin.parametro", { clave }));
	const cuenta = {
		porDia: await numero("mantenimiento.paro_horas_por_dia"),
		deHoy: await numero("mantenimiento.paro_horas_hoy"),
		diasDeTrabajo: leerDiasDeTrabajo(await contexto.lectura("admin.parametro", { clave: "general.dias_de_trabajo" })),
	};
	return {
		fallas: abiertas.map(({ parada_el_dia, ...falla }) => ({
			...falla,
			horas_paro: horasDeParo(Temporal.PlainDate.from(parada_el_dia), contexto.diaDeNegocio, cuenta),
		})),
	};
}
