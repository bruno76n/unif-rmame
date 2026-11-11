/**
 * Ayudas para probar la receta: los materiales de ejemplo (la gabardina, el cierre y el hilo), una prenda nueva con
 * su receta, y guardarla como Patronaje.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 2)
 */

import { v7 as uuidv7 } from "uuid";
import { nuevoProducto, type SiembraDelCatalogo } from "./catalogo-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor } from "./compras-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Los materiales de ejemplo de una receta. */
export interface MaterialesDeReceta {
	gabardina: string;
	popelina: string;
	cierre: string;
	hilo: string;
}

/**
 * Da de alta los materiales de ejemplo: dos telas en metros, un cierre en piezas y un hilo en conos de 5,000 m que
 * Patronaje captura en metros.
 * @param servidor El servidor de prueba.
 */
export async function materialesDeReceta(servidor: ServidorDePrueba): Promise<MaterialesDeReceta> {
	const proveedor = await altaDeProveedor(servidor);
	const sufijo = uuidv7().slice(-8);
	const tela = (nombre: string) =>
		altaDeMaterial(servidor, proveedor, {
			nombre: `${nombre} ${sufijo}`,
			tipo: "tela",
			unidad: "m",
			costo_centavos: 7_800,
		});
	return {
		gabardina: await tela("Gabardina azul marino"),
		popelina: await tela("Popelina blanca"),
		cierre: await altaDeMaterial(servidor, proveedor, { nombre: `Cierre 14 cm ${sufijo}` }),
		hilo: await altaDeMaterial(servidor, proveedor, {
			nombre: `Hilo poliéster marino ${sufijo}`,
			unidad: "conos",
			unidad_receta: "m",
			factor_receta: "5000",
		}),
	};
}

/** Una prenda nueva con su receta vacía. */
export interface PrendaConReceta {
	productoId: string;
	recetaId: string;
	/** Sus tallas, por nombre. */
	tallas: Record<string, string>;
}

/**
 * Da de alta una prenda de Playeras (tallas 4, 6 y 8) con su receta en «Sin receta».
 * @param servidor El servidor de prueba.
 * @param siembra Los ids de la siembra del catálogo.
 * @param cambios Lo que cambia del alta.
 */
export async function prendaConReceta(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
	cambios: Record<string, unknown> = {},
): Promise<PrendaConReceta> {
	const producto = await nuevoProducto(servidor, siembra, cambios);
	const { rows } = await servidor.base.dueno.query("SELECT id FROM recetas WHERE producto_id = $1", [
		producto.producto_id,
	]);
	return {
		productoId: producto.producto_id,
		recetaId: String(rows[0]?.id),
		tallas: Object.fromEntries(producto.variantes.map((variante) => [variante.talla, variante.talla_id])),
	};
}

/**
 * La versión de la receta (del agregado), como la leería la pantalla.
 * @param servidor El servidor de prueba.
 * @param recetaId La receta.
 */
export async function versionDeLaReceta(servidor: ServidorDePrueba, recetaId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM recetas WHERE id = $1", [
		recetaId,
	]);
	return Number(rows[0]?.version);
}

/**
 * Patronaje guarda la receta con la versión de ahora.
 * @param servidor El servidor de prueba.
 * @param prenda La prenda.
 * @param datos Lo que se guarda (sin el producto).
 */
export async function guardarRecetaDePrueba(
	servidor: ServidorDePrueba,
	prenda: PrendaConReceta,
	datos: Record<string, unknown>,
) {
	return mandarAccion(
		servidor,
		"patronaje.guardar_receta",
		{
			datos: { producto_id: prenda.productoId, ...datos },
			version: await versionDeLaReceta(servidor, prenda.recetaId),
		},
		"patronaje",
	);
}

/**
 * Una receta completa de ejemplo: la gabardina por talla, el cierre igual en todas y el hilo en metros, con una
 * medida.
 * @param prenda La prenda.
 * @param materiales Los materiales de ejemplo.
 * @param tela Los metros de gabardina de cada talla (4, 6 y 8).
 */
export function recetaDeEjemplo(
	prenda: PrendaConReceta,
	materiales: MaterialesDeReceta,
	tela: [string, string, string] = ["1.000", "1.050", "1.100"],
): Record<string, unknown> {
	const tallas = ["4", "6", "8"].map((talla) => prenda.tallas[talla] ?? "");
	return {
		medidas: [
			{
				medida: "Largo",
				orden: 1,
				valores: tallas.map((talla_id, i) => ({ talla_id, valor_cm: String(50 + i * 2) })),
			},
		],
		lineas: [
			{
				papel: "tela_principal",
				material_id: materiales.gabardina,
				modo: "por_talla",
				unidad_receta: "m",
				tallas: tallas.map((talla_id, i) => ({ talla_id, cantidad: tela[i] })),
				orden: 1,
			},
			{ papel: "avio", material_id: materiales.cierre, modo: "igual", unidad_receta: "pza", cantidad: "1", orden: 1 },
			{ papel: "avio", material_id: materiales.hilo, modo: "igual", unidad_receta: "m", cantidad: "45", orden: 2 },
		],
	};
}
