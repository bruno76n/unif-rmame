/**
 * `catalogo.productos`: la pestaña Productos de Catálogo, por sección.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Productos»)
 *
 * Por producto: su escuela, su categoría de mayoreo, dónde se vende, su rango de tallas normales, sus variantes vivas
 * (y cuántas son de pedido especial), su precio base de Mostrador y lo que lo detiene. Los filtros van en la dirección:
 * sección, escuela o básicos, estado (activos al abrir), canal y la píldora; el buscador encuentra por producto o
 * escuela, y con 4 cifras o más por el principio del código. Las píldoras cuentan sobre lo filtrado sin la píldora.
 */

import { rangoDeTallas } from "@uniformame/compartido/calculos/textos";
import { productosDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { detieneDe, etiquetablesDe, filas, formaDeLoQueDetiene, loQueDetieneA } from "./comun.ts";

/** Un producto como lo lee la base. */
const leido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	nombre: z.string(),
	seccion_id: z.uuid(),
	seccion: z.string(),
	escuela_id: z.uuid().nullable(),
	escuela: z.string().nullable(),
	color: z.string().nullable(),
	categoria: z.string(),
	mostrador: z.boolean(),
	en_linea: z.boolean(),
	externos: z.boolean(),
	tiene_foto: z.boolean(),
	descontinuado: z.boolean(),
	mostrador_centavos: z.coerce.number().nullable(),
	tiene_precio: z.boolean(),
	variantes: z.coerce.number(),
	por_pedido: z.coerce.number(),
	etiquetables: z.coerce.number(),
	tallas: z.array(z.object({ grupo: z.string(), talla: z.string() })),
});

/** Los parámetros, sin la píldora. */
type Filtros = z.infer<typeof productosDeCatalogo.entrada>;

/**
 * Las condiciones de los filtros sobre `p` (el producto) y `e` (su escuela).
 * @param filtros Lo que viene en la dirección.
 */
function condiciones(filtros: Filtros): SQL {
	const estado = filtros.estado ?? "activos";
	const partes: SQL[] = [sql`true`];
	if (estado === "activos") partes.push(sql`p.baja_en IS NULL`);
	if (estado === "descontinuados") partes.push(sql`p.baja_en IS NOT NULL`);
	if (filtros.seccion_id !== undefined) partes.push(sql`p.seccion_id = ${filtros.seccion_id}`);
	if (filtros.escuela === "basico") partes.push(sql`p.escuela_id IS NULL`);
	else if (filtros.escuela !== undefined) partes.push(sql`p.escuela_id = ${filtros.escuela}`);
	if (filtros.canal !== undefined) partes.push(sql.raw(`p.canal_${filtros.canal}`));
	const buscar = filtros.buscar ?? "";
	if (/^\d{4,}$/.test(buscar)) {
		partes.push(sql`EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.codigo LIKE ${`${buscar}%`})`);
	} else if (buscar !== "") {
		const patron = `%${buscar.toLocaleLowerCase("es-MX")}%`;
		partes.push(
			sql`(sin_acentos(lower(p.nombre)) LIKE sin_acentos(${patron}) OR sin_acentos(lower(coalesce(e.nombre, ''))) LIKE sin_acentos(${patron}))`,
		);
	}
	return sql.join(partes, sql` AND `);
}

/** Cómo se ordena dentro de cada sección. */
const ordenes: Readonly<Record<NonNullable<Filtros["orden"]>, SQL>> = {
	producto: sql`p.nombre, e.nombre NULLS FIRST`,
	mayoreo: sql`c.orden, p.nombre`,
	tallas: sql`variantes DESC, p.nombre`,
	mostrador: sql`mostrador_centavos NULLS LAST, p.nombre`,
};

export const consultaProductos = implementarConsulta(productosDeCatalogo, async ({ base }, parametros) => {
	const donde = condiciones(parametros);
	const leidos = await filas(
		base,
		sql`SELECT p.id, p.version, p.nombre, p.seccion_id, s.nombre AS seccion, p.escuela_id, e.nombre AS escuela, e.color,
			c.nombre AS categoria, p.canal_mostrador AS mostrador, p.canal_en_linea AS en_linea, p.canal_externos AS externos,
			p.foto_archivo_id IS NOT NULL AS tiene_foto, p.baja_en IS NOT NULL AS descontinuado,
			(SELECT pr.precio_centavos FROM precios pr JOIN listas_precios l ON l.id = pr.lista_id AND l.tipo = 'mostrador'
			  WHERE pr.producto_id = p.id AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL) AS mostrador_centavos,
			EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.vigente_hasta IS NULL) AS tiene_precio,
			(SELECT count(*) FROM variantes v WHERE v.producto_id = p.id AND v.baja_en IS NULL) AS variantes,
			(SELECT count(*) FROM variantes v WHERE v.producto_id = p.id AND v.baja_en IS NULL AND v.es_pedido_especial) AS por_pedido,
			${etiquetablesDe} AS etiquetables,
			coalesce((SELECT json_agg(json_build_object('grupo', g.nombre, 'talla', t.nombre) ORDER BY g.orden, t.orden)
			  FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
			  WHERE v.producto_id = p.id AND v.baja_en IS NULL AND NOT v.es_pedido_especial), '[]') AS tallas
			FROM productos p JOIN secciones s ON s.id = p.seccion_id JOIN categorias_mayoreo c ON c.id = p.categoria_mayoreo_id
			LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE ${donde} ORDER BY s.orden, ${ordenes[parametros.orden ?? "producto"]}`,
		leido,
	);
	const detenidos = new Map(
		(
			await filas(
				base,
				loQueDetieneA(
					sql`p.id IN (SELECT p.id FROM productos p LEFT JOIN escuelas e ON e.id = p.escuela_id WHERE ${donde})`,
				),
				formaDeLoQueDetiene,
			)
		).map((fila) => [fila.producto_id, detieneDe(fila)]),
	);
	const productos = leidos.map((producto) => ({ ...producto, detiene: detenidos.get(producto.id) ?? [] }));
	const tiene = (producto: (typeof productos)[number], tipo: string) =>
		producto.detiene.some((detiene) => detiene.tipo === tipo);
	const pildoras = {
		todo: productos.length,
		sin_foto: productos.filter((producto) => tiene(producto, "sin_foto")).length,
		sin_etiqueta: productos.filter((producto) => tiene(producto, "sin_etiqueta")).length,
		sin_precio_cliente: productos.filter((producto) => tiene(producto, "sin_precio")).length,
	};
	const pildora = parametros.pildora;
	const conPildora =
		pildora === undefined
			? productos
			: productos.filter((producto) => tiene(producto, pildora === "sin_precio_cliente" ? "sin_precio" : pildora));
	const secciones = await filas(
		base,
		sql`SELECT id, nombre FROM secciones WHERE baja_en IS NULL ORDER BY orden`,
		z.object({ id: z.uuid(), nombre: z.string() }),
	);
	const escuelas = await filas(
		base,
		sql`SELECT id, nombre, color FROM escuelas WHERE baja_en IS NULL ORDER BY nombre`,
		z.object({ id: z.uuid(), nombre: z.string(), color: z.string() }),
	);
	return {
		resultado: {
			secciones: secciones.flatMap((seccion) => {
				const suyos = conPildora.filter((producto) => producto.seccion_id === seccion.id);
				return suyos.length === 0
					? []
					: [
							{
								id: seccion.id,
								nombre: seccion.nombre,
								productos: suyos.map((producto) => ({
									id: producto.id,
									version: producto.version,
									nombre: producto.nombre,
									escuela:
										producto.escuela_id === null
											? null
											: { id: producto.escuela_id, nombre: producto.escuela ?? "", color: producto.color ?? "" },
									categoria: producto.categoria,
									canales: { mostrador: producto.mostrador, en_linea: producto.en_linea, externos: producto.externos },
									tiene_foto: producto.tiene_foto,
									tallas: rangoDeTallas(producto.tallas),
									variantes: producto.variantes,
									por_pedido: producto.por_pedido,
									etiquetables: producto.etiquetables,
									mostrador_centavos: producto.mostrador_centavos,
									tiene_precio: producto.tiene_precio,
									descontinuado: producto.descontinuado,
									detiene: producto.detiene,
								})),
							},
						];
			}),
			total: conPildora.length,
			pildoras,
			filtros: { secciones, escuelas },
		},
	};
});
