/**
 * `inventario.disponibilidad_linea`: qué se le puede prometer al cliente en línea, por talla de los productos activos
 * que se venden en línea (sin las tallas de pedido especial). La consulta de la pestaña Disponibilidad y la lectura del
 * mismo nombre, con la que Pendientes de Tienda en línea cuenta las tallas que salen hoy y las agotadas.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Disponibilidad») y docs/modulos/inventario/reservas.md
 * («Parámetros»: `inventario.orden_surtido_linea`)
 *
 * Sigue el orden de surtido de `inventario.reservar` para un W-, paso por paso, para que lo que se ve sea lo que el W-
 * promete al llegar:
 * - `bodega`: sus libres en Bodega (existencia − reservas activas, como `inventario.libres`);
 * - `aduana_a_bodega`: lo que está en aduana yendo a Bodega y nadie apartó;
 * - `tiendas`: sus libres en una tienda que surte en línea y ya lleva su existencia (con el POS), si su caja no está
 *   sin sincronizar (`admin.aparatos_sin_sincronizar`).
 * Con lo de los dos primeros sale hoy; solo con lo de una tienda, sale mañana; sin nada, agotado.
 */

import {
	disponibilidadLinea,
	type promesasDeDisponibilidad,
} from "@uniformame/compartido/contratos/inventario/disponibilidad-linea";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";

/** Lo que regresa la consulta. */
type Disponibilidad = z.infer<typeof disponibilidadLinea.resultado>;

/** Una promesa. */
type Promesa = (typeof promesasDeDisponibilidad)[number];

/** El texto de cada promesa, como sale al pasar el puntero. */
const textoDePromesa: Readonly<Record<Promesa, string>> = {
	sale_hoy: "Sale hoy: hay en bodega",
	sale_manana: "Sale mañana: está en una tienda",
	agotado: "Agotado",
};

/** Un renglón de la cuenta: una talla con sus libres en cada paso. */
const talla = z.object({
	producto_id: z.uuid(),
	nombre: z.string(),
	variante_id: z.uuid().nullable(),
	talla: z.string().nullable(),
	libres_bodega: z.coerce.number(),
	libres_aduana: z.coerce.number(),
	libres_tiendas: z.coerce.number(),
});

/** Lo que regresa `admin.aparatos_sin_sincronizar`: de cada aparato, su ubicación. */
const sinSincronizar = z.object({ aparatos: z.array(z.object({ ubicacion_id: z.uuid().nullable() })) });

/**
 * Unas ids para `IN (…)`; sin ninguna, una lista que no encuentra nada.
 * @param ids Las ids.
 */
function enLista(ids: readonly string[]): SQL {
	return ids.length === 0
		? sql`NULL::uuid`
		: sql.join(
				ids.map((id) => sql`${id}::uuid`),
				sql`, `,
			);
}

/**
 * Las tiendas que hoy cuentan en el orden de surtido: surten en línea, ya llevan su existencia y su caja no está sin
 * sincronizar. Antes del POS ninguna lleva su existencia.
 * @param contexto El contexto de quien lee.
 */
async function tiendasQueCuentan(contexto: ContextoDeAccion): Promise<string[]> {
	const { rows } = await contexto.transaccion.execute(sql`SELECT id FROM ubicaciones
		WHERE tipo = 'tienda' AND surte_en_linea AND existencia_desde IS NOT NULL AND baja_en IS NULL`);
	const tiendas = z.array(z.object({ id: z.uuid() })).parse(rows);
	if (tiendas.length === 0) return [];
	const { aparatos } = sinSincronizar.parse(await contexto.lectura("admin.aparatos_sin_sincronizar", {}));
	const apagadas = new Set(aparatos.map((aparato) => aparato.ubicacion_id));
	return tiendas.filter((tienda) => !apagadas.has(tienda.id)).map((tienda) => tienda.id);
}

/**
 * Los pasos del orden de surtido en línea, del parámetro `inventario.orden_surtido_linea`.
 * @param contexto El contexto de quien lee.
 */
async function pasosDeSurtido(contexto: ContextoDeAccion): Promise<Set<string>> {
	const orden = await contexto.lectura("admin.parametro", { clave: "inventario.orden_surtido_linea" });
	return new Set(
		String(orden)
			.split(",")
			.map((paso) => paso.trim()),
	);
}

/**
 * Lee las tallas con sus libres en cada paso del orden de surtido.
 * @param contexto El contexto de quien lee.
 * @param filtro El producto o las variantes, si se piden.
 * @param tiendas Las tiendas que cuentan.
 */
async function leerTallas(
	contexto: ContextoDeAccion,
	filtro: { productoId: string | undefined; varianteIds: readonly string[] | undefined },
	tiendas: readonly string[],
) {
	const bodega = sql`(SELECT id FROM ubicaciones WHERE tipo = 'bodega' AND baja_en IS NULL ORDER BY orden LIMIT 1)`;
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT p.id AS producto_id, p.nombre, v.id AS variante_id, t.nombre AS talla,
			coalesce((SELECT e.piezas FROM existencias e WHERE e.ubicacion_id = ${bodega} AND e.variante_id = v.id), 0)
				- coalesce((SELECT sum(r.piezas) FROM reservas r
					WHERE r.estado = 'activa' AND r.ubicacion_id = ${bodega} AND r.variante_id = v.id), 0) AS libres_bodega,
			coalesce((SELECT sum(greatest(0, q.queda - q.apartadas)) FROM (
				SELECT sum(coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas) AS queda,
					coalesce((SELECT sum(r.piezas) FROM reservas r
						WHERE r.estado = 'activa' AND r.traspaso_id = tr.id AND r.variante_id = v.id), 0) AS apartadas
				FROM traspasos tr JOIN traspaso_lineas l ON l.traspaso_id = tr.id
				WHERE tr.estado = 'en_aduana' AND tr.destino_ubicacion_id = ${bodega} AND l.variante_id = v.id
				GROUP BY tr.id) q), 0) AS libres_aduana,
			coalesce((SELECT sum(greatest(0, e.piezas - coalesce((SELECT sum(r.piezas) FROM reservas r
					WHERE r.estado = 'activa' AND r.ubicacion_id = e.ubicacion_id AND r.variante_id = v.id), 0)))
				FROM existencias e WHERE e.variante_id = v.id AND e.ubicacion_id IN (${enLista(tiendas)})), 0) AS libres_tiendas
		FROM productos p
		LEFT JOIN variantes v ON v.producto_id = p.id AND v.baja_en IS NULL AND v.descontinuada_en IS NULL
			AND NOT v.es_pedido_especial
		LEFT JOIN tallas t ON t.id = v.talla_id
		WHERE p.baja_en IS NULL AND p.canal_en_linea AND NOT p.es_servicio
			${filtro.productoId === undefined ? sql`` : sql`AND p.id = ${filtro.productoId}::uuid`}
			${filtro.varianteIds === undefined ? sql`` : sql`AND v.id IN (${enLista(filtro.varianteIds)})`}
		ORDER BY lower(p.nombre), p.id, ${ordenDeTallas("t")}, t.nombre`);
	return z.array(talla).parse(rows);
}

/**
 * La disponibilidad en línea, por producto y talla.
 * @param contexto El contexto de quien lee (una consulta lo corre con `comoAccion`).
 * @param filtro El producto o las variantes, si se piden.
 * @returns Los productos con la promesa de cada talla, y cuántas tallas hay de cada promesa.
 */
export async function leerDisponibilidadLinea(
	contexto: ContextoDeAccion,
	filtro: { productoId: string | undefined; varianteIds: readonly string[] | undefined },
): Promise<Disponibilidad> {
	const pasos = await pasosDeSurtido(contexto);
	const tiendas = pasos.has("tiendas") ? await tiendasQueCuentan(contexto) : [];
	const productos: Disponibilidad["productos"] = [];
	const conteos = { sale_hoy: 0, sale_manana: 0, agotado: 0 };
	for (const fila of await leerTallas(contexto, filtro, tiendas)) {
		let producto = productos.at(-1);
		if (producto?.producto_id !== fila.producto_id) {
			producto = { producto_id: fila.producto_id, nombre: fila.nombre, tallas: [] };
			productos.push(producto);
		}
		if (fila.variante_id === null) continue;
		// El orden de surtido, paso por paso: lo de Bodega y lo de Aduana salen hoy; lo de una tienda, mañana.
		const hoy =
			(pasos.has("bodega") && fila.libres_bodega > 0) || (pasos.has("aduana_a_bodega") && fila.libres_aduana > 0);
		const promesa: Promesa = hoy ? "sale_hoy" : fila.libres_tiendas > 0 ? "sale_manana" : "agotado";
		conteos[promesa] += 1;
		producto.tallas.push({
			variante_id: fila.variante_id,
			talla: fila.talla ?? "",
			promesa,
			texto: textoDePromesa[promesa],
		});
	}
	return { productos, conteos };
}

/**
 * Lee el filtro de la consulta o de la lectura.
 * @param datos `producto_id` y `variante_ids` (separadas por comas), opcionales.
 */
function filtroDe(datos: unknown) {
	const { producto_id, variante_ids } = disponibilidadLinea.entrada.parse(datos);
	return { productoId: producto_id, varianteIds: variante_ids?.split(",") };
}

export const consultaDisponibilidadLinea = implementarConsulta(disponibilidadLinea, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion((accion) => leerDisponibilidadLinea(accion, filtroDe(parametros))),
}));

/**
 * La lectura `inventario.disponibilidad_linea`: la misma cuenta, para Pendientes de Tienda en línea.
 * @param contexto El contexto de quien lee.
 * @param datos Los mismos parámetros que la consulta.
 */
export function lecturaDisponibilidadLinea(contexto: ContextoDeAccion, datos: unknown): Promise<Disponibilidad> {
	return leerDisponibilidadLinea(contexto, filtroDe(datos));
}
