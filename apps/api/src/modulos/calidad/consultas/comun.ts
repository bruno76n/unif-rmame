/**
 * Lo que comparten las consultas de las pantallas de Calidad: los lotes que esperan revisión, los reprocesos, las
 * devoluciones que esperan a Calidad, los defectos del periodo con su tasa y las listas de los selectores. Todo sin
 * precios, importes, tarifas ni sueldos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md
 *
 * Para quién es un lote y cómo se escribe lo toman de las consultas de Producción (`escribirParaQuien`), que es dueña
 * de esa forma; la persona que se propone, de `produccion.persona_que_la_hizo`.
 */

import { diasHasta } from "@uniformame/compartido/calculos/fechas";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { columnasDeParaQuien, deParaQuien, unionesDeParaQuien } from "../../produccion/dominio/para-quien.ts";

/** La zona del negocio, para pasar un momento a su día. */
const enMexico = sql`'America/Mexico_City'`;

/**
 * Escribe piezas con su unidad: «1 pieza», «4 piezas».
 * @param piezas Cuántas.
 */
export function textoDePiezas(piezas: number): string {
	return piezas === 1 ? "1 pieza" : `${piezas} piezas`;
}

/** Un lote terminado que espera revisión, como sale de la base. */
const deLoteParaRevisar = z.object({
	id: z.uuid(),
	folio: z.string(),
	prenda: z.string(),
	terminado: z.string().nullable(),
	listas: z.number(),
	...deParaQuien,
});

/** Un lote terminado que espera revisión. */
export type LoteParaRevisar = z.infer<typeof deLoteParaRevisar> & { urgente: boolean };

/**
 * Los lotes terminados que esperan revisión, por entrega, cada uno con si es «Por revisar hoy»
 * (`calidad.por_revisar_hoy_dias`, regla 1 de docs/modulos/calidad/revision-de-lotes.md).
 * @param contexto El contexto de la consulta.
 */
export async function lotesParaRevisar(contexto: ContextoDeConsulta): Promise<LoteParaRevisar[]> {
	const dias = await parametroNumero(contexto, "calidad.por_revisar_hoy_dias");
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.folio, p.nombre AS prenda, (l.terminado_en AT TIME ZONE ${enMexico})::date::text AS terminado,
			(SELECT coalesce(sum(t.piezas_terminadas), 0)::int FROM lote_tallas t WHERE t.lote_id = l.id) AS listas,
			${columnasDeParaQuien}
		FROM lotes l JOIN productos p ON p.id = l.producto_id ${unionesDeParaQuien}
		WHERE l.estado = 'terminado'
		ORDER BY l.fecha_entrega, l.folio`);
	return z
		.array(deLoteParaRevisar)
		.parse(rows)
		.map((lote) => ({ ...lote, urgente: diasHasta(contexto.diaDeNegocio, lote.fecha_entrega) <= dias }));
}

/** Un reproceso, como sale de la base. */
const deReproceso = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	estado: z.enum(["en_reproceso", "listo"]),
	lote_folio: z.string(),
	lote_en_aduana: z.boolean(),
	prenda: z.string(),
	operacion: z.string(),
	persona: z.string(),
	defecto: z.string(),
	talla: z.string(),
	piezas: z.number(),
	pedido_folio: z.string().nullable(),
	cliente: z.string().nullable(),
	fecha: z.string(),
});

/** Un reproceso, con su lote, su rechazo y su pedido. */
export type Reproceso = z.infer<typeof deReproceso>;

/**
 * Los reprocesos que cumplen una condición sobre `rp` (el reproceso), por folio.
 * @param contexto El contexto de la consulta.
 * @param condicion La condición.
 */
export async function leerReprocesos(contexto: ContextoDeConsulta, condicion: SQL): Promise<Reproceso[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT rp.id, rp.version, rp.folio, rp.estado, l.folio AS lote_folio, l.estado = 'en_aduana' AS lote_en_aduana,
			p.nombre AS prenda, o.nombre AS operacion, pr.nombre AS persona, d.nombre AS defecto, ta.nombre AS talla,
			r.piezas, pe.folio AS pedido_folio, ter.nombre AS cliente,
			(rp.creado_en AT TIME ZONE ${enMexico})::date::text AS fecha
		FROM reprocesos rp JOIN rechazos r ON r.id = rp.rechazo_id JOIN lotes l ON l.id = rp.lote_id
		JOIN productos p ON p.id = l.producto_id
		JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id JOIN operaciones o ON o.id = f.operacion_id
		JOIN personas pr ON pr.id = r.persona_id JOIN defectos d ON d.id = r.defecto_id
		JOIN variantes v ON v.id = r.variante_id JOIN tallas ta ON ta.id = v.talla_id
		LEFT JOIN pedidos pe ON pe.id = l.pedido_id LEFT JOIN clientes cli ON cli.id = pe.cliente_id
		LEFT JOIN terceros ter ON ter.id = cli.tercero_id
		WHERE ${condicion}
		ORDER BY rp.folio`);
	return z.array(deReproceso).parse(rows);
}

/** Un renglón de una devolución que espera a Calidad. */
const deRenglonDeDevolucion = z.object({
	traspaso_linea_id: z.uuid(),
	por_decidir: z.number(),
	prenda: z.string(),
	talla: z.string(),
	lote: z.string().nullable(),
	defecto_id: z.uuid().nullable(),
	defecto: z.string().nullable(),
	nota: z.string().nullable(),
});

/** Una devolución en aduana que espera a Calidad, con sus renglones por decidir. */
const deDevolucion = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	llego: z.string().nullable(),
	cliente: z.string(),
	renglones: z.array(deRenglonDeDevolucion),
});

/**
 * Las devoluciones que esperan a Calidad: las que regresaron de un cliente con defecto y siguen en aduana, sin
 * repartir, con lo que queda por decidir en cada renglón (regla 7 de docs/modulos/calidad/reclamos-y-devoluciones.md).
 * @param contexto El contexto de la consulta.
 * @param traspasoId Solo esa devolución, si se dice.
 */
export async function devolucionesPorRevisar(contexto: ContextoDeConsulta, traspasoId?: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT t.id, t.version, t.folio, (t.llego_aduana_en AT TIME ZONE ${enMexico})::date::text AS llego,
			coalesce(ter.nombre, uo.nombre, 'Pedido en línea') AS cliente,
			json_agg(json_build_object('traspaso_linea_id', tl.id,
				'por_decidir', coalesce(tl.piezas_recibidas_aduana, 0) - tl.piezas_repartidas,
				'prenda', p.nombre, 'talla', ta.nombre, 'lote', l.folio, 'defecto_id', d.id, 'defecto', d.nombre,
				'nota', tl.nota) ORDER BY tl.renglon) AS renglones
		FROM traspasos t JOIN traspaso_lineas tl ON tl.traspaso_id = t.id
		JOIN variantes v ON v.id = tl.variante_id JOIN productos p ON p.id = v.producto_id
		JOIN tallas ta ON ta.id = v.talla_id
		LEFT JOIN lotes l ON l.id = tl.lote_id LEFT JOIN defectos d ON d.id = tl.defecto_id
		LEFT JOIN notas_credito nc ON nc.id = t.nota_credito_id LEFT JOIN clientes cli ON cli.id = nc.cliente_id
		LEFT JOIN terceros ter ON ter.id = cli.tercero_id LEFT JOIN ubicaciones uo ON uo.id = t.origen_ubicacion_id
		WHERE t.estado = 'en_aduana' AND t.traspaso_padre_id IS NULL
			AND t.tipo IN ('devolucion_defecto', 'devolucion_cliente_externo', 'devolucion_linea')
			AND coalesce(tl.piezas_recibidas_aduana, 0) - tl.piezas_repartidas > 0
			${traspasoId === undefined ? sql`` : sql`AND t.id = ${traspasoId}`}
		GROUP BY t.id, ter.nombre, uo.nombre
		ORDER BY t.llego_aduana_en, t.folio`);
	return z.array(deDevolucion).parse(rows);
}

/** Lo que se cuenta de los defectos de un periodo. */
export interface PeriodoDeDefectos {
	dias: number;
	revisadas: number;
	lotes: number;
	rechazadas: number;
	/** Las rechazadas entre las revisadas, en %, con un decimal. */
	porcentaje: number;
	/** Cada defecto con sus piezas, del más común al menos común. */
	delPeriodo: { nombre: string; piezas: number }[];
}

/**
 * Un porcentaje con un decimal.
 * @param parte Lo contado.
 * @param total De cuánto.
 */
export function porcentaje(parte: number, total: number): number {
	return total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;
}

/**
 * La condición de las revisiones `rv` del periodo de la tasa de defectos: los últimos `calidad.defectos_periodo_dias`
 * días, hoy incluido.
 * @param contexto El contexto de la consulta.
 * @param dias Los días del periodo.
 */
export function enElPeriodo(contexto: ContextoDeConsulta, dias: number): SQL {
	const desde = contexto.diaDeNegocio.subtract({ days: dias - 1 }).toString();
	return sql`rv.fecha >= ${desde}::date`;
}

/**
 * Las piezas revisadas y rechazadas en los últimos `calidad.defectos_periodo_dias` días, con cada defecto.
 * @param contexto El contexto de la consulta.
 */
export async function defectosDelPeriodo(contexto: ContextoDeConsulta): Promise<PeriodoDeDefectos> {
	const dias = await parametroNumero(contexto, "calidad.defectos_periodo_dias");
	const periodo = enElPeriodo(contexto, dias);
	const { rows: totales } = await contexto.base.execute(sql`
		SELECT coalesce(sum(rv.piezas_revisadas), 0)::int AS revisadas, count(*)::int AS lotes,
			coalesce(sum(rv.piezas_revisadas - rv.piezas_aprobadas), 0)::int AS rechazadas
		FROM revisiones rv WHERE ${periodo}`);
	const total = z.object({ revisadas: z.number(), lotes: z.number(), rechazadas: z.number() }).parse(totales[0]);
	const { rows } = await contexto.base.execute(sql`
		SELECT d.nombre, sum(r.piezas)::int AS piezas
		FROM rechazos r JOIN revisiones rv ON rv.id = r.revision_id JOIN defectos d ON d.id = r.defecto_id
		WHERE ${periodo} GROUP BY d.id, d.nombre ORDER BY sum(r.piezas) DESC, d.nombre`);
	return {
		dias,
		...total,
		porcentaje: porcentaje(total.rechazadas, total.revisadas),
		delPeriodo: z.array(z.object({ nombre: z.string(), piezas: z.number() })).parse(rows),
	};
}

/** Una opción de un selector. */
const deOpcion = z.object({ id: z.uuid(), nombre: z.string() });

/**
 * El catálogo de defectos vigentes, en el orden en que se agregaron.
 * @param contexto El contexto de la consulta.
 */
export async function defectosVigentes(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT id, nombre FROM defectos WHERE baja_en IS NULL ORDER BY creado_en, nombre`);
	return z.array(deOpcion).parse(rows);
}

/**
 * La gente del Taller, para «Quién la hizo».
 * @param contexto El contexto de la consulta.
 */
export async function genteDelTaller(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT id, nombre FROM personas WHERE area = 'taller' AND baja_en IS NULL ORDER BY nombre`);
	return z.array(deOpcion).parse(rows);
}

/**
 * La persona que se propone para un rechazo: la que dice `produccion.persona_que_la_hizo` (regla 3).
 * @param contexto El contexto de la consulta.
 * @param datos El lote, la operación del flujo y la talla.
 */
export async function personaPropuesta(
	contexto: ContextoDeConsulta,
	datos: { lote_id: string; flujo_operacion_id: string; variante_id: string },
): Promise<string | null> {
	const leida = z
		.object({ persona_id: z.uuid() })
		.nullable()
		.parse(await contexto.lectura("produccion.persona_que_la_hizo", datos));
	return leida?.persona_id ?? null;
}
