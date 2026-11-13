/**
 * `catalogo.listas_precios`: la pestaña Listas de precios de Catálogo.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Listas de precios») y docs/modulos/catalogo/listas-de-precios.md
 * (regla 7)
 *
 * Abre en Mostrador. Qué productos entran (solo activos): en Mostrador y Mayoreo, los que se venden en mostrador; en En
 * línea, los que se venden en línea; en la de un cliente, los que se venden a externos y tienen precio en ella o son
 * modelo de la escuela del cliente. Por producto: su precio base en la lista, el de la referencia (Mostrador, o En
 * línea si se ve Mostrador), la diferencia, desde cuándo vale y el precio que tenía antes. «Modelos sin precio» cuenta
 * los productos de la lista sin precio base, sin contar la búsqueda.
 */

import { listasDePrecios } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { etiquetablesDe, filas } from "./comunes.ts";

/** Los tipos de lista. */
const tipoDeLista = z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]);

/** Una lista como la lee la base. */
const listaLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	tipo: tipoDeLista,
	nombre: z.string(),
	descripcion: z.string().nullable(),
	pct_basicos: z.string().nullable(),
	pct_especiales: z.string().nullable(),
	escuela_id: z.uuid().nullable(),
	cliente_tipo: z.enum(["escuela", "mayorista", "empresa_otro"]).nullable(),
	municipio: z.string().nullable(),
});

/** Un producto de la lista como lo lee la base. */
const productoLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	nombre: z.string(),
	seccion_id: z.uuid(),
	seccion: z.string(),
	escuela: z.string().nullable(),
	categoria: z.string(),
	etiquetables: z.coerce.number(),
	precio: z.coerce.number().nullable(),
	vigente_desde: z.string().nullable(),
	antes: z.coerce.number().nullable(),
	referencia: z.coerce.number().nullable(),
});

/**
 * Qué productos entran en una lista (regla 7), sobre `p`.
 * @param lista La lista.
 */
function entranEn(lista: z.infer<typeof listaLeida>): SQL {
	if (lista.tipo === "mostrador" || lista.tipo === "mayoreo") return sql`p.canal_mostrador`;
	if (lista.tipo === "en_linea") return sql`p.canal_en_linea`;
	return sql`p.canal_externos AND (p.escuela_id = ${lista.escuela_id}::uuid
		OR EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = ${lista.id} AND pr.vigente_hasta IS NULL))`;
}

/**
 * La búsqueda por producto o escuela, sobre `p` y `e`.
 * @param buscar Lo que se escribió.
 */
function busqueda(buscar: string | undefined): SQL {
	if (buscar === undefined || buscar === "") return sql`true`;
	const patron = `%${buscar.toLocaleLowerCase("es-MX")}%`;
	return sql`(sin_acentos(lower(p.nombre)) LIKE sin_acentos(${patron}) OR sin_acentos(lower(coalesce(e.nombre, ''))) LIKE sin_acentos(${patron}))`;
}

export const consultaListasPrecios = implementarConsulta(listasDePrecios, async ({ base }, parametros) => {
	const listas = await filas(
		base,
		sql`SELECT l.id, l.version, l.tipo, l.nombre, l.descripcion, l.pct_basicos::text, l.pct_especiales::text,
			c.escuela_id, c.tipo AS cliente_tipo, c.municipio
			FROM listas_precios l LEFT JOIN clientes c ON c.id = l.cliente_id
			WHERE l.baja_en IS NULL ORDER BY l.tipo = 'cliente', l.orden, l.nombre`,
		listaLeida,
	);
	const lista =
		parametros.lista_id === undefined
			? listas.find((una) => una.tipo === "mostrador")
			: listas.find((una) => una.id === parametros.lista_id);
	if (lista === undefined) throw noExiste();
	const referencia = listas.find((una) => una.tipo === (lista.tipo === "mostrador" ? "en_linea" : "mostrador"));
	const entran = entranEn(lista);
	const productos = await filas(
		base,
		sql`SELECT p.id, p.version, p.nombre, s.id AS seccion_id, s.nombre AS seccion, e.nombre AS escuela, c.nombre AS categoria,
			${etiquetablesDe} AS etiquetables, vig.precio_centavos AS precio, vig.vigente_desde::text AS vigente_desde,
			(SELECT pr.precio_centavos FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = ${lista.id}
			  AND pr.variante_id IS NULL AND pr.vigente_hasta IS NOT NULL ORDER BY pr.vigente_hasta DESC LIMIT 1) AS antes,
			(SELECT pr.precio_centavos FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = ${referencia?.id ?? null}::uuid
			  AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL) AS referencia
			FROM productos p JOIN secciones s ON s.id = p.seccion_id JOIN categorias_mayoreo c ON c.id = p.categoria_mayoreo_id
			LEFT JOIN escuelas e ON e.id = p.escuela_id
			LEFT JOIN precios vig ON vig.producto_id = p.id AND vig.lista_id = ${lista.id} AND vig.variante_id IS NULL
			  AND vig.vigente_hasta IS NULL
			WHERE p.baja_en IS NULL AND ${entran} AND ${busqueda(parametros.buscar)}
			ORDER BY s.orden, p.nombre, e.nombre NULLS FIRST`,
		productoLeido,
	);
	const [sinPrecio] = await filas(
		base,
		sql`SELECT count(*)::int AS n FROM productos p
			WHERE p.baja_en IS NULL AND ${entran} AND NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id
			  AND pr.lista_id = ${lista.id} AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL)`,
		z.object({ n: z.number() }),
	);
	const secciones = [...new Map(productos.map((producto) => [producto.seccion_id, producto.seccion])).entries()];
	return {
		resultado: {
			listas: listas.map(({ id, nombre, tipo }) => ({ id, nombre, tipo })),
			lista: {
				id: lista.id,
				version: lista.version,
				tipo: lista.tipo,
				nombre: lista.nombre,
				descripcion: lista.descripcion,
				cliente: lista.cliente_tipo === null ? null : { tipo: lista.cliente_tipo, municipio: lista.municipio ?? "" },
				pct_basicos: lista.pct_basicos,
				pct_especiales: lista.pct_especiales,
				modelos_sin_precio: sinPrecio?.n ?? 0,
				referencia: referencia?.nombre ?? "",
			},
			secciones: secciones.map(([id, nombre]) => ({
				id,
				nombre,
				productos: productos
					.filter((producto) => producto.seccion_id === id)
					.map((producto) => ({
						id: producto.id,
						version: producto.version,
						nombre: producto.nombre,
						escuela: producto.escuela,
						categoria: producto.categoria,
						etiquetables: producto.etiquetables,
						precio_centavos: producto.precio,
						referencia_centavos: producto.referencia,
						diferencia_centavos:
							producto.precio === null || producto.referencia === null ? null : producto.precio - producto.referencia,
						vigente_desde: producto.vigente_desde === null ? null : new Date(producto.vigente_desde).toISOString(),
						antes_centavos: producto.antes,
					})),
			})),
			total: productos.length,
		},
	};
});
