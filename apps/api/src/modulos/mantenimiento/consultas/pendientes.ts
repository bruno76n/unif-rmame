/**
 * `mantenimiento.pendientes` y la pastilla de Mantenimiento en el menú.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Quién entra», «Pendientes»)
 *
 * Un renglón por falla abierta, con lo que detiene (los lotes que calcula Producción); las cifras de las máquinas
 * activas por estado, las fallas abiertas y resueltas en el año, los servicios del año y del mes, y las horas de paro
 * del año (las de los servicios más las de las fallas abiertas que detuvieron su máquina) con su costo. La pastilla
 * cuenta las fallas abiertas y va en rojo si alguna detuvo su máquina.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { pendientesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
	type ConteoDePastilla,
	type ContextoDeAccion,
	type ContextoDeConsulta,
	implementarConsulta,
} from "../../../nucleo/modulos.ts";
import {
	costoDeLaHoraDeParo,
	estadoDeMaquina,
	horasDeLasFallasQueDetienen,
	leerMaquinas,
	lotesDetenidosPorFalla,
} from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof pendientesDeMantenimiento.resultado>;

/** Cuántos meses lleva la gráfica de las horas de paro. */
const mesesDeLaGrafica = 6;

/** Una falla abierta, para su renglón y para la pastilla. */
const deLaFallaAbierta = z.object({
	id: z.uuid(),
	folio: z.string(),
	fecha: z.string(),
	detuvo: z.boolean(),
	maquina: z.string(),
	la_trae: z.string().nullable(),
	motivo: z.string(),
});

/**
 * Las fallas abiertas, con su máquina, quien la trae y lo que le pasa.
 * @param contexto El contexto de la lectura.
 */
async function fallasAbiertas(contexto: ContextoDeAccion) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT f.id, f.folio, f.fecha::text AS fecha, f.detuvo_maquina AS detuvo, m.nombre AS maquina,
			p.nombre AS la_trae, mf.nombre AS motivo
		FROM fallas f JOIN maquinas m ON m.id = f.maquina_id JOIN motivos_falla mf ON mf.id = f.motivo_falla_id
		LEFT JOIN personas p ON p.id = m.persona_id
		WHERE f.estado <> 'resuelta' ORDER BY f.fecha, f.folio`);
	return z.array(deLaFallaAbierta).parse(rows);
}

/**
 * La pastilla: las fallas abiertas; en rojo si alguna detuvo su máquina.
 * @param abiertas Las fallas abiertas.
 */
function contarPastilla(abiertas: readonly { detuvo: boolean }[]): ConteoDePastilla {
	return { conteo: abiertas.length, rojo: abiertas.some((falla) => falla.detuvo) };
}

/**
 * Las cifras de los servicios: los del año, lo de este mes, y sus horas de paro de cada uno de los últimos meses.
 * @param contexto El contexto de la lectura.
 */
async function cifrasDeServicios(contexto: ContextoDeAccion) {
	const hoy = contexto.diaDeNegocio;
	const inicioDelMes = hoy.with({ day: 1 });
	const desde = inicioDelMes.subtract({ months: mesesDeLaGrafica - 1 });
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT count(*) FILTER (WHERE extract(year from fecha) = ${hoy.year})::int AS en_el_anio,
			coalesce(sum(costo_centavos) FILTER (WHERE extract(year from fecha) = ${hoy.year}), 0)::bigint AS costo_del_anio,
			coalesce(sum(horas_paro) FILTER (WHERE extract(year from fecha) = ${hoy.year}), 0)::int AS horas_del_anio,
			coalesce(sum(costo_centavos) FILTER (WHERE fecha >= ${inicioDelMes.toString()}::date), 0)::bigint AS este_mes
		FROM servicios`);
	const cifras = z
		.object({
			en_el_anio: z.number(),
			costo_del_anio: z.coerce.number(),
			horas_del_anio: z.number(),
			este_mes: z.coerce.number(),
		})
		.parse(rows[0]);
	const { rows: porMes } = await contexto.transaccion.execute(sql`
		SELECT to_char(fecha, 'YYYY-MM') AS mes, sum(horas_paro)::int AS horas FROM servicios
		WHERE fecha >= ${desde.toString()}::date GROUP BY 1`);
	const horasPorMes = new Map(
		z
			.array(z.object({ mes: z.string(), horas: z.number() }))
			.parse(porMes)
			.map((fila) => [fila.mes, fila.horas]),
	);
	const meses = Array.from({ length: mesesDeLaGrafica }, (_, i) =>
		desde.add({ months: i }).toPlainYearMonth().toString(),
	);
	return { ...cifras, horasPorMes: meses.map((mes) => horasPorMes.get(mes) ?? 0) };
}

/**
 * Todo lo de Pendientes.
 * @param contexto El contexto de la lectura.
 */
async function leerPendientes(contexto: ContextoDeAccion): Promise<Resultado> {
	const abiertas = await fallasAbiertas(contexto);
	const horas = await horasDeLasFallasQueDetienen(contexto);
	const detenidos = await lotesDetenidosPorFalla(contexto);
	const activas = (await leerMaquinas(contexto)).filter((maquina) => maquina.baja_el_dia === null);
	const contar = (texto: string) => activas.filter((maquina) => estadoDeMaquina(maquina.detuvo).texto === texto).length;
	const servicios = await cifrasDeServicios(contexto);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT count(*)::int AS n FROM fallas WHERE estado = 'resuelta'
			AND extract(year from (resuelta_en AT TIME ZONE ${zonaDelNegocio}::text)) = ${contexto.diaDeNegocio.year}`);
	const resueltas = z.object({ n: z.number() }).parse(rows[0]).n;
	// Las horas de paro del año: las de los servicios más las de las fallas abiertas que detuvieron su máquina.
	const horasDelAnio = servicios.horas_del_anio + [...horas.values()].reduce((suma, una) => suma + una, 0);
	const costoHora = await costoDeLaHoraDeParo(contexto);
	return {
		indicadores: {
			maquinas: {
				activas: activas.length,
				trabajando: contar("Trabajando"),
				con_falla: contar("Trabaja con falla"),
				paradas: contar("Parada"),
			},
			fallas: { abiertas: abiertas.length, resueltas_en_el_anio: resueltas },
			servicios: { en_el_anio: servicios.en_el_anio, este_mes_centavos: servicios.este_mes },
			costo: {
				horas_paro: horasDelAnio,
				por_paro_centavos: horasDelAnio * costoHora,
				reparaciones_centavos: servicios.costo_del_anio,
				horas_por_mes: servicios.horasPorMes,
			},
		},
		renglones: abiertas.map((falla) => {
			const lotes = detenidos.get(falla.folio) ?? [];
			return {
				falla_id: falla.id,
				referencia: falla.la_trae === null ? falla.maquina : `${falla.maquina} · ${falla.la_trae}`,
				detalle:
					lotes.length === 0 ? falla.motivo : `${falla.motivo} · detiene ${lotes.map((lote) => lote.folio).join(", ")}`,
				fecha: falla.fecha,
				horas_paro: falla.detuvo ? (horas.get(falla.id) ?? null) : null,
				parada: falla.detuvo,
				estado: estadoDeMaquina(falla.detuvo),
			};
		}),
		pastilla: contarPastilla(abiertas),
	};
}

export const consultaPendientesDeMantenimiento = implementarConsulta(pendientesDeMantenimiento, async (contexto) => ({
	resultado: await contexto.comoAccion(leerPendientes),
}));

/**
 * La pastilla de Mantenimiento en el menú (ver `contarPastilla`).
 * @param contexto El contexto de quien pregunta.
 */
export async function pastillaMantenimiento(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	return contexto.comoAccion(async (accion) => contarPastilla(await fallasAbiertas(accion)));
}
