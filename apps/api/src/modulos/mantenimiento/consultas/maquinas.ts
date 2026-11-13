/**
 * `mantenimiento.maquinas`: las máquinas activas por área, con su tipo, su marca, su serie, quién la trae, su último
 * servicio y su estado; y las dadas de baja, solo para leer.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Máquinas»)
 */

import { maquinasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { estadoDeMaquina, leerMaquinas, type MaquinaLeida, marcaYModelo } from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof maquinasDeMantenimiento.resultado>;

/**
 * El último servicio de cada máquina.
 * @param contexto El contexto de la lectura.
 */
async function ultimosServicios(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT DISTINCT ON (maquina_id) maquina_id, fecha::text AS fecha, que_se_hizo
		FROM servicios ORDER BY maquina_id, fecha DESC, folio DESC`);
	const filas = z.array(z.object({ maquina_id: z.uuid(), fecha: z.string(), que_se_hizo: z.string() })).parse(rows);
	return new Map(filas.map(({ maquina_id, ...servicio }) => [maquina_id, servicio]));
}

/**
 * Las áreas con sus máquinas activas, en el orden de la lista «Áreas del taller».
 * @param activas Las máquinas activas, ya en ese orden.
 * @param ultimos El último servicio de cada máquina.
 */
function porArea(
	activas: readonly MaquinaLeida[],
	ultimos: Awaited<ReturnType<typeof ultimosServicios>>,
): Resultado["areas"] {
	const areas: Resultado["areas"] = [];
	for (const maquina of activas) {
		let area = areas.find((una) => una.area_id === maquina.area_id);
		if (area === undefined) {
			area = { area_id: maquina.area_id, nombre: maquina.area, maquinas: [] };
			areas.push(area);
		}
		area.maquinas.push({
			maquina_id: maquina.id,
			nombre: maquina.nombre,
			folio: maquina.folio,
			tipo: maquina.tipo,
			marca_modelo: marcaYModelo(maquina),
			serie: maquina.serie,
			la_trae: maquina.la_trae,
			ultimo_servicio: ultimos.get(maquina.id) ?? null,
			estado: estadoDeMaquina(maquina.detuvo),
		});
	}
	return areas;
}

export const consultaMaquinasDeMantenimiento = implementarConsulta(maquinasDeMantenimiento, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion): Promise<Resultado> => {
		const maquinas = await leerMaquinas(accion);
		const activas = maquinas.filter((maquina) => maquina.baja_el_dia === null);
		return {
			activas: activas.length,
			areas: porArea(activas, await ultimosServicios(accion)),
			bajas: maquinas.flatMap((maquina) =>
				maquina.baja_el_dia === null
					? []
					: [
							{
								maquina_id: maquina.id,
								nombre: maquina.nombre,
								folio: maquina.folio,
								desde: maquina.baja_el_dia,
								motivo: maquina.motivo_baja ?? "",
							},
						],
			),
		};
	}),
}));
