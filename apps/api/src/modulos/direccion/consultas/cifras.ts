/**
 * Las cifras que leen Pendientes e Indicadores de Dirección: lo vendido por día y por canal, las prendas terminadas por
 * día de trabajo, la salud de los lotes, la existencia por ubicación y cómo se escribe una variación.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes», «Indicadores») y
 * docs/modulos/direccion/alertas-e-indicadores.md («Los indicadores»)
 *
 * Los indicadores no se guardan: se calculan al leer (regla 5). Lo vendido son las notas de entrega entregadas menos
 * sus notas de crédito autorizadas (Clientes externos) y los W- pagados que no se cancelaron (En línea); las tiendas
 * venden con el POS, que todavía no llega. Las terminadas son las piezas buenas de la última operación de su flujo.
 * Nunca se leen sueldos, tarifas ni costos.
 */

import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";

/** El formato de las cantidades de material, con sus decimales si los lleva: «20», «0.75». */
export const formatoDeCantidad = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** El formato de las piezas y los conteos: «4,175». */
export const formatoDePiezas = new Intl.NumberFormat("es-MX");

/** Los canales que hoy venden en el sistema. */
export type CanalConVentas = "externos" | "en_linea";

/** Lo vendido por día (ISO) y canal, en centavos. */
export type VentasPorDia = ReadonlyMap<string, Readonly<Record<CanalConVentas, number>>>;

/** Una fila de ventas: el día, el canal y lo vendido. */
const filaDeVenta = z.object({
	fecha: z.string(),
	canal: z.enum(["externos", "en_linea"]),
	centavos: z.coerce.number(),
});

/**
 * Lo vendido por día y canal entre dos días (los dos cuentan).
 * @param contexto El contexto de la lectura.
 * @param desde El primer día.
 * @param hasta El último día.
 */
export async function ventasPorDia(
	contexto: ContextoDeAccion,
	desde: Temporal.PlainDate,
	hasta: Temporal.PlainDate,
): Promise<VentasPorDia> {
	const de = desde.toString();
	const a = hasta.toString();
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT fecha::text AS fecha, canal, sum(centavos) AS centavos FROM (
			SELECT fecha_entrega AS fecha, 'externos' AS canal, subtotal_centavos AS centavos FROM notas_entrega
				WHERE estado = 'entregada' AND fecha_entrega BETWEEN ${de}::date AND ${a}::date
			UNION ALL
			SELECT (autorizada_en AT TIME ZONE 'America/Mexico_City')::date, 'externos', -monto_centavos FROM notas_credito
				WHERE estado = 'autorizada' AND (autorizada_en AT TIME ZONE 'America/Mexico_City')::date BETWEEN ${de}::date AND ${a}::date
			UNION ALL
			SELECT (pagado_en AT TIME ZONE 'America/Mexico_City')::date, 'en_linea', total_centavos FROM pedidos_linea
				WHERE pagado_en IS NOT NULL AND estado <> 'cancelado'
					AND (pagado_en AT TIME ZONE 'America/Mexico_City')::date BETWEEN ${de}::date AND ${a}::date
		) ventas GROUP BY fecha, canal`);
	const porDia = new Map<string, Record<CanalConVentas, number>>();
	for (const fila of z.array(filaDeVenta).parse(rows)) {
		const delDia = porDia.get(fila.fecha) ?? { externos: 0, en_linea: 0 };
		delDia[fila.canal] += fila.centavos;
		porDia.set(fila.fecha, delDia);
	}
	return porDia;
}

/**
 * Lo vendido entre dos días, de un canal o de todos.
 * @param ventas Lo vendido por día.
 * @param desde El primer día.
 * @param hasta El último día.
 * @param canal El canal; sin él, todos.
 */
export function vendidoEntre(
	ventas: VentasPorDia,
	desde: Temporal.PlainDate,
	hasta: Temporal.PlainDate,
	canal?: CanalConVentas,
): number {
	let suma = 0;
	for (let dia = desde; Temporal.PlainDate.compare(dia, hasta) <= 0; dia = dia.add({ days: 1 })) {
		const delDia = ventas.get(dia.toString());
		if (delDia !== undefined) suma += canal === undefined ? delDia.externos + delDia.en_linea : delDia[canal];
	}
	return suma;
}

/**
 * El día de la primera venta de cada canal que vende en el sistema.
 * @param contexto El contexto de la lectura.
 */
export async function primerasVentas(contexto: ContextoDeAccion): Promise<Record<CanalConVentas, string | null>> {
	const { rows } = await contexto.transaccion.execute(sql`SELECT
		(SELECT min(fecha_entrega)::text FROM notas_entrega WHERE estado = 'entregada') AS externos,
		(SELECT min((pagado_en AT TIME ZONE 'America/Mexico_City')::date)::text FROM pedidos_linea
			WHERE pagado_en IS NOT NULL AND estado <> 'cancelado') AS en_linea`);
	return z.object({ externos: z.string().nullable(), en_linea: z.string().nullable() }).parse(rows[0]);
}

/**
 * Los últimos días de trabajo hasta hoy (hoy cuenta si es día de trabajo), del más viejo al más nuevo.
 * @param contexto El contexto de la lectura.
 * @param cuantos Cuántos días.
 */
export async function ultimosDiasDeTrabajo(contexto: ContextoDeAccion, cuantos: number): Promise<Temporal.PlainDate[]> {
	const deTrabajo = new Set<number>(
		leerDiasDeTrabajo(await leerParametro(contexto.transaccion, { clave: "general.dias_de_trabajo" })),
	);
	const dias: Temporal.PlainDate[] = [];
	for (let dia = contexto.diaDeNegocio; dias.length < cuantos; dia = dia.subtract({ days: 1 })) {
		if (deTrabajo.has(dia.dayOfWeek)) dias.unshift(dia);
	}
	return dias;
}

/**
 * Las prendas terminadas de cada día: las piezas buenas de los registros vigentes de la última operación de su flujo.
 * @param contexto El contexto de la lectura.
 * @param dias Los días.
 * @returns Las piezas de cada día, en el mismo orden.
 */
export async function terminadasPorDia(
	contexto: ContextoDeAccion,
	dias: readonly Temporal.PlainDate[],
): Promise<number[]> {
	const primero = dias[0];
	const ultimo = dias.at(-1);
	if (primero === undefined || ultimo === undefined) return [];
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.fecha::text AS fecha, sum(r.piezas_buenas) AS piezas
		FROM registros_operacion r JOIN flujo_operaciones o ON o.id = r.flujo_operacion_id
		WHERE r.estado = 'vigente' AND r.fecha BETWEEN ${primero.toString()}::date AND ${ultimo.toString()}::date
			AND o.orden = (SELECT max(u.orden) FROM flujo_operaciones u WHERE u.flujo_id = o.flujo_id AND u.baja_en IS NULL)
		GROUP BY r.fecha`);
	const porDia = new Map(
		z
			.array(z.object({ fecha: z.string(), piezas: z.coerce.number() }))
			.parse(rows)
			.map((fila) => [fila.fecha, fila.piezas]),
	);
	return dias.map((dia) => porDia.get(dia.toString()) ?? 0);
}

/**
 * Cuántos lotes en proceso están atorados y cuántos en riesgo de atraso, con la salud que da Producción.
 * @param contexto El contexto de la lectura.
 */
export async function saludDeLosLotes(contexto: ContextoDeAccion): Promise<{ atorados: number; enRiesgo: number }> {
	const { lotes } = z
		.object({ lotes: z.array(z.object({ tono: z.string(), atorado: z.boolean() })) })
		.parse(await contexto.lectura("produccion.salud_de_lotes", {}));
	return {
		atorados: lotes.filter((lote) => lote.atorado).length,
		enRiesgo: lotes.filter((lote) => !lote.atorado && lote.tono === "ambar").length,
	};
}

/**
 * Cuántos lotes van en proceso y cuántos por cortar.
 * @param contexto El contexto de la lectura.
 */
export async function lotesPorEtapa(contexto: ContextoDeAccion): Promise<{ enProceso: number; porCortar: number }> {
	const { rows } = await contexto.transaccion.execute(sql`SELECT
		count(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
		count(*) FILTER (WHERE estado = 'por_cortar') AS por_cortar FROM lotes`);
	const fila = z.object({ en_proceso: z.coerce.number(), por_cortar: z.coerce.number() }).parse(rows[0]);
	return { enProceso: fila.en_proceso, porCortar: fila.por_cortar };
}

/**
 * Las piezas de cada una de las siete ubicaciones, en su orden.
 * @param contexto El contexto de la lectura.
 */
export async function existenciaPorUbicacion(
	contexto: ContextoDeAccion,
): Promise<{ codigo: string; nombre: string; tipo: string; piezas: number }[]> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT u.codigo, u.nombre, u.tipo, coalesce(sum(e.piezas), 0) AS piezas
		FROM ubicaciones u LEFT JOIN existencias e ON e.ubicacion_id = u.id
		GROUP BY u.id ORDER BY u.orden`);
	return z
		.array(z.object({ codigo: z.string(), nombre: z.string(), tipo: z.string(), piezas: z.coerce.number() }))
		.parse(rows);
}

/**
 * Cómo se escribe una variación contra lo anterior: «▲ 51%» si subió o se quedó igual, «▼ 8%» si bajó.
 * @param actual Lo de ahora.
 * @param anterior Lo de antes.
 * @returns El texto, o `null` si antes no hubo nada contra qué comparar.
 */
export function variacion(actual: number, anterior: number): string | null {
	if (anterior === 0) return null;
	const porciento = Math.round((actual / anterior - 1) * 100);
	return `${porciento >= 0 ? "▲" : "▼"} ${Math.abs(porciento)}%`;
}
