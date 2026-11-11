/**
 * Las ayudas de las pruebas que necesitan proveedores y materiales: escritos directo con el rol dueño, para las
 * pruebas que no prueban su alta (el libro, los traspasos, el cuadre); o con las acciones de Compras, para las de
 * Compras.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md («Cómo se construye»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * Da de alta un proveedor con su tercero, directo en la base.
 * @param servidor El servidor de prueba.
 * @param nombre Su nombre; si no viene, uno que no choca.
 * @returns Su id y el de su tercero.
 */
export async function proveedorDePrueba(servidor: ServidorDePrueba, nombre = `Proveedor ${uuidv7()}`) {
	const terceroId = uuidv7();
	const proveedorId = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO terceros (id, nombre, nombre_busqueda, es_proveedor)
		 VALUES ($1, $2, regexp_replace(sin_acentos(btrim($2)), '\\s+', ' ', 'g'), true)`,
		[terceroId, nombre],
	);
	await servidor.base.dueno.query(
		`INSERT INTO proveedores (id, tercero_id, ciudad, telefono, dias_credito, dias_dice_tardar)
		 VALUES ($1, $2, 'León', '4775550100', 30, 12)`,
		[proveedorId, terceroId],
	);
	return { proveedorId, terceroId };
}

/**
 * Da de alta materiales de un tipo, cada uno con su proveedor habitual y el precio del alta, directo en la base.
 * @param servidor El servidor de prueba.
 * @param cuantos Cuántos.
 * @param tipo Su tipo: la tela va en metros; lo demás, en piezas.
 * @returns Sus ids.
 */
export async function materialesDePrueba(
	servidor: ServidorDePrueba,
	cuantos: number,
	tipo: "tela" | "avio" | "consumible" = "avio",
): Promise<string[]> {
	const { proveedorId } = await proveedorDePrueba(servidor);
	const ids: string[] = [];
	for (let i = 0; i < cuantos; i++) {
		const id = uuidv7();
		const nombre = `Material ${id}`;
		await servidor.base.dueno.query(
			`INSERT INTO materiales (id, nombre, nombre_normalizado, tipo, unidad, dias_cubre, proveedor_habitual_id)
			 VALUES ($1, $2, sin_acentos($2), $3, $4, 60, $5)`,
			[id, nombre, tipo, tipo === "tela" ? "m" : "pza", proveedorId],
		);
		await servidor.base.dueno.query(
			`INSERT INTO material_proveedores (id, material_id, proveedor_id, ultimo_precio_centavos) VALUES ($1, $2, $3, 100)`,
			[uuidv7(), id, proveedorId],
		);
		ids.push(id);
	}
	return ids;
}

/**
 * Compras da de alta un proveedor con su acción.
 * @param servidor El servidor de prueba.
 * @param datos Lo que cambia de la ficha de ejemplo (Textiles Aurora, de León).
 * @returns Su id.
 */
export async function altaDeProveedor(
	servidor: ServidorDePrueba,
	datos: Record<string, unknown> = {},
): Promise<string> {
	const respuesta = await mandarAccion(
		servidor,
		"compras.crear_proveedor",
		{
			datos: {
				nombre: `Proveedor ${uuidv7()}`,
				ciudad: "León",
				telefono: "477 555 0100",
				dias_credito: 30,
				dias_dice_tardar: 12,
				...datos,
			},
		},
		"compras",
	);
	if (respuesta.estado !== 200) throw new Error(`el alta del proveedor respondió ${JSON.stringify(respuesta.cuerpo)}`);
	return z.object({ proveedor_id: z.uuid() }).parse(respuesta.cuerpo.resultado).proveedor_id;
}

/**
 * Compras da de alta un material con su acción.
 * @param servidor El servidor de prueba.
 * @param proveedorId Su proveedor habitual.
 * @param datos Lo que cambia del material de ejemplo (un avío en piezas, a $0.38).
 * @returns Su id.
 */
export async function altaDeMaterial(
	servidor: ServidorDePrueba,
	proveedorId: string,
	datos: Record<string, unknown> = {},
): Promise<string> {
	const respuesta = await mandarAccion(
		servidor,
		"compras.crear_material",
		{
			datos: {
				nombre: `Material ${uuidv7()}`,
				tipo: "avio",
				unidad: "pza",
				proveedor_id: proveedorId,
				costo_centavos: 38,
				minimo: 0,
				multiplo_compra: 1,
				dias_cubre: 60,
				...datos,
			},
		},
		"compras",
	);
	if (respuesta.estado !== 200) throw new Error(`el alta del material respondió ${JSON.stringify(respuesta.cuerpo)}`);
	return z.object({ material_id: z.uuid() }).parse(respuesta.cuerpo.resultado).material_id;
}

/**
 * La versión de un renglón, como la leería la pantalla.
 * @param servidor El servidor de prueba.
 * @param tabla La tabla (de las de Compras).
 * @param id El renglón.
 */
export async function versionDe(
	servidor: ServidorDePrueba,
	tabla: "proveedores" | "materiales",
	id: string,
): Promise<number> {
	const { rows } = await servidor.base.dueno.query(`SELECT version FROM ${tabla} WHERE id = $1`, [id]);
	return Number(rows[0]?.version);
}
