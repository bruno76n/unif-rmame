/**
 * Lo que las pruebas por dentro de la tablet llaman en el navegador: la página vacía de las pruebas
 * (`src/pruebas/vacia.html`) carga este archivo, que deja en `window.porDentro` los módulos de la tablet con su base y
 * su conexión, sin arrancar sus pantallas. Lo que no se puede pasar del navegador a la prueba (lo cifrado, los errores)
 * se convierte aquí en texto.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md («La tablet se prueba con Playwright en un Chrome que
 * emula una tablet Android, contra la API real»)
 */

import { Temporal } from "temporal-polyfill";
import { type Encolado, encolar } from "../cola/cola.ts";
import { base, esTablaQueBaja, type Renglon, tablasQueBajan } from "../copia/base.ts";
import { bultosParaTi, tonosDeLosLotes } from "../copia/lecturas.ts";
import { buscarBulto } from "../lector/lector.ts";
import { revisarPin } from "../pin/pin.ts";
import { registrarTablet } from "../registro/registro.ts";
import { HayQueActualizar, SinInternet, TabletRevocada } from "../sincronizacion/api.ts";
import { bajarCambios, bajarFoto } from "../sincronizacion/bajar.ts";
import { estadoDelAparato } from "../sincronizacion/estado.ts";
import { crearMotor } from "../sincronizacion/motor.ts";
import { subirCola } from "../sincronizacion/subir.ts";

/** La tablet de las pruebas llama a la API por el proxy de Vite, en su mismo origen. */
const conexion = { urlBase: "" };

/** El motor de las pruebas, para las que lo arrancan. */
const motor = crearMotor(base, conexion);

/**
 * Corre algo y regresa su resultado, o el nombre del error de la tablet que lo cortó.
 * @param hacer Lo que se corre.
 */
async function intentar<T>(hacer: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; error: string }> {
	try {
		return { ok: true, valor: await hacer() };
	} catch (error) {
		if (error instanceof SinInternet) return { ok: false, error: "sin_internet" };
		if (error instanceof HayQueActualizar) return { ok: false, error: "actualizar" };
		if (error instanceof TabletRevocada) return { ok: false, error: "revocada" };
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Un valor de la base como texto: los bytes, en base64, para buscar en ellos.
 * @param valor Lo que se leyó.
 */
function comoTexto(valor: unknown): unknown {
	if (valor instanceof ArrayBuffer || valor instanceof Uint8Array) {
		return `bytes:${btoa(String.fromCharCode(...new Uint8Array(valor instanceof Uint8Array ? valor.buffer : valor)))}`;
	}
	if (Array.isArray(valor)) return valor.map(comoTexto);
	if (typeof valor === "object" && valor !== null)
		return Object.fromEntries(Object.entries(valor).map(([clave, dentro]) => [clave, comoTexto(dentro)]));
	return valor;
}

/** Lo que las pruebas llaman en el navegador. */
export const porDentro = {
	registrar: (codigo: string) => registrarTablet(base, conexion, codigo, 1),
	bajarFoto: () => intentar(() => bajarFoto(base, conexion)),
	bajar: () => intentar(() => bajarCambios(base, conexion)),
	subir: () => intentar(() => subirCola(base, conexion)),
	encolar: async (encolado: Encolado) => (await encolar(base, encolado)).clave_idempotencia,
	revisarPin: (personaId: string, pin: string) => revisarPin(base, personaId, pin),
	buscarBulto: async (codigo: string) => {
		const busqueda = await buscarBulto(base, codigo);
		return busqueda.encontrado ? String(busqueda.bulto.folio) : busqueda.motivo;
	},
	estadoDelAparato: () => estadoDelAparato(base),
	bultosParaTi: (personaId: string) => bultosParaTi(base, personaId, Temporal.Now.instant()),
	tonosDeLosLotes: async () => Object.fromEntries(await tonosDeLosLotes(base, Temporal.Now.instant())),
	/** Los renglones de una tabla de la copia, como texto. */
	leer: async (tabla: string): Promise<unknown[]> => {
		if (!esTablaQueBaja(tabla)) throw new Error(`no baja ${tabla}`);
		const renglones: Renglon[] = await base.copia(tabla).toArray();
		return renglones.map((renglon) => comoTexto(renglon));
	},
	cola: async () => (await base.cola.orderBy("orden").toArray()).map((comando) => comoTexto(comando)),
	/** Todo lo que guarda la tablet en IndexedDB, como texto, salvo la llave de cifrado (que no se puede leer). */
	todo: async (): Promise<string> => {
		const tablas = [...Object.keys(tablasQueBajan), "cola", "sincronizacion", "aparato", "intentos_pin"];
		const contenido: Record<string, unknown> = {};
		for (const tabla of tablas) contenido[tabla] = comoTexto(await base.table(tabla).toArray());
		return JSON.stringify(contenido);
	},
	/** Si la llave de cifrado se deja exportar. */
	llaveExportable: async (): Promise<boolean> => {
		const guardada = await base.llaves.get("cifrado");
		if (guardada === undefined) return false;
		return crypto.subtle.exportKey("raw", guardada.llave).then(
			() => true,
			() => false,
		);
	},
	motor: {
		arrancar: () => motor.arrancar(),
		sincronizar: () => motor.sincronizar(),
		estado: () => motor.estado(),
		detener: () => motor.detener(),
	},
	/** Borra la base de la tablet, para empezar de cero. */
	borrar: async () => {
		base.close();
		await base.delete();
		await base.open();
	},
};

declare global {
	interface Window {
		porDentro: typeof porDentro;
	}
}

window.porDentro = porDentro;
