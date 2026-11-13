/**
 * `mantenimiento.servicios`: los servicios de un año, del más reciente al más viejo, por páginas, con su máquina, su
 * técnico, qué se hizo, su costo y su paro; con cuántos son, lo que suman y sus horas de paro, y los años que hay.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Servicios»)
 */

import { serviciosDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Cuántos servicios van en una página, si no se dice. */
const limitePorOmision = 25;

/** Un servicio como sale de la base. */
const delServicio = z.object({
	servicio_id: z.uuid(),
	folio: z.string(),
	fecha: z.string(),
	maquina: z.string(),
	maquina_folio: z.string(),
	tecnico: z.string(),
	que_se_hizo: z.string(),
	costo_centavos: z.coerce.number(),
	horas_paro: z.number(),
});

export const consultaServiciosDeMantenimiento = implementarConsulta(
	serviciosDeMantenimiento,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const anio = parametros.anio ?? accion.diaDeNegocio.year;
			const limite = parametros.limite ?? limitePorOmision;
			const posicion = leerCursor(parametros.cursor);
			// La página sigue después del último de la anterior: por fecha y folio, del más reciente.
			const despues =
				posicion === undefined
					? sql``
					: sql`AND (s.fecha, s.folio) < (${String(posicion.fecha)}::date, ${String(posicion.folio)})`;
			const { rows } = await accion.transaccion.execute(sql`
				SELECT s.id AS servicio_id, s.folio, s.fecha::text AS fecha, m.nombre AS maquina, m.folio AS maquina_folio,
					t.nombre AS tecnico, s.que_se_hizo, s.costo_centavos, s.horas_paro
				FROM servicios s JOIN maquinas m ON m.id = s.maquina_id JOIN tecnicos t ON t.id = s.tecnico_id
				WHERE extract(year from s.fecha) = ${anio} ${despues}
				ORDER BY s.fecha DESC, s.folio DESC LIMIT ${limite + 1}`);
			const { rows: suma } = await accion.transaccion.execute(sql`
				SELECT count(*)::int AS servicios, coalesce(sum(costo_centavos), 0)::bigint AS total_centavos,
					coalesce(sum(horas_paro), 0)::int AS horas_paro
				FROM servicios WHERE extract(year from fecha) = ${anio}`);
			const { rows: conServicios } = await accion.transaccion.execute(sql`
				SELECT DISTINCT extract(year from fecha)::int AS anio FROM servicios`);
			const anios = new Set([
				accion.diaDeNegocio.year,
				...z
					.array(z.object({ anio: z.number() }))
					.parse(conServicios)
					.map((fila) => fila.anio),
			]);
			return {
				anio,
				anios: [...anios].sort((uno, otro) => otro - uno),
				resumen: z
					.object({ servicios: z.number(), total_centavos: z.coerce.number(), horas_paro: z.number() })
					.parse(suma[0]),
				...paginar(z.array(delServicio).parse(rows), limite, (servicio) => ({
					fecha: servicio.fecha,
					folio: servicio.folio,
				})),
			};
		}),
	}),
);
