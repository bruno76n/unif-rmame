/**
 * La copia local: aplicar lo que baja (página por página, cada una en una transacción) y reemplazarla con la foto sin
 * tocar la cola ni lo que nació en la tablet y todavía no regresa. Los hashes de los PIN se guardan cifrados; el folio
 * de cada bulto, también en mayúsculas para buscarlo sin importar cómo se escriba.
 * Fase 20 · docs/apps/tablet.md («La copia local» y «Cómo baja») y docs/cimientos/SINCRONIZACION.md («Bajar» y «Foto»)
 *
 * Lo que baja se guarda tal cual: el servidor ya manda solo las columnas que le tocan a la tablet, sin precios, costos ni
 * sueldos. Un renglón del servidor reemplaza entero al local, y con él su marca «guardada aquí».
 */

import type { cambioQueBaja } from "@uniformame/compartido/contratos/sincronizacion";
import type { z } from "zod";
import { cifrar, llaveDeCifrado } from "../registro/cifrado.ts";
import { type BaseDeLaTablet, esTablaQueBaja, type Renglon, type TablaQueBaja, tablasQueBajan } from "./base.ts";

/** Un renglón que baja. */
type CambioQueBaja = z.infer<typeof cambioQueBaja>;

/** Un renglón listo para guardarse, o el id que se quita. */
type Preparado =
	| { tabla: TablaQueBaja; op: "cambio"; renglon: Renglon }
	| { tabla: TablaQueBaja; op: "quitar"; id: string };

/**
 * Prepara lo que baja fuera de la transacción (cifrar no puede ir dentro de una de Dexie): los hashes de los PIN, cifrados;
 * el folio de los bultos, también en mayúsculas. Lo de una tabla que la tablet no conoce se ignora.
 * @param base La base local.
 * @param cambios Lo que bajó.
 */
async function preparar(base: BaseDeLaTablet, cambios: readonly CambioQueBaja[]): Promise<Preparado[]> {
	const llave = await llaveDeCifrado(base);
	const preparados: Preparado[] = [];
	for (const cambio of cambios) {
		if (!esTablaQueBaja(cambio.tabla)) continue;
		if (cambio.op === "quitar" || cambio.datos === null) {
			preparados.push({ tabla: cambio.tabla, op: "quitar", id: cambio.id });
			continue;
		}
		const renglon: Renglon = { ...cambio.datos, id: cambio.id };
		if (cambio.tabla === "pines" && typeof renglon.pin_hash === "string") {
			renglon.pin_hash = await cifrar(llave, renglon.pin_hash);
		}
		if (cambio.tabla === "bultos" && typeof renglon.folio === "string") {
			renglon.folio_mayusculas = renglon.folio.toUpperCase();
		}
		preparados.push({ tabla: cambio.tabla, op: "cambio", renglon });
	}
	return preparados;
}

/** Las tablas de la copia, para abrir una transacción sobre todas. */
function tablasDeLaCopia(base: BaseDeLaTablet) {
	return Object.keys(tablasQueBajan).map((tabla) => base.table(tabla));
}

/**
 * Aplica una página de lo que bajó, en una transacción: `cambio` reemplaza el renglón y `quitar` lo borra (si no lo
 * tenía, no pasa nada).
 * @param base La base local.
 * @param cambios La página.
 */
export async function aplicarCambios(base: BaseDeLaTablet, cambios: readonly CambioQueBaja[]): Promise<void> {
	const preparados = await preparar(base, cambios);
	await base.transaction("rw", tablasDeLaCopia(base), async () => {
		for (const preparado of preparados) {
			if (preparado.op === "quitar") await base.copia(preparado.tabla).delete(preparado.id);
			else await base.copia(preparado.tabla).put(preparado.renglon);
		}
	});
}

/**
 * Reemplaza la copia con la foto completa, en una transacción: lo que nació en la tablet y todavía no regresa del
 * servidor se queda, y la cola no se toca.
 * @param base La base local.
 * @param foto Todos los renglones de la foto.
 */
export async function reemplazarConFoto(base: BaseDeLaTablet, foto: readonly CambioQueBaja[]): Promise<void> {
	const preparados = await preparar(base, foto);
	await base.transaction("rw", tablasDeLaCopia(base), async () => {
		for (const tabla of Object.keys(tablasQueBajan)) {
			if (!esTablaQueBaja(tabla)) continue;
			const nacidosAqui = await base
				.copia(tabla)
				.filter((renglon) => renglon._local !== undefined)
				.toArray();
			await base.copia(tabla).clear();
			await base.copia(tabla).bulkPut(nacidosAqui);
		}
		for (const preparado of preparados) {
			if (preparado.op === "cambio") await base.copia(preparado.tabla).put(preparado.renglon);
		}
	});
}
