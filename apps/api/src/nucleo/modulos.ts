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
import type { Almacen } from "./almacen.ts";
import type { Base } from "./base/conexion.ts";
import type { Semilla } from "./base/siembra.ts";
import type { Transaccion } from "./base/transacciones.ts";
import type { EnviarCorreo } from "./correo.ts";

/**
 * Un evento de dominio: `{entidad}.{hecho}`, con ids y claves para armar avisos y las tablas que cambiaron;
 * nunca montos, sueldos ni secretos (`admin.guardar_evento` lo revisa).
 */
export interface Evento {
	tipo: `${string}.${string}`;
	datos: Record<string, string | number | boolean | null>;
	tablas: readonly string[];
	/** El documento: su tabla, su id y su folio. */
	entidad?: string;
	entidadId?: string;
	entidadFolio?: string;
	/** Las ubicaciones a cuyos aparatos les toca; vacío es a todos los que bajan esas tablas. */
	ubicacionIds?: readonly string[];
}

/** El sistema, cuando escribe desde un trabajo del worker y no por una llamada. */
export interface SistemaQueEscribe {
	tipo: "sistema";
	/** El trabajo que escribe. */
	trabajo: string;
}

/** Quién escribe en una transacción: quien llamó a la API o el sistema desde un trabajo. */
export type QuienEscribe = QuienLlama | SistemaQueEscribe;

/**
 * Una descripción que trae sueldos o tarifas: la plantilla con `{nombre}` y sus valores; los que son
 * sueldo o tarifa van como `{ sueldo }`, para armar también la descripción sin ellos.
 */
export interface DescripcionConSueldos {
	plantilla: string;
	valores: Record<string, string | { sueldo: string }>;
}

/** Un renglón de bitácora que arma la acción (ver docs/modulos/admin/bitacora.md). */
export interface RenglonDeBitacora {
	/** «Qué pasó», ya armado; si trae sueldos o tarifas, con su plantilla. */
	descripcion: string | DescripcionConSueldos;
	entidad?: string;
	entidadId?: string;
	entidadFolio?: string;
	/** Solo lo que cambió. Nunca secretos. */
	antes?: unknown;
	despues?: unknown;
	esAlerta?: boolean;
	/** «Pedida y autorizada por la misma persona». */
	mismaPersona?: boolean;
	/** En las acciones que piden «Confirmar con Google»: cuándo se confirmó. */
	confirmadoConGoogleEn?: string;
}

/** Lo que recibe una acción y lo que reciben las internas que llama: todo dentro de su transacción. */
export interface ContextoDeAccion {
	transaccion: Transaccion;
	quien: QuienEscribe;
	/** La acción (o el trabajo) que abrió la transacción, con su módulo: `admin.cambiar_parametro`. */
	accion: string;
	/** Su módulo: lo llevan sus eventos y su bitácora. */
	modulo: string;
	/** Una sola hora para toda la acción. */
	ahora: Temporal.Instant;
	diaDeNegocio: Temporal.PlainDate;
	/** El id del comando en `comandos_recibidos`: lo llevan la bitácora y los eventos. Un trabajo no tiene. */
	comandoId: string | undefined;
	/** Llama a la acción interna de otro módulo, en esta misma transacción. */
	interna: (nombre: string, datos: unknown) => Promise<unknown>;
	/** Llama a la lectura de otro módulo, en esta misma transacción. */
	lectura: (nombre: string, datos: unknown) => Promise<unknown>;
	/** Dice si algún módulo ofrece esa lectura (para las que son optativas, como `{modulo}.ve_documento`). */
	hayLectura: (nombre: string) => boolean;
	guardarEvento: (evento: Evento) => void;
	bitacora: (renglon: RenglonDeBitacora) => void;
	/** El almacén de archivos (R2), si quien abrió la transacción lo tiene. */
	almacen: Almacen | undefined;
}

/** Una consulta sensible que se apunta en la bitácora: qué se consultó y de qué documento. */
export type ConsultaSensible = Pick<RenglonDeBitacora, "descripcion" | "entidad" | "entidadId" | "entidadFolio">;

/** Lo que recibe una consulta: la base para leer, quién llama y la hora. */
export interface ContextoDeConsulta {
	base: Base;
	quien: QuienLlama;
	ahora: Temporal.Instant;
	diaDeNegocio: Temporal.PlainDate;
	/**
	 * Apunta en la bitácora una consulta a datos sensibles (la ficha de una persona, las tarifas, el saldo
	 * de un cliente): una vez por cuenta y documento cada `admin.minutos_consulta_sensible`.
	 */
	apuntarConsultaSensible: (consulta: ConsultaSensible) => Promise<void>;
}

/** Lo que regresa una acción. */
export interface SalidaDeAccion<Resultado> {
	resultado: Resultado;
	avisos?: string[];
	/** El documento que creó o tocó, para `comandos_recibidos`. */
	entidad?: { nombre: string; id: string };
	/**
	 * Solo cuando su archivo lo dice (guardar un borrador, o lo mismo que ya había): la acción no deja
	 * renglón de bitácora. Sin esto, el corredor exige al menos uno.
	 */
	sinBitacora?: true;
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

/**
 * Cuándo toca un trabajo programado, en hora de México: cada tantos minutos, cada día a una hora, cada
 * semana un día (1 lunes … 7 domingo) a una hora, o cada mes un día a una hora. La hora es «HH:MM».
 */
export type Horario =
	| { cada: "minutos"; minutos: number }
	| { cada: "dia"; hora: string }
	| { cada: "semana"; dia: number; hora: string }
	| { cada: "mes"; dia: number; hora: string };

/** Lo que recibe un trabajo del worker. */
export interface ContextoDeTrabajo {
	base: Base;
	/** La hora en que empezó la vuelta. */
	ahora: Temporal.Instant;
	/** El periodo de la vuelta (`2026-11-09`), si el trabajo es programado. */
	periodo: string | undefined;
	/** El evento que lo encoló, si corre después de un evento. */
	eventoId: string | undefined;
	/** Abre una transacción corta con el contexto de una acción, con el sistema como quien escribe. */
	enTransaccion: <T>(trabajo: (contexto: ContextoDeAccion) => Promise<T>) => Promise<T>;
	/** Manda un correo (Resend, o el registro en local). */
	enviarCorreo: EnviarCorreo;
	/** La dirección de la web, para los enlaces. */
	dominioWeb: string;
	/** Avisa a soporte que algo falló: «{trabajo} falló: {error}». */
	avisarFalla: (trabajo: string, error: string) => Promise<void>;
}

/** Un trabajo del worker: programado (con `horario`), después de un evento (`trasEventos`) o encolado por otro. */
export interface Trabajo {
	/** Su nombre completo, con el del módulo: `admin.depurar_eventos`. */
	nombre: string;
	/** Su horario, leído en cada vuelta del reloj (de sus parámetros); sin él, no es programado. */
	horario?: (contexto: ContextoDeTrabajo) => Promise<Horario | undefined>;
	/** Los tipos de evento tras los que se encola. */
	trasEventos?: readonly string[];
	/** Lo que hace. Se puede correr más de una vez en el mismo periodo sin duplicar nada. */
	correr: (contexto: ContextoDeTrabajo) => Promise<void>;
}

/** Lo que recibe una ruta fija: quién llama ya identificado, la base, la hora y una transacción si escribe. */
export interface ContextoDeRuta extends ContextoDeConsulta {
	/** Abre una transacción con el contexto de una acción con el nombre de la ruta, para escribir. */
	enTransaccion: <T>(hacer: (contexto: ContextoDeAccion) => Promise<T>) => Promise<T>;
	/** El almacén de archivos (R2). */
	almacen: Almacen | undefined;
	/** Lo que registraron los módulos (sus tipos de etiqueta, por ejemplo). */
	registro: RegistroDeModulos;
}

/** Lo que regresa una ruta fija: un cuerpo JSON con su estado, un contenido con su tipo, o una redirección. */
export type RespuestaDeRuta =
	| { estado: number; cuerpo: unknown }
	| { contenido: string | Uint8Array; tipo: string }
	| { redirigir: string };

/**
 * Una ruta fija que no es acción ni consulta (`POST /v1/archivos/subida`): la registra su módulo y el
 * servidor la atiende después de identificar a quien llama y revisar su versión (y su `Origin` en un `POST`).
 */
export interface RutaFija {
	/** Su nombre completo, con el del módulo: `admin.subir_archivo`. */
	nombre: string;
	metodo: "GET" | "POST";
	/** La dirección, con sus parámetros como los escribe Fastify: `/v1/archivos/:id`. */
	url: string;
	descripcion: string;
	/** Atiende la petición: su cuerpo, sus parámetros de la dirección y su búsqueda. */
	atender: (
		contexto: ContextoDeRuta,
		peticion: { cuerpo: unknown; parametros: unknown; busqueda: unknown },
	) => Promise<RespuestaDeRuta>;
}

/**
 * Un tipo de etiqueta o de hoja que registra su módulo: quién lo puede pedir y cómo se dibuja (con los
 * datos ya recortados según quien lo pide). Los del negocio llegan en la fase 20.
 */
export interface TipoDeEtiqueta {
	/** `prenda`, `rollo`, `bulto`, `lote`… */
	tipo: string;
	/** Los departamentos que lo pueden pedir; la dueña, todos. */
	departamentos: readonly string[];
	/** Un permiso fino que pide además (las guías piden `imprime_guias`). */
	permisoFino?: string;
	/** Dibuja lo de esos ids: ZPL en texto o PDF en bytes. */
	dibujar: (
		contexto: ContextoDeConsulta,
		pedido: { ids: readonly string[]; formato: "zpl" | "pdf"; copias: number },
	) => Promise<string | Uint8Array>;
}

/** A quién va un aviso en vivo: a una sesión, a un aparato o a todas las sesiones de una cuenta. */
export type DestinoEnVivo = { sesionId: string } | { dispositivoId: string } | { usuarioId: string };

/** Un aviso en vivo que nace de un evento: su nombre (`impresion`), sus datos y a quién va. */
export interface EnvioEnVivo {
	para: DestinoEnVivo;
	nombre: string;
	datos: Record<string, unknown>;
}

/** Lo que manda en vivo un tipo de evento, aparte de `cambios`. */
export type EnVivo = (evento: { id: string; tipo: string; datos: unknown }) => readonly EnvioEnVivo[];

/** Un evento ya guardado en la bandeja, como lo ve quien lo atiende. */
export interface EventoGuardado {
	id: string;
	tipo: string;
	creadoEn: string;
	intentos: number;
	datos: unknown;
	entidad: string | null;
	entidadId: string | null;
}

/**
 * Lo que un módulo hace al llegar un tipo de evento, dentro del proceso de la bandeja (en su `SAVEPOINT`):
 * crear avisos a personas con sus internas. Si falla, el evento se reintenta.
 */
export type AlEvento = (contexto: ContextoDeAccion, evento: EventoGuardado) => Promise<void>;

/** Un módulo, como lo exporta su `index.ts`. */
export interface Modulo {
	nombre: string;
	acciones: readonly AccionImplementada[];
	consultas: readonly ConsultaImplementada[];
	/** Por nombre corto: `reservar` se registra como `inventario.reservar`. */
	internas: Readonly<Record<string, Interna>>;
	lecturas: Readonly<Record<string, Lectura>>;
	semillas: readonly Semilla[];
	trabajos: readonly Trabajo[];
	/** De su `permisos.ts`: qué departamentos leen cada una de sus tablas, para los avisos en vivo. */
	lectores: Readonly<Record<string, readonly string[]>>;
	/** Lo que hace al llegar cada tipo de evento (de cualquier módulo). */
	alEvento: Readonly<Record<string, AlEvento>>;
	/** Sus rutas fijas. */
	rutas: readonly RutaFija[];
	/** Sus tipos de etiqueta y de hoja. */
	tiposDeEtiqueta: readonly TipoDeEtiqueta[];
	/** Por tipo de evento, lo que manda en vivo además de `cambios`. */
	enVivo: Readonly<Record<string, EnVivo>>;
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
	return {
		acciones: [],
		consultas: [],
		internas: {},
		lecturas: {},
		semillas: [],
		trabajos: [],
		lectores: {},
		alEvento: {},
		rutas: [],
		tiposDeEtiqueta: [],
		enVivo: {},
		...modulo,
	};
}

/** Todo lo que registraron los módulos, por nombre completo. */
export interface RegistroDeModulos {
	modulos: readonly Modulo[];
	acciones: ReadonlyMap<string, AccionImplementada>;
	consultas: ReadonlyMap<string, ConsultaImplementada>;
	internas: ReadonlyMap<string, Interna>;
	lecturas: ReadonlyMap<string, Lectura>;
	semillas: readonly Semilla[];
	trabajos: ReadonlyMap<string, Trabajo>;
	/** Por tabla, los departamentos que la leen. */
	lectores: ReadonlyMap<string, readonly string[]>;
	/** Por tipo de evento, lo que hacen los módulos al llegar. */
	alEvento: ReadonlyMap<string, readonly AlEvento[]>;
	/** Las rutas fijas de todos los módulos. */
	rutas: readonly RutaFija[];
	/** Los tipos de etiqueta y de hoja, por tipo. */
	tiposDeEtiqueta: ReadonlyMap<string, TipoDeEtiqueta>;
	/** Por tipo de evento, lo que mandan en vivo los módulos. */
	enVivo: ReadonlyMap<string, readonly EnVivo[]>;
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
	const trabajos = new Map<string, Trabajo>();
	const lectores = new Map<string, readonly string[]>();
	const alEvento = new Map<string, AlEvento[]>();
	const tiposDeEtiqueta = new Map<string, TipoDeEtiqueta>();
	const enVivo = new Map<string, EnVivo[]>();
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
		for (const trabajo of modulo.trabajos) agregar(trabajos, modulo.nombre, trabajo.nombre, trabajo);
		for (const [tabla, departamentos] of Object.entries(modulo.lectores)) lectores.set(tabla, departamentos);
		for (const [tipo, hacer] of Object.entries(modulo.alEvento))
			alEvento.set(tipo, [...(alEvento.get(tipo) ?? []), hacer]);
		for (const [tipo, mandar] of Object.entries(modulo.enVivo)) enVivo.set(tipo, [...(enVivo.get(tipo) ?? []), mandar]);
		for (const etiqueta of modulo.tiposDeEtiqueta) {
			if (tiposDeEtiqueta.has(etiqueta.tipo))
				throw new Error(`el tipo de etiqueta ${etiqueta.tipo} está registrado dos veces`);
			tiposDeEtiqueta.set(etiqueta.tipo, etiqueta);
		}
	}
	return {
		modulos,
		acciones,
		consultas,
		internas,
		lecturas,
		semillas: modulos.flatMap((modulo) => modulo.semillas),
		trabajos,
		lectores,
		alEvento,
		rutas: modulos.flatMap((modulo) => {
			for (const ruta of modulo.rutas) {
				if (!ruta.nombre.startsWith(`${modulo.nombre}.`))
					throw new Error(`${ruta.nombre} no es del módulo ${modulo.nombre}`);
			}
			return modulo.rutas;
		}),
		tiposDeEtiqueta,
		enVivo,
	};
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
