/**
 * El servidor de la API: Fastify con las rutas de las acciones y las consultas que registran los módulos.
 * Fase 3 · docs/cimientos/API.md y docs/cimientos/MODULOS.md («Cómo corre una acción»)
 *
 * Cada acción es `POST /v1/acciones/{modulo}.{accion}` y cada consulta `GET /v1/consultas/{modulo}.{consulta}`,
 * con su contrato como esquema: de ahí salen la validación y `openapi.json`. Antes de la acción corren,
 * en orden, quién llama, la versión de la app (y el `Origin`), la forma y el permiso; luego el corredor.
 */

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifySwagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import type { Permiso } from "@uniformame/compartido/contratos/definir";
import { cuerpoDeAccion, respuestaDeAccion, respuestaDeConsulta } from "@uniformame/compartido/contratos/protocolo";
import { type App, compararVersiones, versionMinima } from "@uniformame/compartido/contratos/versiones";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyRequest } from "fastify";
import { jsonSchemaTransform, serializerCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import pino, { type DestinationStream } from "pino";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { appDe, type QuienLlama } from "./nucleo/acceso/quien.ts";
import {
	type CuerpoDeAccion,
	correrAccion,
	crearContexto,
	type ServiciosDelCorredor,
} from "./nucleo/acciones/corredor.ts";
import type { Base } from "./nucleo/base/conexion.ts";
import { enTransaccion } from "./nucleo/base/transacciones.ts";
import type { Entorno } from "./nucleo/entorno.ts";
import { ErrorDeApi, responderError } from "./nucleo/http/errores.ts";
import { validarSinTransformar } from "./nucleo/http/validacion.ts";
import type { ConsultaSensible, RegistroDeModulos } from "./nucleo/modulos.ts";
import type { AvisosEnVivo } from "./nucleo/sincronizacion/eventos-en-vivo.ts";

declare module "fastify" {
	interface FastifyRequest {
		/** Quién llama, cuando ya se identificó. */
		quien: QuienLlama | undefined;
	}
}

// Los mensajes de validación de Zod, en español.
z.config(z.locales.es());

/** El tamaño máximo del cuerpo de una petición (ver docs/cimientos/SEGURIDAD.md, «Los límites»). */
const tamanoMaximoDelCuerpo = 1024 * 1024;

/**
 * El registro técnico (pino): de cada petición, su método y su ruta sin los parámetros (`?…`), que pueden
 * traer un nombre o un RFC; nunca los encabezados ni el cuerpo (ver docs/cimientos/SEGURIDAD.md).
 * @param destino A dónde escribe; por omisión, la salida estándar.
 */
function crearRegistroTecnico(destino: DestinationStream | undefined) {
	const opciones = {
		level: "info",
		serializers: {
			req: (peticion: { method?: string; url?: string }) => ({
				metodo: peticion.method,
				ruta: (peticion.url ?? "").split("?")[0],
			}),
			res: (respuesta: { statusCode?: number }) => ({ estado: respuesta.statusCode }),
		},
		redact: ["req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie"],
	};
	return destino === undefined ? pino(opciones) : pino(opciones, destino);
}

/** Lo que el servidor pide a los módulos que todavía no llegan: quién llama, el permiso y la versión del parámetro. */
export interface ServiciosDelServidor extends ServiciosDelCorredor {
	/** La sesión o la llave del aparato (fases 5 y 6); `undefined` si no hay. */
	identificar: (peticion: FastifyRequest) => Promise<QuienLlama | undefined>;
	/** Revisa el permiso del contrato (fase 5); lanza `403` o `401` si falta. */
	revisarPermiso: (quien: QuienLlama, permiso: Permiso, ahora: Temporal.Instant) => Promise<void>;
	/** La versión mínima del parámetro de la dueña (fase 4). */
	versionMinimaDelParametro: (app: App) => Promise<string>;
}

/** Lo que necesita el servidor. */
export interface DependenciasDelServidor {
	entorno: Pick<Entorno, "ENTORNO" | "DOMINIO_WEB" | "DOMINIO_TALLER">;
	base: Base;
	registro: RegistroDeModulos;
	servicios: ServiciosDelServidor;
	/** A dónde escribe el registro técnico; por omisión, la salida estándar. Las pruebas pasan uno que guarda lo que escribe. */
	destinoDelRegistro?: DestinationStream;
	/** Los avisos en vivo (`GET /v1/eventos`); sin ellos, la ruta no existe. */
	avisosEnVivo?: AvisosEnVivo;
	/** De dónde sale «ahora»; las pruebas la fijan. */
	reloj?: () => Temporal.Instant;
}

/**
 * Arma el servidor con las rutas de todo lo registrado.
 * @param dependencias La base, los módulos, los servicios y el entorno.
 * @returns El servidor de Fastify, listo para `listen` o para `inject` en las pruebas.
 */
export async function crearServidor(dependencias: DependenciasDelServidor) {
	const { entorno, base, registro, servicios } = dependencias;
	const reloj = dependencias.reloj ?? (() => Temporal.Now.instant());
	const app = Fastify({
		bodyLimit: tamanoMaximoDelCuerpo,
		loggerInstance: crearRegistroTecnico(dependencias.destinoDelRegistro),
	}).withTypeProvider<ZodTypeProvider>();
	app.setValidatorCompiler(validarSinTransformar);
	app.setSerializerCompiler(serializerCompiler);
	app.decorateRequest("quien", undefined);

	// Los dos sitios del navegador: la web con su cookie y la tablet sin ella. Ningún comodín.
	await app.register(cors, {
		delegator: (peticion, listo) => {
			const origen = peticion.headers.origin;
			if (origen === entorno.DOMINIO_WEB) listo(null, { origin: origen, credentials: true });
			else if (origen === entorno.DOMINIO_TALLER) listo(null, { origin: origen, credentials: false });
			else listo(null, { origin: false });
		},
	});
	await app.register(helmet, {
		contentSecurityPolicy: false,
		hsts: { maxAge: 31_536_000, includeSubDomains: true },
		referrerPolicy: { policy: "no-referrer" },
		crossOriginResourcePolicy: { policy: "same-site" },
	});
	await app.register(fastifySwagger, {
		openapi: {
			info: { title: "API de Unifórmame", version: "1.0.0", description: "Acciones y consultas de Unifórmame" },
		},
		transform: jsonSchemaTransform,
	});
	if (entorno.ENTORNO === "local") await app.register(scalar, { routePrefix: "/v1/documentacion" });

	app.setErrorHandler((error, peticion, respuesta) => {
		const { estado, cuerpo } = responderError(error, peticion.log);
		return respuesta.code(estado).header("cache-control", "no-store").send(cuerpo);
	});
	app.setNotFoundHandler((_peticion, respuesta) => {
		const error = new ErrorDeApi("no_existe");
		return respuesta.code(error.estado).header("cache-control", "no-store").send(error.cuerpo());
	});

	/** Paso 1: quién llama. */
	async function identificar(peticion: FastifyRequest): Promise<QuienLlama> {
		const quien = await servicios.identificar(peticion);
		if (quien === undefined) throw new ErrorDeApi("sin_sesion", "sin_sesion");
		peticion.quien = quien;
		return quien;
	}

	/** La versión mínima que vale hoy para la app de quien llama: la del código o la del parámetro. */
	async function minimaDe(quien: QuienLlama): Promise<string> {
		const app = appDe(quien);
		return versionMinima(app, await servicios.versionMinimaDelParametro(app));
	}

	/** Pasos 1 y 2: quién llama y la versión de su app. */
	async function identificarYRevisarVersion(peticion: FastifyRequest): Promise<void> {
		const minima = await minimaDe(await identificar(peticion));
		const version = peticion.headers["x-app-version"];
		if (typeof version !== "string" || (compararVersiones(version, minima) ?? -1) < 0) {
			throw new ErrorDeApi("actualizar", null, undefined, { version_minima: minima });
		}
	}

	/** En las acciones: el `Origin` del navegador tiene que ser el del sistema (ver docs/cimientos/SEGURIDAD.md). */
	async function revisarOrigen(peticion: FastifyRequest): Promise<void> {
		const origen = peticion.headers.origin;
		const permitido =
			peticion.quien?.tipo === "cuenta"
				? origen === entorno.DOMINIO_WEB
				: origen === undefined || origen === entorno.DOMINIO_TALLER;
		if (!permitido) throw new ErrorDeApi("sin_permiso", "origen_no_valido", "Esta petición no viene del sistema.");
	}

	/** Quién llama, ya identificado en el paso 1. */
	function quienDe(peticion: FastifyRequest): QuienLlama {
		if (peticion.quien === undefined) throw new ErrorDeApi("sin_sesion", "sin_sesion");
		return peticion.quien;
	}

	for (const accion of registro.acciones.values()) {
		const { contrato } = accion;
		app.route({
			method: "POST",
			url: `/v1/acciones/${contrato.nombre}`,
			schema: {
				description: describir(contrato.descripcion, contrato.permiso, []),
				tags: [contrato.nombre.split(".")[0] ?? ""],
				body: cuerpoDeAccion(contrato),
				response: { 200: respuestaDeAccion(contrato) },
			},
			preValidation: [identificarYRevisarVersion, revisarOrigen],
			// Paso 4: el permiso, antes de abrir la transacción.
			preHandler: async (peticion) => servicios.revisarPermiso(quienDe(peticion), contrato.permiso, reloj()),
			handler: async (peticion, respuesta) => {
				respuesta.header("cache-control", "no-store");
				return correrAccion(
					{ base, registro, servicios },
					{ accion, quien: quienDe(peticion), cuerpo: cuerpoValidado(peticion.body), ahora: reloj() },
				);
			},
		});
	}

	for (const consulta of registro.consultas.values()) {
		const { contrato } = consulta;
		app.route({
			method: "GET",
			url: `/v1/consultas/${contrato.nombre}`,
			schema: {
				description: describir(contrato.descripcion, contrato.permiso, contrato.recortables),
				tags: [contrato.nombre.split(".")[0] ?? ""],
				querystring: contrato.entrada,
				response: { 200: respuestaDeConsulta(contrato) },
			},
			preValidation: [identificarYRevisarVersion],
			preHandler: async (peticion) => servicios.revisarPermiso(quienDe(peticion), contrato.permiso, reloj()),
			handler: async (peticion, respuesta) => {
				respuesta.header("cache-control", "no-store");
				const ahora = reloj();
				const leido = await consulta.leer(
					{
						base,
						quien: quienDe(peticion),
						ahora,
						diaDeNegocio: diaDeNegocio(ahora),
						apuntarConsultaSensible: (renglon) =>
							apuntarConsultaSensible(quienDe(peticion), contrato.nombre, ahora, renglon),
					},
					peticion.query,
				);
				const recortado = leido.recortado ?? [];
				revisarRecorte(contrato.nombre, contrato.recortables, leido.resultado, recortado);
				return { ok: true as const, resultado: leido.resultado, recortado };
			},
		});
	}

	/**
	 * Apunta una consulta sensible en la bitácora, en su propia transacción corta: la consulta solo lee.
	 * `admin.escribir_bitacora` no la repite si la cuenta ya la apuntó hace poco sobre el mismo documento.
	 */
	async function apuntarConsultaSensible(
		quien: QuienLlama,
		consulta: string,
		ahora: Temporal.Instant,
		renglon: ConsultaSensible,
	): Promise<void> {
		await enTransaccion(base, (transaccion) =>
			crearContexto(registro, transaccion, quien, consulta, ahora, undefined).contexto.interna(
				"admin.escribir_bitacora",
				{
					...renglon,
					tipo: "consulta_sensible",
				},
			),
		);
	}

	if (dependencias.avisosEnVivo !== undefined) registrarEventosEnVivo(dependencias.avisosEnVivo);

	/**
	 * `GET /v1/eventos`: la conexión de los avisos en vivo. El navegador no manda `X-App-Version` en un
	 * `EventSource`, así que la versión no se revisa aquí: va en `hola`, y el cliente actúa como con `426`.
	 */
	function registrarEventosEnVivo(avisos: AvisosEnVivo): void {
		app.addHook("onReady", () => avisos.iniciar());
		app.addHook("onClose", () => avisos.cerrar());
		app.get("/v1/eventos", { schema: { hide: true }, preValidation: identificar }, async (peticion, respuesta) => {
			const quien = quienDe(peticion);
			const hola = { servidor_en: reloj().toString(), version_minima: await minimaDe(quien) };
			// Fastify ya no escribe la respuesta: pasan los encabezados que pusieron CORS y helmet, y los del SSE.
			respuesta.hijack();
			const encabezados = {
				...respuesta.getHeaders(),
				"content-type": "text/event-stream",
				"cache-control": "no-store",
				connection: "keep-alive",
			};
			for (const [nombre, valor] of Object.entries(encabezados)) {
				if (valor !== undefined) respuesta.raw.setHeader(nombre, valor);
			}
			respuesta.raw.writeHead(200);
			const salida = { escribir: (texto: string) => respuesta.raw.write(texto), terminar: () => respuesta.raw.end() };
			const quitar = await avisos.conectar(quien, salida, hola);
			peticion.raw.on("close", quitar);
		});
	}

	// Que la API está viva y llega a la base, sin datos, para el balanceador.
	app.get("/v1/salud", { schema: { hide: true } }, async (_peticion, respuesta) => {
		respuesta.header("cache-control", "no-store");
		try {
			await base.execute(sql`SELECT 1`);
		} catch {
			throw new ErrorDeApi("no_disponible");
		}
		return { ok: true };
	});

	return app;
}

/**
 * El cuerpo de una acción, ya validado por Fastify contra su contrato.
 * @throws Error si no tiene la forma, que solo pasaría si el esquema de la ruta no corrió.
 */
function cuerpoValidado(cuerpo: unknown): CuerpoDeAccion {
	if (
		typeof cuerpo !== "object" ||
		cuerpo === null ||
		!("clave_idempotencia" in cuerpo) ||
		typeof cuerpo.clave_idempotencia !== "string"
	) {
		throw new Error("el cuerpo de la acción no pasó por su validación");
	}
	const version = "version" in cuerpo && typeof cuerpo.version === "number" ? cuerpo.version : undefined;
	return {
		clave_idempotencia: cuerpo.clave_idempotencia,
		datos: "datos" in cuerpo ? cuerpo.datos : undefined,
		version,
	};
}

/**
 * La descripción de una acción o consulta en la documentación: qué hace, quién puede llamarla y qué se
 * le puede recortar (ver docs/cimientos/ACCESO-Y-PERMISOS.md, «La matriz de permisos»).
 */
function describir(descripcion: string, permiso: Permiso, recortables: readonly string[]): string {
	const partes = [
		permiso.departamento === undefined ? undefined : `departamento ${permiso.departamento}`,
		permiso.permisoFino === undefined ? undefined : `permiso fino ${permiso.permisoFino}`,
		permiso.soloDuena === true ? "solo la dueña" : undefined,
		permiso.confirmarConGoogle === undefined ? undefined : `«Confirmar con Google» (${permiso.confirmarConGoogle})`,
		permiso.aparatos === undefined ? undefined : `aparatos: ${permiso.aparatos.join(", ")}`,
	].filter((parte) => parte !== undefined);
	const quien = `Permiso: ${partes.length === 0 ? "cualquier cuenta con sesión" : partes.join("; ")}.`;
	const recorte = recortables.length === 0 ? "" : ` Se puede recortar: ${recortables.join(", ")}.`;
	return `${descripcion}\n\n${quien}${recorte}`;
}

/** Dice si un valor trae una llave con ese nombre, en cualquier nivel. */
function traeLlave(valor: unknown, llave: string): boolean {
	if (Array.isArray(valor)) return valor.some((elemento) => traeLlave(elemento, llave));
	if (typeof valor !== "object" || valor === null) return false;
	return Object.entries(valor).some(([nombre, adentro]) => nombre === llave || traeLlave(adentro, llave));
}

/**
 * Lo que una cuenta no debe ver no viaja: cada campo de `recortado` tiene que estar entre los que el
 * contrato deja recortar, y no puede venir en el resultado.
 * @throws Error si no se cumple: es un error del programa y sale como `500`, sin el dato.
 */
function revisarRecorte(
	nombre: string,
	recortables: readonly string[],
	resultado: unknown,
	recortado: readonly string[],
): void {
	for (const campo of recortado) {
		if (!recortables.includes(campo)) throw new Error(`${nombre} recortó ${campo}, que su contrato no deja recortar`);
		if (traeLlave(resultado, campo)) throw new Error(`${nombre} dice que recortó ${campo} pero lo manda`);
	}
}
