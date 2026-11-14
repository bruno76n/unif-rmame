/**
 * Lo que comparten las consultas de las pantallas de Catálogo: leer filas con su forma, el siguiente código de barras,
 * los modelos sin precio, lo que detiene a un producto y el rango de sus tallas.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md y docs/modulos/catalogo/listas-de-precios.md (regla 8)
 */

import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";

/**
 * Lee las filas de una consulta y las revisa con su forma.
 * @param base La base.
 * @param consulta El SQL.
 * @param forma La forma de cada fila.
 */
export async function filas<Forma extends z.ZodType>(
	base: Base,
	consulta: SQL,
	forma: Forma,
): Promise<z.infer<Forma>[]> {
	return z.array(forma).parse((await base.execute(consulta)).rows);
}

/**
 * Lee un parámetro numérico (entero, centavos o por ciento).
 * @param base La base.
 * @param clave Su clave.
 */
export async function parametroNumero(base: Base, clave: string): Promise<number> {
	return Number(await leerParametro(base, { clave }));
}

/**
 * Lee un parámetro de sí o no.
 * @param base La base.
 * @param clave Su clave.
 */
export async function parametroSiNo(base: Base, clave: string): Promise<boolean> {
	return (await leerParametro(base, { clave })) === true;
}

/**
 * El siguiente código de barras de fábrica, con la lectura de folios; vacío si ya no quedan.
 * @param contexto El de la consulta.
 */
export async function siguienteCodigo(contexto: ContextoDeConsulta): Promise<string | null> {
	const leido = z
		.object({ folio: z.string(), quedan: z.number().optional() })
		.parse(await contexto.lectura("admin.siguiente_folio", { tipo: "codigo_barras" }));
	return leido.quedan === 0 ? null : leido.folio;
}

/**
 * Los modelos sin precio (regla 8 de listas de precios): un producto activo que se vende a externos, modelo de una
 * escuela que es cliente activo, sin precio base vigente en la lista de ese cliente. Una fila por producto y lista,
 * con `producto_id`, `lista_id` y `lista`.
 */
export const modelosSinPrecio = sql`SELECT p.id AS producto_id, l.id AS lista_id, l.nombre AS lista
	FROM productos p JOIN clientes c ON c.escuela_id = p.escuela_id AND c.baja_en IS NULL
	JOIN listas_precios l ON l.cliente_id = c.id AND l.baja_en IS NULL
	WHERE p.baja_en IS NULL AND p.canal_externos
	  AND NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = l.id
	    AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL)`;

/** Lo que detiene a un producto, como lo lee la base. */
export const formaDeLoQueDetiene = z.object({
	producto_id: z.uuid(),
	descontinuado: z.boolean(),
	sin_foto: z.boolean(),
	sin_etiqueta: z.coerce.number(),
	sin_precio: z.string().nullable(),
});

/**
 * Lo que detiene a cada producto: descontinuado; sin precio en la lista de su cliente; sin foto si se vende en línea
 * (la foto de referencia es lo que pide publicarlo); y sus variantes por imprimir.
 * @param condicion Qué productos (sobre `p`).
 */
export function loQueDetieneA(condicion: SQL): SQL {
	return sql`SELECT p.id AS producto_id, p.baja_en IS NOT NULL AS descontinuado,
		(p.baja_en IS NULL AND p.canal_en_linea AND p.foto_archivo_id IS NULL) AS sin_foto,
		(SELECT count(*) FROM variantes v WHERE v.producto_id = p.id AND v.baja_en IS NULL AND v.descontinuada_en IS NULL
		  AND v.estado_etiqueta = 'por_imprimir' AND p.baja_en IS NULL) AS sin_etiqueta,
		(SELECT min(m.lista) FROM (${modelosSinPrecio}) m WHERE m.producto_id = p.id) AS sin_precio
		FROM productos p WHERE ${condicion}`;
}

/**
 * Arma la lista de lo que detiene a un producto, de lo más grave a lo menos.
 * @param fila Lo que leyó `loQueDetieneA`.
 */
export function detieneDe(fila: z.infer<typeof formaDeLoQueDetiene>) {
	if (fila.descontinuado) return [{ tipo: "descontinuado" as const }];
	return [
		...(fila.sin_precio === null ? [] : [{ tipo: "sin_precio" as const, lista: fila.sin_precio }]),
		...(fila.sin_foto ? [{ tipo: "sin_foto" as const }] : []),
		...(fila.sin_etiqueta > 0 ? [{ tipo: "sin_etiqueta" as const, cuantas: fila.sin_etiqueta }] : []),
	];
}

/**
 * Las ids de una lista, para `IN (…)`.
 * @param ids Las ids.
 */
export function enLista(ids: readonly string[]): SQL {
	return ids.length === 0
		? sql`NULL::uuid`
		: sql.join(
				ids.map((id) => sql`${id}::uuid`),
				sql`, `,
			);
}

/** Las tallas que lleva «Imprimir etiquetas» de un producto `p`: vivas, normales y no descontinuadas. */
export const etiquetablesDe = sql`(SELECT count(*) FROM variantes v WHERE v.producto_id = p.id AND v.baja_en IS NULL
	AND v.descontinuada_en IS NULL AND NOT v.es_pedido_especial)`;
