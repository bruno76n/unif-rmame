/**
 * La siembra del catálogo, parte de la siembra del sistema: las siete secciones, los cuatro grupos de tallas, las
 * tres listas de precios generales y las cuatro categorías de mayoreo.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md, tallas-y-tipos-de-prenda.md y listas-de-precios.md
 * («La siembra»)
 *
 * Agrega lo que falte y nunca cambia lo que ya existe: si Catálogo ya agregó o reordenó tallas, se quedan así.
 */

import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { Base } from "../../nucleo/base/conexion.ts";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { categoriasMayoreo, gruposTalla, listasPrecios, secciones, tallas } from "./tablas.ts";

/** Las secciones, en su orden, y si llevan receta. */
const lasSecciones: readonly [string, boolean][] = [
	["Playeras", true],
	["Camisas y batas", true],
	["Suéteres y chalecos", true],
	["Pants y sudaderas", true],
	["Faldas, jumpers y mandiles", true],
	["Pantalones", true],
	["Accesorios y servicios", false],
];

/** Los grupos de tallas, en su orden, con sus tallas en orden. */
const losGrupos: readonly [string, readonly string[]][] = [
	["Infantil", ["3", "4", "6", "8", "10", "12", "14", "16", "18"]],
	["Juvenil y adulto", ["CH", "M", "G", "XG", "XXG"]],
	["Pantalón por cintura", ["26", "28", "30", "32", "34", "36", "38"]],
	["Talla única", ["Única"]],
];

/** La siembra de `secciones`. */
export const semillaDeSecciones: Semilla = {
	tabla: secciones,
	filas: lasSecciones.map(([nombre, llevaReceta], i) => ({ id: uuidv7(), nombre, orden: i + 1, llevaReceta })),
};

/**
 * Siembra los grupos que falten y, en cada grupo, las tallas que falten.
 * @param base La base, con el rol dueño.
 * @returns Cuántos renglones agregó.
 */
async function sembrarGrupos(base: Base): Promise<number> {
	let agregados = 0;
	for (const [i, [nombre, deLaTalla]] of losGrupos.entries()) {
		const grupo = await base
			.insert(gruposTalla)
			.values({ id: uuidv7(), nombre, orden: i + 1 })
			.onConflictDoNothing();
		agregados += grupo.rowCount ?? 0;
		const { rows } = await base.execute(sql`SELECT id FROM grupos_talla WHERE lower(nombre) = lower(${nombre})`);
		const grupoId = z.object({ id: z.string() }).parse(rows[0]).id;
		const nuevas = await base
			.insert(tallas)
			.values(
				deLaTalla.map((talla, orden) => ({ id: uuidv7(), grupoTallaId: grupoId, nombre: talla, orden: orden + 1 })),
			)
			.onConflictDoNothing();
		agregados += nuevas.rowCount ?? 0;
	}
	return agregados;
}

/** La siembra de los grupos de tallas con sus tallas. */
export const semillaDeGruposTalla: Semilla = { sembrar: sembrarGrupos };

/** La siembra de las tres listas generales. */
export const semillaDeListasPrecios: Semilla = {
	tabla: listasPrecios,
	filas: [
		["mostrador", "Mostrador", "La que cobran las dos tiendas en el mostrador."],
		[
			"mayoreo",
			"Mayoreo",
			"Mayoreo en mostrador: el descuento de cada cliente se aplica según la categoría de cada prenda.",
		],
		["en_linea", "En línea", "La que ve la tienda en línea. Los pedidos especiales no se publican."],
	].map(([tipo, nombre, descripcion], i) => ({
		id: uuidv7(),
		tipo,
		nombre,
		nombreCorto: nombre,
		descripcion,
		orden: i + 1,
	})),
};

/** La siembra de las cuatro categorías de mayoreo. */
export const semillaDeCategoriasMayoreo: Semilla = {
	tabla: categoriasMayoreo,
	filas: [
		["Básico", "basicos", "sin_escuela", "Prenda lisa, sin escudo. Lleva el % de básicos de cada cliente de mayoreo."],
		["Especial", "especiales", "con_escuela", "Con escudo o modelo de escuela. Lleva el % de especiales."],
		["Accesorio", "basicos", null, "Lleva el % de básicos."],
		[
			"Sin descuento",
			"ninguno",
			null,
			"Escudos, pegado de escudo y bordado de nombre: no llevan descuento de mayoreo.",
		],
	].map(([nombre, porcentajeQueAplica, defectoPara, descripcion], i) => ({
		id: uuidv7(),
		nombre,
		porcentajeQueAplica,
		defectoPara,
		descripcion,
		orden: i + 1,
	})),
};
