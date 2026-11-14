/**
 * `catalogo.alta_producto`: lo que necesita el cajón «Nuevo producto».
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Nuevo producto») y docs/modulos/catalogo/productos.md
 * («`catalogo.crear_producto`»)
 *
 * El siguiente código, las secciones con su tipo de prenda por omisión, los tipos con su flujo, las escuelas activas,
 * las categorías con la que el alta propone según «Para quién», los grupos con sus tallas, las listas generales (y la
 * del cliente desde un pedido) y los productos que pueden ser base (activos y no servicios). Con un producto base: su
 * nombre, sección, escuela, categoría, canales, tallas vivas, precios base de esas listas, su receta y sus medidas. La
 * lee Catálogo con cualquier origen y Ventas a externos solo desde un pedido, igual que `catalogo.crear_producto`.
 */

import { altaDeProducto } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import { ErrorDeApi, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { enLista, filas, siguienteCodigo } from "./comun.ts";

/** Los tipos de lista. */
const tipoDeLista = z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]);

/**
 * El producto base con lo que el alta copia de él.
 * @param contexto El de la consulta.
 * @param id El producto base.
 * @param listaIds Las listas del alta: sus precios base son los que se copian.
 */
async function baseDelAlta({ base }: ContextoDeConsulta, id: string, listaIds: readonly string[]) {
	const [producto] = await filas(
		base,
		sql`SELECT id, nombre, seccion_id, escuela_id, categoria_mayoreo_id, canal_mostrador AS mostrador,
			canal_en_linea AS en_linea, canal_externos AS externos FROM productos WHERE id = ${id}`,
		z.object({
			id: z.uuid(),
			nombre: z.string(),
			seccion_id: z.uuid(),
			escuela_id: z.uuid().nullable(),
			categoria_mayoreo_id: z.uuid(),
			mostrador: z.boolean(),
			en_linea: z.boolean(),
			externos: z.boolean(),
		}),
	);
	if (producto === undefined) throw noExiste();
	const tallas = await filas(
		base,
		sql`SELECT v.talla_id, t.grupo_talla_id AS grupo_id, v.es_pedido_especial FROM variantes v
			JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
			WHERE v.producto_id = ${id} AND v.baja_en IS NULL ORDER BY g.orden, t.orden`,
		z.object({ talla_id: z.uuid(), grupo_id: z.uuid(), es_pedido_especial: z.boolean() }),
	);
	const precios = await filas(
		base,
		sql`SELECT lista_id, precio_centavos::int FROM precios WHERE producto_id = ${id} AND variante_id IS NULL
			AND vigente_hasta IS NULL AND lista_id IN (${enLista(listaIds)})`,
		z.object({ lista_id: z.uuid(), precio_centavos: z.number() }),
	);
	const [receta] = await filas(
		base,
		sql`SELECT rv.numero AS version FROM recetas r LEFT JOIN receta_versiones rv ON rv.id = r.version_vigente_id
			WHERE r.producto_id = ${id}`,
		z.object({ version: z.number().nullable() }),
	);
	const medidas = await filas(
		base,
		sql`SELECT m.medida, m.orden, m.talla_id, m.valor_cm FROM recetas r
			JOIN receta_medidas m ON m.receta_version_id = r.version_vigente_id WHERE r.producto_id = ${id} ORDER BY m.orden`,
		z.object({ medida: z.string(), orden: z.number(), talla_id: z.uuid(), valor_cm: z.coerce.number().nullable() }),
	);
	const nombres = [...new Map(medidas.map((medida) => [medida.medida, medida.orden])).entries()];
	return {
		id: producto.id,
		nombre: producto.nombre,
		seccion_id: producto.seccion_id,
		escuela_id: producto.escuela_id,
		categoria_mayoreo_id: producto.categoria_mayoreo_id,
		canales: { mostrador: producto.mostrador, en_linea: producto.en_linea, externos: producto.externos },
		tallas,
		precios,
		receta: receta === undefined || receta.version === null ? null : { version: receta.version },
		medidas: nombres.map(([medida, orden]) => ({
			medida,
			orden,
			valores: medidas.filter((una) => una.medida === medida).map(({ talla_id, valor_cm }) => ({ talla_id, valor_cm })),
		})),
	};
}

export const consultaAltaProducto = implementarConsulta(altaDeProducto, async (contexto, parametros) => {
	const { base, quien } = contexto;
	const tiene = (departamento: string) => tieneDepartamento(quien, departamento);
	// Ventas a externos solo da de alta desde un pedido, igual que la acción.
	if (!tiene("catalogo") && parametros.origen !== "pedido") throw new ErrorDeApi("sin_permiso", "sin_departamento");
	const generales = await filas(
		base,
		sql`SELECT id, nombre, tipo, nombre_corto FROM listas_precios WHERE tipo <> 'cliente' AND baja_en IS NULL ORDER BY orden`,
		z.object({ id: z.uuid(), nombre: z.string(), tipo: tipoDeLista, nombre_corto: z.string().nullable() }),
	);
	const [cliente] =
		parametros.cliente_id === undefined
			? []
			: await filas(
					base,
					sql`SELECT c.id, coalesce(l.nombre, '') AS nombre, l.id AS lista_id, l.nombre_corto FROM clientes c
						LEFT JOIN listas_precios l ON l.cliente_id = c.id AND l.baja_en IS NULL WHERE c.id = ${parametros.cliente_id}`,
					z.object({
						id: z.uuid(),
						nombre: z.string(),
						lista_id: z.uuid().nullable(),
						nombre_corto: z.string().nullable(),
					}),
				);
	const listas = [
		...generales,
		...(cliente?.lista_id == null
			? []
			: [
					{
						id: cliente.lista_id,
						nombre: cliente.nombre,
						tipo: "cliente" as const,
						nombre_corto: cliente.nombre_corto,
					},
				]),
	];
	const [desarrollo] =
		parametros.desarrollo_id === undefined
			? []
			: await filas(
					base,
					sql`SELECT id, folio, prenda, escuela_id FROM desarrollos WHERE id = ${parametros.desarrollo_id}`,
					z.object({ id: z.uuid(), folio: z.string(), prenda: z.string(), escuela_id: z.uuid().nullable() }),
				);
	return {
		resultado: {
			siguiente_codigo: await siguienteCodigo(contexto),
			secciones: await filas(
				base,
				sql`SELECT id, nombre, lleva_receta, tipo_prenda_defecto_id FROM secciones WHERE baja_en IS NULL ORDER BY orden`,
				z.object({
					id: z.uuid(),
					nombre: z.string(),
					lleva_receta: z.boolean(),
					tipo_prenda_defecto_id: z.uuid().nullable(),
				}),
			),
			tipos: await filas(
				base,
				sql`SELECT tp.id, tp.nombre, tp.seccion_id, f.nombre AS flujo FROM tipos_prenda tp
					LEFT JOIN flujos f ON f.id = tp.flujo_defecto_id AND f.baja_en IS NULL
					WHERE tp.baja_en IS NULL ORDER BY tp.orden, tp.nombre`,
				z.object({ id: z.uuid(), nombre: z.string(), seccion_id: z.uuid(), flujo: z.string().nullable() }),
			),
			escuelas: await filas(
				base,
				sql`SELECT id, nombre, color FROM escuelas WHERE baja_en IS NULL ORDER BY nombre`,
				z.object({ id: z.uuid(), nombre: z.string(), color: z.string() }),
			),
			categorias: await filas(
				base,
				sql`SELECT id, nombre, descripcion, defecto_para FROM categorias_mayoreo WHERE baja_en IS NULL ORDER BY orden`,
				z.object({
					id: z.uuid(),
					nombre: z.string(),
					descripcion: z.string(),
					defecto_para: z.enum(["con_escuela", "sin_escuela"]).nullable(),
				}),
			),
			grupos: await filas(
				base,
				sql`SELECT g.id, g.nombre, coalesce((SELECT json_agg(json_build_object('id', t.id, 'nombre', t.nombre) ORDER BY t.orden)
					FROM tallas t WHERE t.grupo_talla_id = g.id AND t.baja_en IS NULL), '[]') AS tallas
					FROM grupos_talla g WHERE g.baja_en IS NULL ORDER BY g.orden`,
				z.object({ id: z.uuid(), nombre: z.string(), tallas: z.array(z.object({ id: z.uuid(), nombre: z.string() })) }),
			),
			listas,
			productos_base: await filas(
				base,
				sql`SELECT p.id, p.nombre, e.nombre AS escuela FROM productos p LEFT JOIN escuelas e ON e.id = p.escuela_id
					WHERE p.baja_en IS NULL AND NOT p.es_servicio ORDER BY p.nombre, e.nombre NULLS FIRST`,
				z.object({ id: z.uuid(), nombre: z.string(), escuela: z.string().nullable() }),
			),
			base:
				parametros.producto_base_id === undefined
					? null
					: await baseDelAlta(
							contexto,
							parametros.producto_base_id,
							listas.map((lista) => lista.id),
						),
			cliente: cliente === undefined ? null : { id: cliente.id, nombre: cliente.nombre, lista_id: cliente.lista_id },
			desarrollo: desarrollo ?? null,
			puede_patronaje: tiene("patronaje"),
		},
	};
});
