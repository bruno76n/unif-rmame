/**
 * Las cifras que leen Pendientes e Indicadores de Dirección: lo vendido por día y por canal, las prendas terminadas por
 * día de trabajo, la salud de los lotes, la existencia por ubicación y cómo se escribe una variación.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes», «Indicadores») y
 * docs/modulos/direccion/alertas-e-indicadores.md («Los indicadores»)
 *
 * Los indicadores no se guardan: se calculan al leer (regla 5). Lo vendido son las notas de entrega entregadas menos
 * sus notas de crédito autorizadas (Clientes externos) y los W- pagados que no se cancelaron (En línea); las tiendas
 * venden con el POS, que todavía no llega. Las terminadas las cuenta Producción (`produccion.terminadas_por_dia`).
 * Nunca se leen sueldos, tarifas ni costos.
 */

import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

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
 * Las prendas terminadas de cada uno de los últimos días de trabajo, de la lectura de Producción: la misma cuenta que
 * ve Producción en su Pendientes.
 * @param contexto El contexto de la lectura.
 * @param dias Cuántos días de trabajo, hasta hoy.
 * @returns Cada día (ISO) con sus piezas, del más viejo al más nuevo.
 */
export async function terminadasPorDia(
	contexto: ContextoDeAccion,
	dias: number,
): Promise<{ fecha: string; piezas: number }[]> {
	return z
		.object({ dias: z.array(z.object({ fecha: z.string(), piezas: z.number() })) })
		.parse(await contexto.lectura("produccion.terminadas_por_dia", { dias })).dias;
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
