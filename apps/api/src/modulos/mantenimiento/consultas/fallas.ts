/**
 * `mantenimiento.fallas`: las fallas de un grupo con su máquina, lo que le pasa, si la detuvo, quién la reportó, su paro
 * y su estado; las abiertas, todas; las resueltas, de la más reciente a la más vieja, por páginas. Con cuántas hay en
 * cada grupo.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas») y docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md
 * (regla 6)
 *
 * El paro de una resuelta son las horas de su servicio; el de una abierta que detuvo su máquina, las que lleva.
 */

import { fallasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { estadosDeFalla } from "../tablas.ts";
import { columnasDeQuienReporto, estadoDeFalla, horasDeLasFallasQueDetienen, unionesDeQuienReporto } from "./comun.ts";

/** Cuántas resueltas van en una página, si no se dice. */
const limitePorOmision = 25;

/** Una falla como sale de la base. */
const deLaFalla = z.object({
	id: z.uuid(),
	folio: z.string(),
	fecha: z.string(),
	estado: z.enum(estadosDeFalla),
	maquina: z.string(),
	maquina_folio: z.string(),
	motivo: z.string(),
	detuvo: z.boolean(),
	reporto: z.string(),
	horas_servicio: z.number().nullable(),
});

export const consultaFallasDeMantenimiento = implementarConsulta(
	fallasDeMantenimiento,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const resueltas = parametros.grupo === "resueltas";
			const limite = parametros.limite ?? limitePorOmision;
			const posicion = resueltas ? leerCursor(parametros.cursor) : undefined;
			// Las resueltas siguen después de la última de la página anterior: por fecha y folio, de la más reciente.
			const despues =
				posicion === undefined
					? sql``
					: sql`AND (f.fecha, f.folio) < (${String(posicion.fecha)}::date, ${String(posicion.folio)})`;
			const { rows } = await accion.transaccion.execute(sql`
			SELECT f.id, f.folio, f.fecha::text AS fecha, f.estado, m.nombre AS maquina, m.folio AS maquina_folio,
				mf.nombre AS motivo, f.detuvo_maquina AS detuvo, ${columnasDeQuienReporto}, s.horas_paro AS horas_servicio
			FROM fallas f JOIN maquinas m ON m.id = f.maquina_id JOIN motivos_falla mf ON mf.id = f.motivo_falla_id
			LEFT JOIN servicios s ON s.falla_id = f.id
			${unionesDeQuienReporto}
			WHERE ${resueltas ? sql`f.estado = 'resuelta'` : sql`f.estado <> 'resuelta'`} ${despues}
			ORDER BY ${resueltas ? sql`f.fecha DESC, f.folio DESC` : sql`f.fecha, f.folio`}
			${resueltas ? sql`LIMIT ${limite + 1}` : sql``}`);
			const fallas = z.array(deLaFalla).parse(rows);
			const horas = resueltas ? new Map<string, number>() : await horasDeLasFallasQueDetienen(accion);
			const { rows: conteos } = await accion.transaccion.execute(sql`
			SELECT count(*) FILTER (WHERE estado <> 'resuelta')::int AS abiertas,
				count(*) FILTER (WHERE estado = 'resuelta')::int AS resueltas
			FROM fallas`);
			const pagina = paginar(fallas, resueltas ? limite : fallas.length, (falla) => ({
				fecha: falla.fecha,
				folio: falla.folio,
			}));
			return {
				conteos: z.object({ abiertas: z.number(), resueltas: z.number() }).parse(conteos[0]),
				...pagina,
				renglones: pagina.renglones.map((falla) => ({
					falla_id: falla.id,
					folio: falla.folio,
					fecha: falla.fecha,
					maquina: falla.maquina,
					maquina_folio: falla.maquina_folio,
					motivo: falla.motivo,
					detuvo: falla.detuvo,
					reporto: falla.reporto,
					horas_paro: falla.estado === "resuelta" ? falla.horas_servicio : (horas.get(falla.id) ?? null),
					estado: estadoDeFalla(falla.estado),
				})),
			};
		}),
	}),
);
