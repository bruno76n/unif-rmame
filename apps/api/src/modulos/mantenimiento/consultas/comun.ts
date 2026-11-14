/**
 * Lo que comparten las consultas de las pantallas de Mantenimiento: el estado escrito de una máquina y de una falla,
 * quién reportó una falla, las máquinas con su falla abierta, las horas de paro de las fallas que detienen, el costo de
 * la hora de paro y los servicios de un año.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md y docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas
 * 1, 6 y 7)
 *
 * El estado de una máquina no se captura: sale de su falla abierta (regla 1). Las horas de paro de una falla abierta
 * las da `fallasQueDetienen`, la misma lectura que usan Producción y Dirección (regla 6).
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import type { estadoEscrito } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { fallasQueDetienen } from "../lecturas/fallas.ts";
import type { estadosDeFalla } from "../tablas.ts";

/** Un estado escrito, como lo pinta la pantalla. */
export type EstadoEscrito = z.infer<typeof estadoEscrito>;

/**
 * El estado de una máquina por su falla abierta (regla 1): «Trabajando» sin falla, «Parada» si la falla la detuvo,
 * «Trabaja con falla» si no.
 * @param detuvo Si su falla abierta la detuvo; `null` sin falla abierta.
 */
export function estadoDeMaquina(detuvo: boolean | null): EstadoEscrito {
	if (detuvo === null) return { texto: "Trabajando", color: "verde" };
	return detuvo ? { texto: "Parada", color: "rojo" } : { texto: "Trabaja con falla", color: "ambar" };
}

/** El estado escrito de cada estado de una falla, con su color de la guía. */
const estadosEscritosDeFalla: Readonly<Record<(typeof estadosDeFalla)[number], EstadoEscrito>> = {
	reportada: { texto: "Reportada", color: "ambar" },
	en_reparacion: { texto: "En reparación", color: "rojo" },
	resuelta: { texto: "Resuelta", color: "verde" },
};

/**
 * El estado escrito de una falla.
 * @param estado Como lo guarda la base.
 */
export function estadoDeFalla(estado: (typeof estadosDeFalla)[number]): EstadoEscrito {
	return estadosEscritosDeFalla[estado];
}

/**
 * Las columnas de quién reportó una falla `f`: la persona (de la tablet o ligada a la cuenta) o, si no hay, el nombre
 * de la cuenta que la reportó; y su origen. Van con `unionesDeQuienReporto` en su `FROM`.
 */
export const columnasDeQuienReporto = sql`coalesce(pr.nombre, ur.nombre, ur.correo, 'Mantenimiento') AS reporto,
	f.origen`;

/** Las uniones de quién reportó una falla `f`. */
export const unionesDeQuienReporto = sql`LEFT JOIN personas pr ON pr.id = f.reporto_persona_id
	LEFT JOIN usuarios ur ON ur.id = f.creado_por`;

/** Una máquina con sus datos y su falla abierta, como sale de `leerMaquinas`. */
const deLaMaquina = z.object({
	id: z.uuid(),
	folio: z.string(),
	nombre: z.string(),
	version: z.coerce.number(),
	tipo: z.string(),
	marca: z.string().nullable(),
	modelo: z.string().nullable(),
	serie: z.string().nullable(),
	area_id: z.uuid(),
	area: z.string(),
	area_orden: z.number(),
	persona_id: z.uuid().nullable(),
	la_trae: z.string().nullable(),
	baja_el_dia: z.string().nullable(),
	motivo_baja: z.string().nullable(),
	falla_id: z.uuid().nullable(),
	falla_folio: z.string().nullable(),
	detuvo: z.boolean().nullable(),
});

/** Una máquina leída. */
export type MaquinaLeida = z.infer<typeof deLaMaquina>;

/**
 * Las máquinas con su tipo, su área, quién la trae, su baja y su falla abierta (a lo más una).
 * @param contexto El contexto de la lectura.
 * @param maquinaId Solo esa máquina; sin ella, todas.
 */
export async function leerMaquinas(contexto: ContextoDeAccion, maquinaId?: string): Promise<MaquinaLeida[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT m.id, m.folio, m.nombre, m.version, t.nombre AS tipo, m.marca, m.modelo, m.serie,
			a.id AS area_id, a.nombre AS area, a.orden AS area_orden, p.id AS persona_id, p.nombre AS la_trae,
			(m.baja_en AT TIME ZONE ${zonaDelNegocio}::text)::date::text AS baja_el_dia, m.motivo_baja,
			f.id AS falla_id, f.folio AS falla_folio, f.detuvo_maquina AS detuvo
		FROM maquinas m JOIN tipos_maquina t ON t.id = m.tipo_maquina_id
		JOIN lista_valores a ON a.id = m.area_id
		LEFT JOIN personas p ON p.id = m.persona_id
		LEFT JOIN fallas f ON f.maquina_id = m.id AND f.estado <> 'resuelta'
		${maquinaId === undefined ? sql`` : sql`WHERE m.id = ${maquinaId}::uuid`}
		ORDER BY a.orden, a.nombre, m.folio`);
	return z.array(deLaMaquina).parse(rows);
}

/**
 * La marca y el modelo juntos, o nada si no tiene ninguno.
 * @param maquina La máquina.
 */
export function marcaYModelo(maquina: Pick<MaquinaLeida, "marca" | "modelo">): string | null {
	const juntos = [maquina.marca, maquina.modelo].filter((parte) => parte !== null && parte !== "").join(" ");
	return juntos === "" ? null : juntos;
}

/**
 * Las horas de paro de cada falla abierta que detuvo su máquina, por su id (regla 6).
 * @param contexto El contexto de la lectura.
 */
export async function horasDeLasFallasQueDetienen(contexto: ContextoDeAccion): Promise<Map<string, number>> {
	const { fallas } = await fallasQueDetienen(contexto);
	return new Map(fallas.map((falla) => [falla.falla_id, falla.horas_paro]));
}

/** Un lote que detiene una máquina parada, como lo da `produccion.lotes_atorados`. */
const deLosAtorados = z.object({
	lotes: z.array(
		z.object({ lote_id: z.uuid(), folio: z.string(), fecha_entrega: z.string(), falla: z.string().nullable() }),
	),
});

/** Un lote atorado por una máquina parada. */
export type LoteDetenido = Omit<z.infer<typeof deLosAtorados>["lotes"][number], "falla">;

/**
 * Los lotes que tiene atorados cada falla, por el folio de la falla: los que calcula Producción («{máquina} parada
 * ({FM})», regla 11), así Mantenimiento dice lo mismo que la salud de los lotes.
 * @param contexto El contexto de la lectura.
 */
export async function lotesDetenidosPorFalla(contexto: ContextoDeAccion): Promise<Map<string, LoteDetenido[]>> {
	const { lotes } = deLosAtorados.parse(await contexto.lectura("produccion.lotes_atorados", {}));
	const porFalla = new Map<string, LoteDetenido[]>();
	for (const { falla, ...lote } of lotes) {
		// El folio de la falla va al final, entre paréntesis.
		const folio = falla === null ? undefined : /\(([^()]+)\)$/.exec(falla)?.[1];
		if (folio === undefined) continue;
		porFalla.set(folio, [...(porFalla.get(folio) ?? []), lote]);
	}
	return porFalla;
}

/**
 * Lo que cuesta una hora de máquina parada: `mantenimiento.costo_hora_paro` (regla 7).
 * @param contexto El contexto de la lectura.
 */
export async function costoDeLaHoraDeParo(contexto: ContextoDeAccion): Promise<number> {
	return Number(await leerParametro(contexto.transaccion, { clave: "mantenimiento.costo_hora_paro" }));
}

/** Lo que suman los servicios de una máquina en un año. */
export interface ServiciosDeMaquina {
	servicios: number;
	costo: number;
	horas: number;
}

/**
 * Lo que suman los servicios de cada máquina en un año.
 * @param contexto El contexto de la lectura.
 * @param anio El año.
 * @returns Por máquina, cuántos, lo que costaron y sus horas de paro.
 */
export async function serviciosDelAnioPorMaquina(
	contexto: ContextoDeAccion,
	anio: number,
): Promise<Map<string, ServiciosDeMaquina>> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT maquina_id, count(*)::int AS servicios, coalesce(sum(costo_centavos), 0)::bigint AS costo,
			coalesce(sum(horas_paro), 0)::int AS horas
		FROM servicios WHERE extract(year from fecha) = ${anio} GROUP BY maquina_id`);
	const filas = z
		.array(z.object({ maquina_id: z.uuid(), servicios: z.number(), costo: z.coerce.number(), horas: z.number() }))
		.parse(rows);
	return new Map(filas.map(({ maquina_id, ...suma }) => [maquina_id, suma]));
}
