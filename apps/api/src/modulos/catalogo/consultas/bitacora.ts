/**
 * `catalogo.bitacora`: la pestaña Bitácora de Catálogo, los cambios de los productos, lo más reciente arriba.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Bitácora») y docs/modulos/admin/bitacora.md
 *
 * Lee los renglones de cambio de la bitácora cuyo documento es un producto (los escriben las acciones de Catálogo y,
 * con el precio en línea, las de Tienda en línea). El tipo de cambio sale de la acción y de lo que cambió: el precio
 * (su descripción empieza con «Precio»), el alta, la baja de una talla, descontinuar, reactivar, agregar talla, un canal
 * y la categoría de mayoreo. La lista filtra los cambios de precio de esa lista; el buscador, por producto, persona o
 * código. Va por páginas con el cursor del último renglón.
 */

import { bitacoraDeCatalogo, tiposDeCambio } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { cursorDe, leerCursor } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { filas } from "./comunes.ts";

/** Cuántos renglones por página si no se pide otro número. */
const porPagina = 50;

/** El tipo de cambio de un renglón `b`, en SQL. */
const tipoDeCambio = sql`CASE
	WHEN b.descripcion LIKE 'Precio %' THEN 'precio'
	WHEN b.accion = 'catalogo.crear_producto' THEN 'producto_nuevo'
	WHEN b.accion = 'catalogo.dar_baja_talla' THEN 'variante_baja'
	WHEN b.accion = 'catalogo.descontinuar_productos' THEN 'descontinuado'
	WHEN b.accion = 'catalogo.reactivar_producto' THEN 'reactivado'
	WHEN b.accion = 'catalogo.agregar_talla' THEN 'talla_agregada'
	WHEN b.descripcion LIKE 'Empieza a venderse%' OR b.descripcion LIKE 'Deja de venderse%' THEN 'canal'
	WHEN b.despues ? 'categoria_mayoreo_id' THEN 'categoria'
	END`;

/** Un renglón como lo lee la base. */
const renglonLeido = z.object({
	id: z.uuid(),
	ocurrido_en: z.string(),
	quien: z.string(),
	tipo_cambio: z.enum(tiposDeCambio).nullable(),
	producto_id: z.uuid().nullable(),
	producto: z.string().nullable(),
	escuela: z.string().nullable(),
	detalle: z.string(),
});

/**
 * Los filtros de la pestaña, sobre `b` (el renglón), `p` (el producto) y `quien`.
 * @param parametros Lo que viene en la dirección.
 */
function filtros(parametros: z.infer<typeof bitacoraDeCatalogo.entrada>): SQL {
	const partes: SQL[] = [sql`b.entidad = 'productos'`, sql`b.tipo = 'cambio'`];
	if (parametros.tipo_cambio !== undefined) partes.push(sql`(${tipoDeCambio}) = ${parametros.tipo_cambio}`);
	if (parametros.lista_id !== undefined) {
		partes.push(sql`b.descripcion LIKE 'Precio %'`);
		partes.push(
			sql`(b.despues->>'lista_id' = ${parametros.lista_id} OR b.antes->>'lista_id' = ${parametros.lista_id})`,
		);
	}
	const buscar = parametros.buscar ?? "";
	if (/^\d{4,}$/.test(buscar)) {
		partes.push(sql`EXISTS (SELECT 1 FROM variantes v WHERE v.producto_id = p.id AND v.codigo LIKE ${`${buscar}%`})`);
	} else if (buscar !== "") {
		const patron = `%${buscar.toLocaleLowerCase("es-MX")}%`;
		partes.push(
			sql`(sin_acentos(lower(coalesce(p.nombre, ''))) LIKE sin_acentos(${patron}) OR sin_acentos(lower(quien.nombre)) LIKE sin_acentos(${patron}))`,
		);
	}
	return sql.join(partes, sql` AND `);
}

/** De dónde sale cada renglón: el producto, su escuela y quién lo hizo. */
const desde = sql`FROM bitacora b LEFT JOIN productos p ON p.id = b.entidad_id LEFT JOIN escuelas e ON e.id = p.escuela_id
	LEFT JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN dispositivos d ON d.id = b.dispositivo_id
	LEFT JOIN personas pe ON pe.id = coalesce(b.persona_id, u.persona_id)
	CROSS JOIN LATERAL (SELECT coalesce(pe.nombre, u.nombre, u.correo, d.nombre, 'El sistema') AS nombre) quien`;

export const consultaBitacora = implementarConsulta(bitacoraDeCatalogo, async ({ base }, parametros) => {
	const donde = filtros(parametros);
	const posicion = leerCursor(parametros.cursor);
	const despues =
		posicion === undefined
			? sql`true`
			: sql`(b.ocurrido_en, b.id) < (${String(posicion.ocurrido_en)}::timestamptz, ${String(posicion.id)}::uuid)`;
	const limite = parametros.limite ?? porPagina;
	const leidos = await filas(
		base,
		sql`SELECT b.id, b.ocurrido_en::text AS ocurrido_en, quien.nombre AS quien, ${tipoDeCambio} AS tipo_cambio,
			p.id AS producto_id, p.nombre AS producto, e.nombre AS escuela, b.descripcion AS detalle
			${desde} WHERE ${donde} AND ${despues} ORDER BY b.ocurrido_en DESC, b.id DESC LIMIT ${limite + 1}`,
		renglonLeido,
	);
	const [total] = await filas(
		base,
		sql`SELECT count(*)::int AS n ${desde} WHERE ${donde}`,
		z.object({ n: z.number() }),
	);
	const listas = await filas(
		base,
		sql`SELECT id, nombre, tipo FROM listas_precios WHERE baja_en IS NULL ORDER BY tipo = 'cliente', orden, nombre`,
		z.object({ id: z.uuid(), nombre: z.string(), tipo: z.enum(["mostrador", "mayoreo", "en_linea", "cliente"]) }),
	);
	const pagina = leidos.slice(0, limite);
	const ultimo = pagina.at(-1);
	return {
		resultado: {
			renglones: pagina.map((renglon) => ({
				...renglon,
				ocurrido_en: new Date(renglon.ocurrido_en).toISOString(),
			})),
			total: total?.n ?? 0,
			cursor:
				leidos.length > limite && ultimo !== undefined
					? cursorDe({ ocurrido_en: ultimo.ocurrido_en, id: ultimo.id })
					: null,
			hay_mas: leidos.length > limite,
			listas,
		},
	};
});
