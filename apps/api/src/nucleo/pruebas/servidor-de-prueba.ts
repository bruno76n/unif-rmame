/**
 * El servidor de las pruebas de la fase 3: la API con el módulo de prueba, sobre la base copia del archivo.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 *
 * Quién llama sale del encabezado `x-prueba-quien`, que solo existe aquí: la sesión y la llave llegan en
 * las fases 5 y 6. El permiso de prueba revisa el departamento, el permiso fino, `solo_duena` y
 * «Confirmar con Google»; la bitácora y los eventos de prueba cuentan cuántas veces se piden.
 */

import { join } from "node:path";
import type { Permiso } from "@uniformame/compartido/contratos/definir";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { Temporal } from "temporal-polyfill";
import { armarDescripciones } from "../../modulos/admin/internas/escribir-bitacora.ts";
import { modulosDeLaBitacora } from "../../modulos/admin/tablas.ts";
import { crearServidor, type ServiciosDelServidor } from "../../servidor.ts";
import type { QuienLlama } from "../acceso/quien.ts";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../acciones/corredor.ts";
import type { Almacen } from "../almacen.ts";
import { crearBase } from "../base/conexion.ts";
import { type Semilla, sembrarSistema } from "../base/siembra.ts";
import { ErrorDeApi } from "../http/errores.ts";
import { cargarModulos, type RegistroDeModulos, registrarModulos } from "../modulos.ts";
import { crearAvisosEnVivo } from "../sincronizacion/eventos-en-vivo.ts";
import * as tablasDePrueba from "./modulos/prueba/tablas.ts";

/** Los dominios de las pruebas. */
export const dominios = {
	DOMINIO_WEB: "https://fabrica.prueba.invalid",
	DOMINIO_TALLER: "https://taller.prueba.invalid",
};

/** Quién puede llamar en las pruebas, por el valor de `x-prueba-quien`. */
export const quienesDePrueba: Record<string, QuienLlama> = {
	duena: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000001",
		sesionId: "01936f2e-0000-7000-8000-000000000011",
		esDuena: true,
		departamentos: [],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	ventas: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000002",
		sesionId: "01936f2e-0000-7000-8000-000000000012",
		esDuena: false,
		departamentos: ["ventas"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	admin: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000004",
		sesionId: "01936f2e-0000-7000-8000-000000000014",
		esDuena: false,
		departamentos: ["admin"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	aduana: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000003",
		sesionId: "01936f2e-0000-7000-8000-000000000013",
		esDuena: false,
		departamentos: ["aduana"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	soporte: {
		tipo: "cuenta",
		usuarioId: "01936f2e-0000-7000-8000-000000000005",
		sesionId: "01936f2e-0000-7000-8000-000000000015",
		esDuena: false,
		departamentos: ["admin"],
		permisosFinos: [],
		confirmadoConGoogleEn: undefined,
	},
	puente: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000031",
		tipoDeAparato: "puente",
		personaId: undefined,
	},
	otro_puente: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000032",
		tipoDeAparato: "puente",
		personaId: undefined,
	},
	tablet: {
		tipo: "aparato",
		dispositivoId: "01936f2e-0000-7000-8000-000000000021",
		tipoDeAparato: "tablet",
		personaId: undefined,
	},
};

/** El permiso de prueba: la misma revisión que hará la fase 5, con los datos de `quienesDePrueba`. */
async function revisarPermisoDePrueba(quien: QuienLlama, permiso: Permiso, ahora: Temporal.Instant): Promise<void> {
	if (quien.tipo === "aparato") {
		if (!(permiso.aparatos ?? []).includes(quien.tipoDeAparato))
			throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
		return;
	}
	if (permiso.departamento !== undefined && !quien.esDuena && !quien.departamentos.includes(permiso.departamento)) {
		throw new ErrorDeApi("sin_permiso", "sin_departamento");
	}
	if (permiso.permisoFino !== undefined && !quien.esDuena && !quien.permisosFinos.includes(permiso.permisoFino)) {
		throw new ErrorDeApi("sin_permiso", "sin_permiso_fino");
	}
	if (permiso.soloDuena === true && !quien.esDuena) throw new ErrorDeApi("sin_permiso", "solo_duena");
	if (permiso.confirmarConGoogle !== undefined) {
		const desde = quien.confirmadoConGoogleEn;
		if (desde === undefined || Temporal.Instant.compare(desde.add({ minutes: 5 }), ahora) < 0) {
			throw new ErrorDeApi("reautenticar", null, undefined, { proposito: permiso.confirmarConGoogle, minutos: 5 });
		}
	}
}

/** Las cuentas de prueba que son de soporte técnico. */
const cuentasDeSoporte = ["soporte"];

/**
 * Las cuentas de prueba que cumplen una regla de destinatarios: la dueña, soporte o las que tienen un
 * departamento. Es lo que dará la lectura de `usuarios` en la fase 5.
 * @param regla `duena`, `soporte` o `departamento:{clave}`.
 */
export function cuentasDePruebaPorRegla(regla: string): string[] {
	return Object.entries(quienesDePrueba).flatMap(([nombre, quien]) => {
		if (quien.tipo !== "cuenta") return [];
		const cumple =
			regla === "duena"
				? quien.esDuena
				: regla === "soporte"
					? cuentasDeSoporte.includes(nombre)
					: quien.departamentos.includes(regla.replace("departamento:", ""));
		return cumple ? [quien.usuarioId] : [];
	});
}

/**
 * El registro con las lecturas que darán `usuarios` (fase 5) y `dispositivos` (fase 6): las cuentas de una
 * regla, el correo de una cuenta (`{nombre}@alameda.invalid`) y los datos de un aparato.
 * @param registro Lo que registraron los módulos.
 * @param aparatos Los aparatos de prueba.
 */
export function conCuentasDePrueba(
	registro: RegistroDeModulos,
	aparatos: ReadonlyMap<string, AparatoDePrueba> = aparatosDePrueba(),
): RegistroDeModulos {
	const lecturas = new Map(registro.lecturas);
	lecturas.set("admin.datos_de_aparato", async (_contexto, datos) => {
		const id =
			typeof datos === "object" && datos !== null && "dispositivo_id" in datos ? String(datos.dispositivo_id) : "";
		return aparatos.get(id);
	});
	lecturas.set("admin.cuentas_por_regla", async (_contexto, datos) => {
		const regla = typeof datos === "object" && datos !== null && "regla" in datos ? String(datos.regla) : "";
		return cuentasDePruebaPorRegla(regla);
	});
	lecturas.set("admin.correo_de_cuenta", async (_contexto, datos) => {
		const id = typeof datos === "object" && datos !== null && "usuario_id" in datos ? datos.usuario_id : undefined;
		const nombre = Object.entries(quienesDePrueba).find(
			([, quien]) => quien.tipo === "cuenta" && quien.usuarioId === id,
		)?.[0];
		if (nombre === undefined) throw new Error(`no hay cuenta de prueba ${String(id)}`);
		return `${nombre}@alameda.invalid`;
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
 * `almacen` para los archivos (el de R2, sobre su simulador).
 */
export async function crearServidorDePrueba(
	opciones: {
		entorno?: "local" | "pruebas" | "produccion";
		avisosEnVivo?: { latidoMs: number };
		otraInstanciaDe?: ServidorDePrueba;
		almacen?: Almacen;
	} = {},
): Promise<ServidorDePrueba> {
	const modulosDePrueba = await cargarModulos(join(import.meta.dirname, "modulos"));
	const base = opciones.otraInstanciaDe?.base ?? (await crearBaseConTablasDePrueba(modulosDePrueba.semillas));
	const deLaApi = await cargarModulos(join(import.meta.dirname, "../../modulos"));
	const aparatos = aparatosDePrueba();
	const registro = conCuentasDePrueba(registrarModulos([...deLaApi.modulos, ...modulosDePrueba.modulos]), aparatos);
	const pedidos: ServidorDePrueba["pedidos"] = { bitacora: [], eventos: [] };
	const lineas: string[] = [];
	const parametros = { versionMinima: "1.0.0" };
	const fallas = { bitacora: false, bitacoraUnaVez: new Set<string>() };
	const servicios: ServiciosDelServidor = {
		identificar: async (peticion) => {
			const valor = peticion.headers["x-prueba-quien"];
			return typeof valor === "string" ? quienesDePrueba[valor] : undefined;
		},
		revisarPermiso: revisarPermisoDePrueba,
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
