/**
 * Lo que siembra `compras`: la lista «Unidades de material» con sus seis unidades.
 * Fase 10 · docs/modulos/compras/materiales.md («La lista «Unidades de material»») y
 * docs/modulos/admin/configuracion.md («Las listas que hay»)
 *
 * La lista es de `admin` (sus tablas), pero la siembra el archivo de su tema. La dueña puede agregar más; lo que
 * ya está nunca cambia.
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Base } from "../../nucleo/base/conexion.ts";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { listas, listaValores } from "../admin/tablas.ts";

/** La clave de la lista. */
export const listaDeUnidades = "unidades_material";

/** Las unidades: nombre, clave y si se cuenta entera. */
const unidades: readonly [string, string, boolean][] = [
	["m", "m", false],
	["pza", "pza", true],
	["conos", "conos", true],
	["cajas", "cajas", true],
	["L", "l", false],
	["kg", "kg", false],
];

/**
 * Siembra la lista y las unidades que falten.
 * @param base La base, con el rol dueño.
 * @returns Cuántos renglones nuevos agregó.
 */
async function sembrarUnidades(base: Base): Promise<number> {
	const nueva = await base
		.insert(listas)
		.values({ id: uuidv7(), clave: listaDeUnidades, nombre: "Unidades de material", modulo: "compras" })
		.onConflictDoNothing();
	const [lista] = await base.select({ id: listas.id }).from(listas).where(eq(listas.clave, listaDeUnidades));
	if (lista === undefined) throw new Error("no se sembró la lista de unidades de material");
	const valores = await base
		.insert(listaValores)
		.values(
			unidades.map(([nombre, clave, seCuentaEntera], i) => ({
				id: uuidv7(),
				listaId: lista.id,
				nombre,
				nombreNormalizado: clave,
				clave,
				seCuentaEntera,
				orden: i + 1,
			})),
		)
		.onConflictDoNothing();
	return (nueva.rowCount ?? 0) + (valores.rowCount ?? 0);
}

/** La siembra de «Unidades de material». */
export const semillaDeUnidades: Semilla = { sembrar: sembrarUnidades };
