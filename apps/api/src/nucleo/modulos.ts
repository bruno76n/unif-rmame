/**
 * Los módulos de la API: cómo se definen y cómo se registran solos por carpeta.
 * Fase 3 · docs/cimientos/MODULOS.md y docs/cimientos/ESTRUCTURA.md («Un módulo por dentro»)
 *
 * Cada carpeta de `modulos/` tiene un `index.ts` que exporta su módulo con `definirModulo`. Al arrancar,
 * `cargarModulos` lee las carpetas y junta sus acciones, consultas, internas, lecturas y semillas:
 * agregar un módulo o una acción no toca ningún otro archivo.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ContratoDeAccion, ContratoDeConsulta, EsquemaDeObjeto } from "@uniformame/compartido/contratos/definir";
import type { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import type { QuienLlama } from "./acceso/quien.ts";
import type { Base } from "./base/conexion.ts";
import type { Semilla } from "./base/siembra.ts";
import type { Transaccion } from "./base/transacciones.ts";

/** Un evento de dominio: `{entidad}.{hecho}`, con ids y las tablas que cambiaron; nunca montos ni secretos. */
export interface Evento {
	nombre: `${string}.${string}`;
	datos: Record<string, string | number | boolean | null>;
	tablas: readonly string[];
}

/** Un renglón de bitácora que arma la acción (ver docs/modulos/admin/bitacora.md). */
export interface RenglonDeBitacora {
	descripcion: string;
	entidad?: string;
	entidadId?: string;
	antes?: unknown;
	despues?: unknown;
	/** Trae sueldos o tarifas: se recorta a quien no tiene el permiso. */
	conSueldos?: boolean;
}

/** Lo que recibe una acción y lo que reciben las internas que llama: todo dentro de su transacción. */
export interface ContextoDeAccion {
	transaccion: Transaccion;
	quien: QuienLlama;
	/** Una sola hora para toda la acción. */
	ahora: Temporal.Instant;
	diaDeNegocio: Temporal.PlainDate;
	/** El id del comando en `comandos_recibidos`: lo llevan la bitácora y los eventos. */
	comandoId: string;
	/** Llama a la acción interna de otro módulo, en esta misma transacción. */
	interna: (nombre: string, datos: unknown) => Promise<unknown>;
	/** Llama a la lectura de otro módulo, en esta misma transacción. */
	lectura: (nombre: string, datos: unknown) => Promise<unknown>;
	guardarEvento: (evento: Evento) => void;
	bitacora: (renglon: RenglonDeBitacora) => void;
}

/** Lo que recibe una consulta: la base para leer, quién llama y la hora. */
export interface ContextoDeConsulta {
	base: Base;
	quien: QuienLlama;
	ahora: Temporal.Instant;
	diaDeNegocio: Temporal.PlainDate;
}

/** Lo que regresa una acción. */
export interface SalidaDeAccion<Resultado> {
	resultado: Resultado;
	avisos?: string[];
	/** El documento que creó o tocó, para `comandos_recibidos`. */
	entidad?: { nombre: string; id: string };
}

/** Una acción ya registrada: su contrato y lo que hace (su paso 7), con los datos ya validados. */
export interface AccionImplementada {
	contrato: ContratoDeAccion;
	ejecutar: (
		contexto: ContextoDeAccion,
		datos: unknown,
		version: number | undefined,
	) => Promise<SalidaDeAccion<Record<string, unknown>>>;
}

/** Una consulta ya registrada: su contrato y cómo lee. */
export interface ConsultaImplementada {
	contrato: ContratoDeConsulta;
	leer: (
		contexto: ContextoDeConsulta,
		parametros: unknown,
	) => Promise<{ resultado: Record<string, unknown>; recortado?: string[] }>;
}

/** Una acción interna: corre en la transacción de quien la llama, sin clave ni permisos ni bitácora propia. */
export type Interna = (contexto: ContextoDeAccion, datos: unknown) => Promise<unknown>;

/** Una lectura que un módulo ofrece a otros: lee con su regla y no escribe. */
export type Lectura = (contexto: ContextoDeAccion, datos: unknown) => Promise<unknown>;

/** Un módulo, como lo exporta su `index.ts`. */
export interface Modulo {
	nombre: string;
	acciones: readonly AccionImplementada[];
	consultas: readonly ConsultaImplementada[];
	/** Por nombre corto: `reservar` se registra como `inventario.reservar`. */
	internas: Readonly<Record<string, Interna>>;
	lecturas: Readonly<Record<string, Lectura>>;
	semillas: readonly Semilla[];
}

/**
 * Une una acción con su contrato.
 * @param contrato El contrato del paquete compartido.
 * @param ejecutar Lo que hace la acción, con los datos y el resultado del tipo de su contrato.
 */
export function implementarAccion<
	Nombre extends string,
	Entrada extends EsquemaDeObjeto,
	Resultado extends EsquemaDeObjeto,
>(
	contrato: ContratoDeAccion<Nombre, Entrada, Resultado>,
	ejecutar: (
		contexto: ContextoDeAccion,
		datos: z.infer<Entrada>,
		version: number | undefined,
	) => Promise<SalidaDeAccion<z.infer<Resultado>>>,
): AccionImplementada {
	return {
		contrato,
		ejecutar: (contexto, datos, version) => ejecutar(contexto, contrato.entrada.parse(datos), version),
	};
}

/**
 * Une una consulta con su contrato.
 * @param contrato El contrato del paquete compartido.
 * @param leer Cómo lee, con los parámetros y el resultado del tipo de su contrato.
 */
export function implementarConsulta<
	Nombre extends string,
	Entrada extends EsquemaDeObjeto,
	Resultado extends EsquemaDeObjeto,
>(
	contrato: ContratoDeConsulta<Nombre, Entrada, Resultado>,
	leer: (
		contexto: ContextoDeConsulta,
		parametros: z.infer<Entrada>,
	) => Promise<{ resultado: z.infer<Resultado>; recortado?: string[] }>,
): ConsultaImplementada {
	return { contrato, leer: (contexto, parametros) => leer(contexto, contrato.entrada.parse(parametros)) };
}

/**
 * Define un módulo; lo que no trae, va vacío.
 * @param modulo Su nombre (el de su carpeta) y lo que ofrece.
 */
export function definirModulo(modulo: Pick<Modulo, "nombre"> & Partial<Modulo>): Modulo {
	return { acciones: [], consultas: [], internas: {}, lecturas: {}, semillas: [], ...modulo };
}

/** Todo lo que registraron los módulos, por nombre completo. */
export interface RegistroDeModulos {
	modulos: readonly Modulo[];
	acciones: ReadonlyMap<string, AccionImplementada>;
	consultas: ReadonlyMap<string, ConsultaImplementada>;
	internas: ReadonlyMap<string, Interna>;
	lecturas: ReadonlyMap<string, Lectura>;
	semillas: readonly Semilla[];
}

/** Dice si lo que exportó un `index.ts` tiene la forma de un módulo. */
function esModulo(valor: unknown): valor is Modulo {
	return (
		typeof valor === "object" && valor !== null && "nombre" in valor && "acciones" in valor && "consultas" in valor
	);
}

/**
 * Junta lo de varios módulos y revisa que cada nombre sea suyo y no se repita.
 * @param modulos Los módulos.
 * @throws Error si un nombre no empieza con el de su módulo o está repetido.
 */
export function registrarModulos(modulos: readonly Modulo[]): RegistroDeModulos {
	const acciones = new Map<string, AccionImplementada>();
	const consultas = new Map<string, ConsultaImplementada>();
	const internas = new Map<string, Interna>();
	const lecturas = new Map<string, Lectura>();
	const agregar = <T>(mapa: Map<string, T>, modulo: string, nombre: string, valor: T) => {
		if (!nombre.startsWith(`${modulo}.`)) throw new Error(`${nombre} no es del módulo ${modulo}`);
		if (mapa.has(nombre)) throw new Error(`${nombre} está registrado dos veces`);
		mapa.set(nombre, valor);
	};
	for (const modulo of modulos) {
		for (const accion of modulo.acciones) agregar(acciones, modulo.nombre, accion.contrato.nombre, accion);
		for (const consulta of modulo.consultas) agregar(consultas, modulo.nombre, consulta.contrato.nombre, consulta);
		for (const [nombre, interna] of Object.entries(modulo.internas))
			agregar(internas, modulo.nombre, `${modulo.nombre}.${nombre}`, interna);
		for (const [nombre, lectura] of Object.entries(modulo.lecturas))
			agregar(lecturas, modulo.nombre, `${modulo.nombre}.${nombre}`, lectura);
	}
	return { modulos, acciones, consultas, internas, lecturas, semillas: modulos.flatMap((modulo) => modulo.semillas) };
}

/**
 * Lee cada carpeta de `modulos/` y registra lo que exporta su `index.ts`.
 * @param carpeta La carpeta de los módulos (la de la API, o la de prueba en las pruebas).
 * @throws Error si un `index.ts` no exporta un módulo o su nombre no es el de su carpeta.
 */
export async function cargarModulos(carpeta: string): Promise<RegistroDeModulos> {
	const carpetas = (await readdir(carpeta, { withFileTypes: true }))
		.filter((entrada) => entrada.isDirectory())
		.map((entrada) => entrada.name)
		.sort();
	const modulos: Modulo[] = [];
	for (const nombre of carpetas) {
		const importado: unknown = await import(pathToFileURL(join(carpeta, nombre, "index.ts")).href);
		const modulo =
			typeof importado === "object" && importado !== null && "default" in importado ? importado.default : undefined;
		if (!esModulo(modulo) || modulo.nombre !== nombre)
			throw new Error(`modulos/${nombre}/index.ts no exporta el módulo ${nombre}`);
		modulos.push(modulo);
	}
	return registrarModulos(modulos);
}
