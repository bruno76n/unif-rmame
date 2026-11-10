/**
 * El servidor de las pruebas de la fase 3: la API con el módulo de prueba, sobre la base copia del archivo.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 *
 * Quién llama sale del encabezado `x-prueba-quien`, que solo existe aquí, y su «Confirmar con Google», de
 * `x-prueba-google`; con `sesionReal`, de la cookie de la sesión, como en la API. El permiso es la revisión
 * de la API (`acceso/permisos.ts`); la bitácora y los eventos de prueba cuentan cuántas veces se piden.
 */

import { join } from "node:path";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { emisorDeGoogle } from "@uniformame/pruebas/simuladores/google";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { Temporal } from "temporal-polyfill";
import { armarDescripciones } from "../../modulos/admin/internas/escribir-bitacora.ts";
import { modulosDeLaBitacora } from "../../modulos/admin/tablas.ts";
import { crearServidor, type ServiciosDelServidor } from "../../servidor.ts";
import { llaveDeLaEntrada } from "../acceso/cookies.ts";
import { crearAccesoConGoogle } from "../acceso/google.ts";
import { identificarConSesion } from "../acceso/identificar.ts";
import { revisionDePermisos } from "../acceso/permisos.ts";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../acciones/corredor.ts";
import type { Almacen } from "../almacen.ts";
import { crearBase } from "../base/conexion.ts";
import { type Semilla, sembrarSistema } from "../base/siembra.ts";
import { cargarModulos, type RegistroDeModulos, registrarModulos } from "../modulos.ts";
import { crearAvisosEnVivo } from "../sincronizacion/eventos-en-vivo.ts";
import { quienesDePrueba } from "./cuentas-de-prueba.ts";
import * as tablasDePrueba from "./modulos/prueba/tablas.ts";

/** Los dominios de las pruebas. */
export const dominios = {
	DOMINIO_WEB: "https://fabrica.prueba.invalid",
	DOMINIO_TALLER: "https://taller.prueba.invalid",
};

/** El cliente de Google de las pruebas y su dirección de vuelta. */
export const clienteDeGooglePrueba = {
	id: "cliente-de-prueba.apps.googleusercontent.com",
	secreto: "secreto-del-cliente-de-prueba",
	vuelta: "https://api.prueba.invalid/v1/acceso/google/vuelta",
};

/**
 * El registro con la lectura que dará `dispositivos` (fase 6): los datos de un aparato. Las cuentas ya son
 * las de `usuarios`, que la base plantilla trae (`cuentas-de-prueba.ts`).
 * @param registro Lo que registraron los módulos.
 * @param aparatos Los aparatos de prueba.
 */
export function conAparatosDePrueba(
	registro: RegistroDeModulos,
	aparatos: ReadonlyMap<string, AparatoDePrueba> = aparatosDePrueba(),
): RegistroDeModulos {
	const lecturas = new Map(registro.lecturas);
	lecturas.set("admin.datos_de_aparato", async (_contexto, datos) => {
		const id =
			typeof datos === "object" && datos !== null && "dispositivo_id" in datos ? String(datos.dispositivo_id) : "";
		return aparatos.get(id);
	});
	return { ...registro, lecturas };
}

/** Los datos de un aparato como los dará `dispositivos` en la fase 6. */
export interface AparatoDePrueba {
	tipo: string;
	revocado: boolean;
	nombre: string;
	ultimo_contacto_en: string | null;
	version_app: string | null;
}

/**
 * Los aparatos de prueba, por su id: los dos puentes, conectados ahora con la versión 1.0.0. La prueba
 * los cambia para ver un puente callado, viejo o revocado.
 */
export function aparatosDePrueba(): Map<string, AparatoDePrueba> {
	const ahora = new Date().toISOString();
	return new Map([
		[
			"01936f2e-0000-7000-8000-000000000031",
			{
				tipo: "puente_impresion",
				revocado: false,
				nombre: "Puente de Aduana",
				ultimo_contacto_en: ahora,
				version_app: "1.0.0",
			},
		],
		[
			"01936f2e-0000-7000-8000-000000000032",
			{
				tipo: "puente_impresion",
				revocado: false,
				nombre: "Puente del Taller",
				ultimo_contacto_en: ahora,
				version_app: "1.0.0",
			},
		],
		[
			"01936f2e-0000-7000-8000-000000000021",
			{
				tipo: "tablet_taller",
				revocado: false,
				nombre: "Tablet del taller",
				ultimo_contacto_en: ahora,
				version_app: "1.0.0",
			},
		],
	]);
}

/** Lo que guarda el servidor de prueba para que las pruebas lo revisen. */
export interface ServidorDePrueba {
	app: Awaited<ReturnType<typeof crearServidor>>;
	base: BaseDePrueba;
	/** Las veces que el corredor pidió la bitácora y los eventos, con lo que pidió. */
	pedidos: { bitacora: unknown[][]; eventos: unknown[][] };
	/** Lo que escribió el registro técnico. */
	registro: string[];
	/** Lo que registraron los módulos de la API y los de prueba. */
	modulos: RegistroDeModulos;
	/** Los aparatos de prueba, que la prueba puede cambiar. */
	aparatos: Map<string, AparatoDePrueba>;
	/** La versión mínima del parámetro, que la prueba puede cambiar. */
	parametros: { versionMinima: string };
	/**
	 * Para que una prueba haga fallar la bitácora: siempre (`bitacora`), o una sola vez para la acción cuyo
	 * renglón nombra uno de estos textos (`bitacoraUnaVez`), como una falla pasajera.
	 */
	fallas: { bitacora: boolean; bitacoraUnaVez: Set<string> };
	cerrar: () => Promise<void>;
}

/** El alcance de la tablet de prueba: baja las notas de la ubicación de prueba. */
export const alcanceDeLaTablet = {
	tablas: ["prueba_notas"],
	ubicacionIds: ["01936f2e-0000-7000-8000-0000000000b1"],
};

/**
 * Una base copia con las tablas del módulo de prueba, sus disparadores y su siembra (sus parámetros, sus
 * listas y la empresa de prueba).
 * @param semillas Las semillas de los módulos de prueba.
 */
async function crearBaseConTablasDePrueba(semillas: readonly Semilla[]): Promise<BaseDePrueba> {
	const base = await crearBaseDePrueba();
	for (const sentencia of await generateMigration(
		generateDrizzleJson({}),
		generateDrizzleJson({ ...tablasDePrueba }),
	)) {
		await base.dueno.query(sentencia);
	}
	for (const tabla of ["prueba_notas", "prueba_renglones", "prueba_conteos"]) {
		await base.dueno.query(`SELECT poner_disparador_comun('${tabla}')`);
	}
	await sembrarSistema(crearBase(base.dueno), semillas);
	// La bitácora solo acepta los módulos del sistema; en esta base también el de prueba.
	await base.dueno.query(`
		ALTER TABLE bitacora DROP CONSTRAINT bitacora_modulo;
		ALTER TABLE bitacora ADD CONSTRAINT bitacora_modulo
			CHECK (modulo in (${[...modulosDeLaBitacora, "prueba"].map((modulo) => `'${modulo}'`).join(", ")}));
	`);
	return base;
}

/**
 * Arma la API de prueba: una base copia con las tablas del módulo de prueba y el registro de esta carpeta.
 * @param opciones `entorno` (por omisión, `pruebas`); `avisosEnVivo` para tener `GET /v1/eventos` (con su
 * latido); `otraInstanciaDe` para levantar una segunda instancia sobre la base de otra, como en Render;
 * `almacen` para los archivos (el de R2, sobre su simulador); `conGoogle` para la entrada con Google, contra
 * el simulador de Google (`clienteDeGooglePrueba`); `sesionReal` para identificar con la cookie `ua_sesion`
 * en lugar de `x-prueba-quien`.
 */
export async function crearServidorDePrueba(
	opciones: {
		entorno?: "local" | "pruebas" | "produccion";
		avisosEnVivo?: { latidoMs: number };
		otraInstanciaDe?: ServidorDePrueba;
		almacen?: Almacen;
		conGoogle?: true;
		sesionReal?: true;
	} = {},
): Promise<ServidorDePrueba> {
	const modulosDePrueba = await cargarModulos(join(import.meta.dirname, "modulos"));
	const base = opciones.otraInstanciaDe?.base ?? (await crearBaseConTablasDePrueba(modulosDePrueba.semillas));
	const deLaApi = await cargarModulos(join(import.meta.dirname, "../../modulos"));
	const aparatos = aparatosDePrueba();
	const registro = conAparatosDePrueba(registrarModulos([...deLaApi.modulos, ...modulosDePrueba.modulos]), aparatos);
	const pedidos: ServidorDePrueba["pedidos"] = { bitacora: [], eventos: [] };
	const lineas: string[] = [];
	const parametros = { versionMinima: "1.0.0" };
	const fallas = { bitacora: false, bitacoraUnaVez: new Set<string>() };
	const servicios: ServiciosDelServidor = {
		identificar: async (peticion) => {
			if (opciones.sesionReal === true)
				return identificarConSesion(crearBase(base.app), () => Temporal.Now.instant())(peticion);
			const valor = peticion.headers["x-prueba-quien"];
			const quien = typeof valor === "string" ? quienesDePrueba[valor] : undefined;
			// `x-prueba-google`: el momento en que la sesión de prueba confirmó con Google.
			const google = peticion.headers["x-prueba-google"];
			if (quien?.tipo !== "cuenta" || typeof google !== "string") return quien;
			return { ...quien, confirmadoConGoogleEn: Temporal.Instant.from(google) };
		},
		revisarPermiso: revisionDePermisos(crearBase(base.app)),
		versionMinimaDelParametro: async () => parametros.versionMinima,
		escribirBitacora: async (contexto, renglones) => {
			if (fallas.bitacora) throw new Error("falla de prueba en la bitácora");
			for (const texto of fallas.bitacoraUnaVez) {
				if (renglones.some((renglon) => armarDescripciones(renglon.descripcion).completa.includes(texto))) {
					fallas.bitacoraUnaVez.delete(texto);
					throw new Error("falla pasajera de prueba en la bitácora");
				}
			}
			pedidos.bitacora.push([...renglones]);
			await escribirBitacoraConAdmin(contexto, renglones);
		},
		guardarEventos: async (contexto, eventos) => {
			pedidos.eventos.push([...eventos]);
			await guardarEventosConAdmin(contexto, eventos);
		},
	};
	const destinoDelRegistro = { write: (linea: string) => lineas.push(linea) };
	const avisosEnVivo =
		opciones.avisosEnVivo === undefined
			? undefined
			: crearAvisosEnVivo({
					conexiones: base.app,
					base: crearBase(base.app),
					registro,
					alcanceDelAparato: async () => alcanceDeLaTablet,
					intervaloDeSincronizacion: async () => 30,
					anotarError: (error) =>
						lineas.push(`error en vivo: ${error instanceof Error ? error.message : String(error)}`),
					latidoMs: opciones.avisosEnVivo.latidoMs,
				});
	const app = await crearServidor({
		entorno: { ENTORNO: opciones.entorno ?? "pruebas", ...dominios },
		base: crearBase(base.app),
		registro,
		servicios,
		destinoDelRegistro,
		...(avisosEnVivo === undefined ? {} : { avisosEnVivo }),
		...(opciones.almacen === undefined ? {} : { almacen: opciones.almacen }),
		...(opciones.conGoogle === undefined
			? {}
			: {
					entradaConGoogle: {
						google: crearAccesoConGoogle({
							emisor: emisorDeGoogle,
							clienteId: clienteDeGooglePrueba.id,
							clienteSecreto: clienteDeGooglePrueba.secreto,
							vuelta: clienteDeGooglePrueba.vuelta,
						}),
						llave: llaveDeLaEntrada("secreto-de-las-cookies-de-prueba"),
					},
				}),
	});
	await app.ready();
	return {
		app,
		base,
		pedidos,
		registro: lineas,
		modulos: registro,
		aparatos,
		parametros,
		fallas,
		cerrar: async () => {
			await app.close();
			// La base es de la primera instancia: la borra ella.
			if (opciones.otraInstanciaDe === undefined) await base.borrar();
		},
	};
}

/** Los encabezados de una llamada de la web de prueba. */
export function encabezadosDeLaWeb(quien = "ventas"): Record<string, string> {
	return { "x-prueba-quien": quien, "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB };
}
