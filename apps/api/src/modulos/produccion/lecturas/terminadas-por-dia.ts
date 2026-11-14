/**
 * `produccion.terminadas_por_dia`: las prendas terminadas en cada uno de los últimos días de trabajo. Es la única
 * cuenta de las terminadas: la usan Pendientes de Producción y las cifras de Dirección, así las dos pantallas dicen
 * lo mismo.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes») y docs/interfaz/fabrica/direccion.md («Pendientes»,
 * «Indicadores»)
 */

import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";

/**
 * Los últimos días de trabajo hasta hoy (hoy cuenta si es día de trabajo), del más viejo al más nuevo.
 * @param hoy El día de negocio.
 * @param diasDeTrabajo Los días de `general.dias_de_trabajo`, ya leídos.
 * @param cuantos Cuántos días.
 */
function ultimosDiasDeTrabajo(
	hoy: Temporal.PlainDate,
	diasDeTrabajo: readonly number[],
	cuantos: number,
): Temporal.PlainDate[] {
	const deTrabajo = new Set(diasDeTrabajo);
	const dias: Temporal.PlainDate[] = [];
	for (let dia = hoy; dias.length < cuantos && deTrabajo.size > 0; dia = dia.subtract({ days: 1 })) {
		if (deTrabajo.has(dia.dayOfWeek)) dias.unshift(dia);
	}
	return dias;
}

/**
 * Las piezas buenas de los registros vigentes de la última operación del flujo de su lote, por día, en los últimos
 * días de trabajo.
 * @param contexto El contexto de la lectura.
 * @param datos `dias`: cuántos días de trabajo, hasta hoy.
 * @returns Cada día (ISO, del más viejo al más nuevo) con sus piezas; un día sin registros va en cero.
 * Cuenta por el flujo del lote: la última operación es la del flujo con que se trabaja el lote.
 */
export async function terminadasPorDia(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ dias: { fecha: string; piezas: number }[] }> {
	const { dias: cuantos } = z.object({ dias: z.number().int().positive() }).parse(datos);
	const diasDeTrabajo = leerDiasDeTrabajo(
		await contexto.lectura("admin.parametro", { clave: "general.dias_de_trabajo" }),
	);
	const dias = ultimosDiasDeTrabajo(contexto.diaDeNegocio, diasDeTrabajo, cuantos);
	const primero = dias[0];
	const ultimo = dias.at(-1);
	if (primero === undefined || ultimo === undefined) return { dias: [] };
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.fecha::text AS fecha, sum(r.piezas_buenas) AS piezas
		FROM registros_operacion r JOIN lotes l ON l.id = r.lote_id
		JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id
		WHERE r.estado = 'vigente' AND r.fecha BETWEEN ${primero.toString()}::date AND ${ultimo.toString()}::date
			AND f.orden = (SELECT max(u.orden) FROM flujo_operaciones u WHERE u.flujo_id = l.flujo_id AND u.baja_en IS NULL)
		GROUP BY r.fecha`);
	const porDia = new Map(
		z
			.array(z.object({ fecha: z.string(), piezas: z.coerce.number() }))
			.parse(rows)
			.map((fila) => [fila.fecha, fila.piezas]),
	);
	return { dias: dias.map((dia) => ({ fecha: dia.toString(), piezas: porDia.get(dia.toString()) ?? 0 })) };
}
