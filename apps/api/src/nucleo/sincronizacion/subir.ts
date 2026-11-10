/**
 * `POST /v1/sync/subir`: el aparato sube su cola en tandas, en el orden en que pasó, y el servidor la aplica
 * comando por comando, cada uno en su transacción.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Subir · `POST /v1/sync/subir`»)
 *
 * Cada comando contesta `aplicado`, `repetido`, `apartado` o `excepcion`; un apartado no detiene la cola. Si
 * un comando falla por algo del servidor (no del comando), la tanda se corta con `detenido` y el aparato
 * vuelve a mandar desde el primero sin respuesta. Al final se guarda la subida, lo que le queda y el desfase
 * de su reloj.
 *
 * Un aparato revocado sigue subiendo su cola, pero nada se aplica: lo que pasó antes de revocarlo queda
 * retenido y lo de después se aparta; cada tanda con algo nuevo deja una bitácora con alerta.
 */

import { cuerpoDeSubida, respuestaDeSubida } from "@uniformame/compartido/contratos/sincronizacion";
import type { App } from "@uniformame/compartido/contratos/versiones";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";
import { comandosRecibidos, dispositivosSync } from "../../modulos/admin/tablas.ts";
import type { AparatoConLlave } from "../acceso/llave.ts";
import { parametroEntero } from "../acceso/sesion.ts";
import { crearContexto } from "../acciones/corredor.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion } from "../base/transacciones.ts";
import { ErrorDeApi, errorParaElRegistro } from "../http/errores.ts";
import { identificarAparato } from "./aparato.ts";
import {
	accionDeLaSubida,
	anotarClaveRepetida,
	aplicarComando,
	type CargaDeComando,
	type DependenciasDeComandos,
	deUnRevocado,
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
			// Un aparato revocado sigue subiendo su cola hasta vaciarla: nada se pierde.
			const aparato = await identificarAparato(base, dependencias.versionMinimaDelParametro, peticion, ahora, {
				permitirRevocado: true,
			});
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
			let nuevosDeUnRevocado = 0;
			for (const comando of cuerpo.comandos) {
				try {
					const { contestado, nuevo } = await subirComando(dependencias, aparato, comando, ahora);
					respuestas.push(contestado);
					if (nuevo && aparato.revocadoEn !== undefined) nuevosDeUnRevocado++;
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
			if (nuevosDeUnRevocado > 0) await alertarDeUnRevocado(dependencias, aparato, nuevosDeUnRevocado, ahora);
			await anotarSubida(base, aparato, {
				ahora,
				enviadoEn: cuerpo.enviado_en,
				pendientes: cuerpo.pendientes_por_subir - respuestas.length,
			});
			const revocado = aparato.revocadoEn !== undefined;
			return {
				ok: true as const,
				respuestas,
				detenido,
				revocado,
				hay_cambios: !revocado && respuestas.some((contestado) => contestado.resultado !== "apartado"),
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
 * @returns La respuesta del comando, con su clave, y si llegó por primera vez.
 * @throws Un error del servidor: la tanda se detiene y no queda nada de este comando.
 */
async function subirComando(
	dependencias: DependenciasDeLaSubida,
	aparato: AparatoConLlave,
	comando: ComandoQueSube,
	ahora: Temporal.Instant,
): Promise<{ contestado: RespuestaConClave; nuevo: boolean }> {
	const { clave_idempotencia: clave, ...llegada } = comando;
	const carga = cargaSinVacios(llegada);
	const conClave = (contestado: RespuestaSinClave, nuevo: boolean) => ({
		contestado: { clave_idempotencia: clave, ...contestado },
		nuevo,
	});
	return enTransaccion(dependencias.base, async (transaccion) => {
		// Dos tandas con la misma clave a la vez: la segunda espera a la primera y ve su comando.
		await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`);
		// Paso 1: ¿ya llegó?
		const [anterior] = await transaccion
			.select({ cargaHash: comandosRecibidos.cargaHash, respuesta: comandosRecibidos.respuesta })
			.from(comandosRecibidos)
			.where(eq(comandosRecibidos.claveIdempotencia, clave));
		if (anterior !== undefined) {
			// Lo que ya había llegado (también antes de revocar el aparato) sigue siendo `repetido`.
			if (anterior.cargaHash === huellaDeComando(carga)) return conClave(respuestaRepetida(anterior.respuesta), false);
			// Con otro contenido: se aparta sin renglón nuevo, y queda en la bitácora.
			await anotarClaveRepetida(dependencias, transaccion, aparato, carga.accion, ahora);
			return conClave(
				{
					resultado: "apartado",
					datos: null,
					entidad: null,
					excepciones: [],
					motivo: motivoDeClaveRepetida,
					espera_entidad_id: null,
					campos: null,
					avisos: [],
				},
				false,
			);
		}
		// Pasos 2 a 6: el alcance, la forma, el documento que espera y la acción; de un aparato revocado no se
		// aplica nada: queda retenido o apartado según cuándo pasó.
		const quien = { ...aparato.quien, personaId: carga.persona_id };
		const comandoId = uuidv7();
		const { revocadoEn } = aparato;
		const hecho =
			revocadoEn === undefined
				? await aplicarComando(dependencias, transaccion, quien, carga, comandoId)
				: deUnRevocado(carga.ocurrido_en, revocadoEn);
		// Paso 7: su renglón de `comandos_recibidos`, en la misma transacción.
		await guardarComando(transaccion, {
			id: comandoId,
			clave,
			aparato: quien,
			carga,
			hecho,
			revocado: revocadoEn !== undefined,
		});
		return conClave(hecho.respuesta, true);
	});
}

/**
 * La bitácora de una tanda de un aparato revocado, con alerta (llega a la dueña como `alerta_seguridad`).
 * @param dependencias Los módulos y la bitácora.
 * @param aparato El aparato revocado.
 * @param cuantos Los movimientos nuevos de la tanda.
 * @param ahora La hora de la subida.
 */
async function alertarDeUnRevocado(
	dependencias: DependenciasDeLaSubida,
	aparato: AparatoConLlave,
	cuantos: number,
	ahora: Temporal.Instant,
): Promise<void> {
	await enTransaccion(dependencias.base, async (transaccion) => {
		const { contexto } = crearContexto(
			dependencias.registro,
			transaccion,
			aparato.quien,
			accionDeLaSubida,
			ahora,
			undefined,
		);
		await dependencias.servicios.escribirBitacora(contexto, [
			{
				descripcion: `Llegaron ${cuantos} movimientos de ${aparato.nombre} después de revocarlo`,
				entidad: "dispositivos",
				entidadId: aparato.quien.dispositivoId,
				esAlerta: true,
			},
		]);
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
