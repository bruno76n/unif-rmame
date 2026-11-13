/**
 * La pastilla de Dirección en el menú: las autorizaciones por autorizar, roja cuando una lleva
 * `direccion.autorizacion_dias_menu_rojo` días esperando. Las alertas no cuentan.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Quién entra»: «Pastilla del menú»)
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ConteoDePastilla, ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";

/**
 * La pastilla de Dirección.
 * @param contexto El contexto de la consulta del armazón.
 * @returns Cuántas esperan y si alguna ya lleva los días del parámetro.
 */
export async function pastillaDireccion({ base, ahora }: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const dias = Number(await leerParametro(base, { clave: "direccion.autorizacion_dias_menu_rojo" }));
	const desde = ahora.subtract({ hours: dias * 24 }).toString();
	const { rows } = await base.execute(sql`
		SELECT count(*) AS esperan, count(*) FILTER (WHERE creado_en <= ${desde}::timestamptz) AS viejas
		FROM autorizaciones WHERE estado = 'por_autorizar'`);
	const fila = z.object({ esperan: z.coerce.number(), viejas: z.coerce.number() }).parse(rows[0]);
	return { conteo: fila.esperan, rojo: fila.viejas > 0 };
}
