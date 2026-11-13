/**
 * Lo que comparten las consultas de las pantallas de Personal: las tiendas que se escogen como área, cómo se llama el
 * área de una persona y las operaciones vigentes que esperan su tarifa.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Personas», «Tarifas» y los pendientes de «Asistencia»)
 *
 * Lee tablas de Inventario y de Producción solo para leer.
 */

import { areas, nombresDeArea } from "@uniformame/compartido/contratos/personal/personas";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ubicaciones } from "../../inventario/tablas.ts";

/**
 * Las tiendas vigentes, en su orden: las que se escogen como área y en el filtro de Personas.
 * @param base La base o la transacción.
 */
export async function tiendasParaEscoger(base: Base | Transaccion): Promise<{ id: string; nombre: string }[]> {
	return base
		.select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
		.from(ubicaciones)
		.where(sql`${ubicaciones.tipo} = 'tienda' and ${ubicaciones.bajaEn} is null`)
		.orderBy(asc(ubicaciones.orden), asc(ubicaciones.nombre));
}

/**
 * Cómo se llama el área de una persona en pantalla: la tienda, con su nombre («Tienda 1»).
 * @param area El área guardada.
 * @param tienda El nombre de su tienda, si es de tienda.
 */
export function nombreDelArea(area: string, tienda: string | null | undefined): string {
	if (area === "tienda" && tienda != null) return tienda;
	const leida = z.enum(areas).safeParse(area);
	return leida.success ? nombresDeArea[leida.data] : area;
}

/** Una operación vigente de un flujo vigente que no tiene tarifa. */
const operacionSinTarifa = z.object({
	flujo_id: z.uuid(),
	flujo: z.string(),
	flujo_operacion_id: z.uuid(),
	operacion: z.string(),
	registros: z.number().int().describe("Sus registros vigentes que esperan la tarifa"),
});

/**
 * Las operaciones vigentes de los flujos vigentes sin tarifa vigente («Sin tarifa»), con cuántos registros vigentes
 * esperan su tarifa: mientras no la tengan, sus piezas no suman a la nómina (regla 4 de las tarifas).
 * @param base La base o la transacción.
 */
export async function operacionesSinTarifa(base: Base | Transaccion) {
	const { rows } = await base.execute(sql`
		SELECT fl.id AS flujo_id, fl.nombre AS flujo, f.id AS flujo_operacion_id, o.nombre AS operacion,
			(SELECT count(*) FROM registros_operacion r
				WHERE r.flujo_operacion_id = f.id AND r.estado = 'vigente' AND r.tarifa_centavos IS NULL)::int AS registros
		FROM flujo_operaciones f
		JOIN flujos fl ON fl.id = f.flujo_id AND fl.baja_en IS NULL
		JOIN operaciones o ON o.id = f.operacion_id
		WHERE f.baja_en IS NULL
			AND NOT EXISTS (SELECT 1 FROM tarifas_operacion t WHERE t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL)
		ORDER BY fl.nombre, f.orden`);
	return z.array(operacionSinTarifa).parse(rows);
}
