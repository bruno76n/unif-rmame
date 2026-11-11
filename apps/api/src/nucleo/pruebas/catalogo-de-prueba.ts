/**
 * Ayudas para probar el catálogo: los ids de la siembra (secciones, tallas, listas y categorías) y un producto
 * nuevo dado de alta con su acción.
 * Fase 8 · docs/fases/08-catalogo.md
 */

import { z } from "zod";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Los ids de la siembra del catálogo, por nombre. */
export interface SiembraDelCatalogo {
	secciones: Record<string, string>;
	/** Por grupo, sus tallas por nombre. */
	tallas: Record<string, Record<string, string>>;
	/** Por tipo (`mostrador`, `mayoreo`, `en_linea`). */
	listas: Record<string, string>;
	categorias: Record<string, string>;
	/** Un tipo de prenda de Playeras, para las altas desde cero. */
	tipoPrenda: string;
}

/**
 * Lee los ids de la siembra del catálogo y da de alta un tipo de prenda de Playeras.
 * @param servidor El servidor de prueba.
 */
export async function siembraDelCatalogo(servidor: ServidorDePrueba): Promise<SiembraDelCatalogo> {
	const consultar = async (texto: string) => (await servidor.base.dueno.query(texto)).rows;
	const secciones = Object.fromEntries(
		(await consultar("SELECT id, nombre FROM secciones")).map((fila) => [fila.nombre, fila.id]),
	);
	const tallas: Record<string, Record<string, string>> = {};
	for (const fila of await consultar(
		"SELECT t.id, t.nombre, g.nombre AS grupo FROM tallas t JOIN grupos_talla g ON g.id = t.grupo_talla_id",
	)) {
		tallas[fila.grupo] = { ...(tallas[fila.grupo] ?? {}), [fila.nombre]: fila.id };
	}
	const listas = Object.fromEntries(
		(await consultar("SELECT id, tipo FROM listas_precios WHERE tipo <> 'cliente'")).map((fila) => [
			fila.tipo,
			fila.id,
		]),
	);
	const categorias = Object.fromEntries(
		(await consultar("SELECT id, nombre FROM categorias_mayoreo")).map((fila) => [fila.nombre, fila.id]),
	);
	const existente = await consultar("SELECT id FROM tipos_prenda WHERE nombre = 'Playera de prueba'");
	const tipoPrenda =
		existente[0]?.id ??
		z
			.object({ tipo_prenda_id: z.uuid() })
			.parse(
				(
					await mandarAccion(
						servidor,
						"catalogo.guardar_tipo_prenda",
						{ datos: { nombre: "Playera de prueba", seccion_id: secciones.Playeras, medidas: [] } },
						"catalogo",
					)
				).cuerpo.resultado,
			).tipo_prenda_id;
	return { secciones, tallas, listas, categorias, tipoPrenda };
}

/** Lo que regresa el alta de un producto. */
export const productoCreado = z.object({
	producto_id: z.uuid(),
	variantes: z.array(z.object({ variante_id: z.uuid(), talla_id: z.uuid(), talla: z.string(), codigo: z.string() })),
	codigo_desde: z.string(),
	codigo_hasta: z.string(),
	mensaje: z.string(),
});

/**
 * Los datos de un alta desde cero en Playeras, con tallas Infantil y precio de Mostrador.
 * @param siembra Los ids de la siembra.
 * @param cambios Lo que cambia de esa alta.
 */
export function altaDesdeCero(
	siembra: SiembraDelCatalogo,
	cambios: Record<string, unknown> = {},
): Record<string, unknown> {
	const infantil = siembra.tallas.Infantil ?? {};
	return {
		modo: "desde_cero",
		origen: "catalogo",
		nombre: `Playera ${Math.random().toString(36).slice(2, 10)}`,
		seccion_id: siembra.secciones.Playeras,
		escuela_id: null,
		tipo_prenda_id: siembra.tipoPrenda,
		categoria_mayoreo_id: siembra.categorias.Básico,
		tallas: ["4", "6", "8"].map((talla) => ({ talla_id: infantil[talla], es_pedido_especial: false })),
		canales: ["mostrador"],
		precios: [{ lista_id: siembra.listas.mostrador, precio_centavos: 25_000 }],
		...cambios,
	};
}

/**
 * Da de alta un producto como Catálogo.
 * @returns Lo que regresó el alta.
 * @throws Error si no se creó.
 */
export async function nuevoProducto(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
	cambios: Record<string, unknown> = {},
): Promise<z.infer<typeof productoCreado>> {
	const respuesta = await mandarAccion(
		servidor,
		"catalogo.crear_producto",
		{ datos: altaDesdeCero(siembra, cambios) },
		"catalogo",
	);
	if (respuesta.estado !== 200) throw new Error(`no se creó el producto: ${JSON.stringify(respuesta.cuerpo)}`);
	return productoCreado.parse(respuesta.cuerpo.resultado);
}

/**
 * La versión de un producto.
 * @param servidor El servidor de prueba.
 * @param productoId El producto.
 */
export async function versionDelProducto(servidor: ServidorDePrueba, productoId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM productos WHERE id = $1", [
		productoId,
	]);
	return Number(rows[0]?.version);
}
