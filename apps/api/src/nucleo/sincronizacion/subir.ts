/**
 * `POST /v1/sync/subir`: el aparato sube su cola en tandas, en el orden en que pasó, y el servidor la aplica
 * comando por comando, cada uno en su transacción.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Subir · `POST /v1/sync/subir`»)
 *
 * Cada comando contesta `aplicado`, `repetido`, `apartado` o `excepcion`; un apartado no detiene la cola. Si
 * un comando falla por algo del servidor (no del comando), la tanda se corta con `detenido` y el aparato
 * vuelve a mandar desde el primero sin respuesta. Al final se guarda la subida, lo que le queda y el desfase
 * de su reloj.
 */

import { cuerpoDeSubida, respuestaDeSubida } from "@uniformame/compartido/contratos/sincronizacion";
import { type App, compararVersiones, versionMinima } from "@uniformame/compartido/contratos/versiones";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";
import { comandosRecibidos, dispositivosSync } from "../../modulos/admin/tablas.ts";
import { type AparatoConLlave, identificarConLlave } from "../acceso/llave.ts";
import { appDe } from "../acceso/quien.ts";
import { parametroEntero } from "../acceso/sesion.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion } from "../base/transacciones.ts";
import { ErrorDeApi, errorParaElRegistro } from "../http/errores.ts";
import {
	anotarClaveRepetida,
	aplicarComando,
	type CargaDeComando,
	type DependenciasDeComandos,
	guardarComando,
	huellaDeComando,
	motivoDeClaveRepetida,
	type RespuestaSinClave,
	reintentarLosQueEsperaban,
	respuestaRepetida,
} from "./comandos.ts";

/** Lo que necesita la subida. */
export interface DependenciasDeLaSubida extends DependenciasDeComandos {
	base: Base;
	reloj: () => Temporal.Instant;
	/** La versión mínima del parámetro de la dueña para una app. */
	versionMinimaDelParametro: (app: App) => Promise<string>;
}

/** Un comando de la tanda, como llega. */
type ComandoQueSube = z.infer<typeof cuerpoDeSubida>["comandos"][number];

/** La respuesta a un comando, con su clave. */
type RespuestaConClave = RespuestaSinClave & { clave_idempotencia: string };

/**
 * El plugin de Fastify con la ruta de la subida.
 * @param dependencias La base, los módulos, la bitácora y los eventos, la hora y la versión mínima.
 */
export function subidaDeAparatos(dependencias: DependenciasDeLaSubida): FastifyPluginAsync {
	return async (raiz) => registrarSubida(raiz, dependencias);
}

/** Registra la ruta de la subida en el plugin. */
function registrarSubida(raiz: FastifyInstance, dependencias: DependenciasDeLaSubida): void {
	const { base } = dependencias;
	const app = raiz.withTypeProvider<ZodTypeProvider>();

	/** Pasos 1 y 2 de la API: la llave del aparato y la versión de su app. */
	async function identificarAparato(peticion: FastifyRequest, ahora: Temporal.Instant): Promise<AparatoConLlave> {
		const aparato = await identificarConLlave(base, peticion, ahora);
		if (aparato === undefined) throw new ErrorDeApi("sin_sesion", "sin_sesion");
		const app = appDe(aparato.quien);
		const minima = versionMinima(app, await dependencias.versionMinimaDelParametro(app));
		const version = peticion.headers["x-app-version"];
		if (typeof version !== "string" || (compararVersiones(version, minima) ?? -1) < 0) {
			throw new ErrorDeApi("actualizar", null, undefined, { version_minima: minima });
		}
		return aparato;
	}

	app.post(
		"/v1/sync/subir",
		{
			schema: {
				description:
					"El aparato sube su cola en tandas, en el orden en que pasó. Cada comando es su propia transacción.\n\nPermiso: un aparato con su llave.",
				tags: ["sync"],
				body: cuerpoDeSubida,
				response: { 200: respuestaDeSubida },
			},
		},
		async (peticion, respuesta) => {
			const ahora = dependencias.reloj();
			const aparato = await identificarAparato(peticion, ahora);
			peticion.quien = aparato.quien;
			const cuerpo = peticion.body;
			const tandaMaxima = await parametroEntero(base, "sync.tanda_max_comandos");
			if (cuerpo.comandos.length > tandaMaxima) {
				throw new ErrorDeApi("validacion", null, undefined, {
					campos: { comandos: `Manda de 1 a ${tandaMaxima} comandos por tanda.` },
				});
			}
			respuesta.header("cache-control", "no-store");
			const respuestas: RespuestaConClave[] = [];
			let detenido = false;
			for (const comando of cuerpo.comandos) {
				try {
					const contestado = await subirComando(dependencias, aparato, comando, ahora);
					respuestas.push(contestado);
					// Lo que creó o tocó puede ser el documento que esperaban sus apartados.
					if (contestado.entidad !== null) {
						await reintentarLosQueEsperaban(dependencias, base, aparato.quien.dispositivoId, contestado.entidad.id);
					}
				} catch (error) {
					peticion.log.error({ error: errorParaElRegistro(error) }, "la subida se detuvo");
					detenido = true;
					break;
				}
			}
			await anotarSubida(base, aparato, {
				ahora,
				enviadoEn: cuerpo.enviado_en,
				pendientes: cuerpo.pendientes_por_subir - respuestas.length,
			});
			return {
				ok: true as const,
				respuestas,
				detenido,
				revocado: false,
				hay_cambios: respuestas.some((contestado) => contestado.resultado !== "apartado"),
			};
		},
	);
}

/**
 * Sube un comando en su transacción: si ya llegó, lo de la primera vez; si no, lo aplica o lo aparta y lo
 * guarda.
 * @param dependencias Los módulos, la bitácora, los eventos y la base.
 * @param aparato El aparato que sube.
 * @param comando El comando como llegó.
 * @param ahora La hora de la subida.
 * @returns La respuesta del comando, con su clave.
 * @throws Un error del servidor: la tanda se detiene y no queda nada de este comando.
 */
async function subirComando(
	dependencias: DependenciasDeLaSubida,
	aparato: AparatoConLlave,
	comando: ComandoQueSube,
	ahora: Temporal.Instant,
): Promise<RespuestaConClave> {
	const { clave_idempotencia: clave, ...llegada } = comando;
	const carga = cargaSinVacios(llegada);
	const conClave = (contestado: RespuestaSinClave): RespuestaConClave => ({ clave_idempotencia: clave, ...contestado });
	return enTransaccion(dependencias.base, async (transaccion) => {
		// Dos tandas con la misma clave a la vez: la segunda espera a la primera y ve su comando.
		await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`);
		// Paso 1: ¿ya llegó?
		const [anterior] = await transaccion
			.select({ cargaHash: comandosRecibidos.cargaHash, respuesta: comandosRecibidos.respuesta })
			.from(comandosRecibidos)
			.where(eq(comandosRecibidos.claveIdempotencia, clave));
		if (anterior !== undefined) {
			if (anterior.cargaHash === huellaDeComando(carga)) return conClave(respuestaRepetida(anterior.respuesta));
			// Con otro contenido: se aparta sin renglón nuevo, y queda en la bitácora.
			await anotarClaveRepetida(dependencias, transaccion, aparato, carga.accion, ahora);
			return conClave({
				resultado: "apartado",
				datos: null,
				entidad: null,
				excepciones: [],
				motivo: motivoDeClaveRepetida,
				espera_entidad_id: null,
				campos: null,
				avisos: [],
			});
		}
		// Pasos 2 a 6: el alcance, la forma, el documento que espera y la acción.
		const quien = { ...aparato.quien, personaId: carga.persona_id };
		const comandoId = uuidv7();
		const hecho = await aplicarComando(dependencias, transaccion, quien, carga, comandoId);
		// Paso 7: su renglón de `comandos_recibidos`, en la misma transacción.
		await guardarComando(transaccion, { id: comandoId, clave, aparato: quien, carga, hecho });
		return conClave(hecho.respuesta);
	});
}

/**
 * La carga sin los campos que no vinieron, para que la huella y lo guardado sean iguales en cada reintento.
 * @param carga El comando sin su clave.
 */
function cargaSinVacios(carga: Omit<ComandoQueSube, "clave_idempotencia">): CargaDeComando {
	return {
		accion: carga.accion,
		datos: carga.datos,
		ocurrido_en: carga.ocurrido_en,
		...(carga.persona_id === undefined ? {} : { persona_id: carga.persona_id }),
		...(carga.codigo_usado === undefined ? {} : { codigo_usado: carga.codigo_usado }),
	};
}

/**
 * Paso 3 de la subida: guarda en `dispositivos_sync` la subida, lo que le queda por subir y el desfase de su
 * reloj (la hora de recibido menos `enviado_en`, en segundos).
 * @param base La base.
 * @param aparato El aparato.
 * @param subida La hora de recibido, la del aparato al mandar y lo que le queda.
 */
async function anotarSubida(
	base: Base,
	aparato: AparatoConLlave,
	subida: { ahora: Temporal.Instant; enviadoEn: string; pendientes: number },
): Promise<void> {
	const desfase = Math.round(
		subida.ahora.since(subida.enviadoEn, { largestUnit: "seconds" }).total({ unit: "seconds" }),
	);
	await base
		.update(dispositivosSync)
		.set({
			ultimaSubidaEn: subida.ahora.toString(),
			ultimoContactoEn: subida.ahora.toString(),
			pendientesPorSubir: Math.max(0, subida.pendientes),
			desfaseRelojSeg: desfase,
			actualizadoEn: sql`now()`,
		})
		.where(eq(dispositivosSync.dispositivoId, aparato.quien.dispositivoId));
}
