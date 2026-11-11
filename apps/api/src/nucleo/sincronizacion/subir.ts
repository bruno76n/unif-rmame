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
import { z } from "zod";
import { comandosRecibidos, dispositivosSync } from "../../modulos/admin/tablas.ts";
import type { AparatoConLlave } from "../acceso/llave.ts";
import { parametroEntero } from "../acceso/sesion.ts";
import { crearContexto } from "../acciones/corredor.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion, type Transaccion } from "../base/transacciones.ts";
import { ErrorDeApi, errorParaElRegistro } from "../http/errores.ts";
import { identificarAparato } from "./aparato.ts";
import {
	accionDeLaSubida,
	anotarClaveRepetida,
	aplicarComando,
	type CargaDeComando,
	type ComandoHecho,
	cargaSinSecretos,
	type DependenciasDeComandos,
	deUnRevocado,
	guardarComando,
	huellaDeComando,
	motivoDeClaveRepetida,
	motivoDeRetenido,
	personaDelComando,
	type RespuestaSinClave,
	reintentarLosQueEsperaban,
	reintentarLosQueYaTienenSuDocumento,
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
			const dispositivoId = aparato.quien.dispositivoId;
			/** Reintenta los apartados que esperaban documentos que ya llegaron; si falla, la cola sigue. */
			const destrabar = async (entidadId?: string) => {
				try {
					if (entidadId === undefined) await reintentarLosQueYaTienenSuDocumento(dependencias, base, dispositivoId);
					else await reintentarLosQueEsperaban(dependencias, base, dispositivoId, entidadId);
				} catch (error) {
					peticion.log.error({ error: errorParaElRegistro(error) }, "un apartado no se pudo reintentar");
				}
			};
			// Lo que se quedó esperando un documento que ya llegó (un reintento que falló antes) se vuelve a intentar.
			if (aparato.revocadoEn === undefined) await destrabar();
			const respuestas: RespuestaConClave[] = [];
			let detenido = false;
			for (const [indice, comando] of cuerpo.comandos.entries()) {
				try {
					// La alerta de un aparato revocado va con el último comando de la tanda, en su transacción.
					const alertar = aparato.revocadoEn !== undefined && indice === cuerpo.comandos.length - 1;
					const contestado = await subirComando(dependencias, aparato, comando, ahora, alertar);
					respuestas.push(contestado);
					// Lo que creó o tocó puede ser el documento que esperaban sus apartados. Si su reintento falla,
					// este comando ya quedó y la cola sigue: se vuelven a intentar al empezar la siguiente subida.
					if (contestado.entidad !== null) await destrabar(contestado.entidad.id);
				} catch (error) {
					peticion.log.error({ error: errorParaElRegistro(error) }, "la subida se detuvo");
					detenido = true;
					break;
				}
			}
			// Una tanda de un revocado que se cortó antes de su último comando intenta su alerta aparte.
			if (detenido && aparato.revocadoEn !== undefined) {
				await enTransaccion(base, (transaccion) =>
					alertarDeUnRevocado(dependencias, transaccion, aparato, ahora),
				).catch((error: unknown) =>
					peticion.log.error({ error: errorParaElRegistro(error) }, "la alerta no se escribió"),
				);
			}
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
 * @param alertar Si es el último comando de la tanda de un aparato revocado: escribe la alerta en su transacción.
 * @returns La respuesta del comando, con su clave.
 * @throws Un error del servidor: la tanda se detiene y no queda nada de este comando.
 */
async function subirComando(
	dependencias: DependenciasDeLaSubida,
	aparato: AparatoConLlave,
	comando: ComandoQueSube,
	ahora: Temporal.Instant,
	alertar: boolean,
): Promise<RespuestaConClave> {
	const { clave_idempotencia: clave, ...llegada } = comando;
	const carga = cargaSinVacios(llegada);
	return enTransaccion(dependencias.base, async (transaccion) => {
		const contestado = await contestarComando(dependencias, transaccion, aparato, clave, carga, ahora);
		if (alertar) await alertarDeUnRevocado(dependencias, transaccion, aparato, ahora);
		return { clave_idempotencia: clave, ...contestado };
	});
}

/**
 * Contesta un comando dentro de su transacción: si ya llegó, lo de la primera vez; si no, lo aplica o lo
 * aparta y lo guarda.
 * @param dependencias Los módulos, la bitácora, los eventos y la base.
 * @param transaccion La transacción del comando.
 * @param aparato El aparato que sube.
 * @param clave La clave de idempotencia del comando.
 * @param carga El comando sin su clave.
 * @param ahora La hora de la subida.
 * @returns La respuesta del comando, sin su clave.
 */
async function contestarComando(
	dependencias: DependenciasDeLaSubida,
	transaccion: Transaccion,
	aparato: AparatoConLlave,
	clave: string,
	carga: CargaDeComando,
	ahora: Temporal.Instant,
): Promise<RespuestaSinClave> {
	// Dos tandas con la misma clave a la vez: la segunda espera a la primera y ve su comando.
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`);
	// Paso 1: ¿ya llegó?
	const [anterior] = await transaccion
		.select({ cargaHash: comandosRecibidos.cargaHash, respuesta: comandosRecibidos.respuesta })
		.from(comandosRecibidos)
		.where(eq(comandosRecibidos.claveIdempotencia, clave));
	if (anterior !== undefined) {
		// Lo que ya había llegado (también antes de revocar el aparato) sigue siendo `repetido`.
		if (anterior.cargaHash === huellaDeComando(carga)) return respuestaRepetida(anterior.respuesta);
		// Con otro contenido: se aparta sin renglón nuevo, y queda en la bitácora.
		await anotarClaveRepetida(dependencias, transaccion, aparato, carga.accion, ahora);
		return {
			resultado: "apartado",
			datos: null,
			entidad: null,
			excepciones: [],
			motivo: motivoDeClaveRepetida,
			espera_entidad_id: null,
			campos: null,
			avisos: [],
		};
	}
	// Pasos 2 a 6: el alcance, la forma, el documento que espera y la acción; de un aparato revocado no se
	// aplica nada: queda retenido o apartado según cuándo pasó.
	const quien = { ...aparato.quien, personaId: carga.persona_id };
	const comandoId = uuidv7();
	const { revocadoEn } = aparato;
	const hecho =
		revocadoEn === undefined
			? await aplicarComando(dependencias, transaccion, quien, carga, { id: comandoId, clave })
			: await conSuExcepcion(
					dependencias,
					transaccion,
					aparato,
					carga,
					comandoId,
					ahora,
					deUnRevocado(carga.ocurrido_en, revocadoEn),
				);
	// Paso 7: su renglón de `comandos_recibidos`, en la misma transacción.
	await guardarComando(transaccion, {
		id: comandoId,
		clave,
		aparato: quien,
		carga,
		hecho,
		revocado: revocadoEn !== undefined,
	});
	return hecho.respuesta;
}

/**
 * Lo retenido de un aparato revocado abre la excepción `dispositivo_revocado`, con su carga, para que la dueña lo
 * aplique o Bodega lo resuelva; la respuesta lleva la excepción. Lo apartado (`despues_de_revocar`) no la abre.
 * @param dependencias Los módulos, la bitácora y los eventos.
 * @param transaccion La transacción del comando.
 * @param aparato El aparato revocado.
 * @param carga Lo que llegó.
 * @param comandoId El id de su renglón en `comandos_recibidos` (se guarda después, en la misma transacción).
 * @param ahora La hora de la subida.
 * @param hecho Lo que contesta el aparato revocado.
 */
async function conSuExcepcion(
	dependencias: DependenciasDeLaSubida,
	transaccion: Transaccion,
	aparato: AparatoConLlave,
	carga: CargaDeComando,
	comandoId: string,
	ahora: Temporal.Instant,
	hecho: ComandoHecho,
): Promise<ComandoHecho> {
	if (hecho.respuesta.resultado !== "excepcion") return hecho;
	const { contexto, eventos } = crearContexto(
		dependencias.registro,
		transaccion,
		aparato.quien,
		accionDeLaSubida,
		ahora,
		comandoId,
	);
	const { excepcion_id } = z.object({ excepcion_id: z.uuid() }).parse(
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: motivoDeRetenido,
			descripcion: `${carga.accion} de ${aparato.nombre}, que pasó antes de revocarlo: quedó retenido`,
			comando_id: comandoId,
			dispositivo_id: aparato.quien.dispositivoId,
			...(carga.persona_id !== undefined && (await personaDelComando(transaccion, carga.persona_id)) !== undefined
				? { persona_id: carga.persona_id }
				: {}),
			datos: cargaSinSecretos(carga),
		}),
	);
	await dependencias.servicios.guardarEventos(contexto, eventos);
	const respuesta = { ...hecho.respuesta, excepciones: [{ id: excepcion_id, codigo: motivoDeRetenido }] };
	return { ...hecho, respuesta, guardada: respuesta, excepcionId: excepcion_id };
}

/**
 * La bitácora de una tanda de un aparato revocado, con alerta (llega a la dueña como `alerta_seguridad`).
 * Cuenta lo que llegó del aparato revocado y no ha contado ninguna alerta: todo lo llegado menos lo que ya
 * sumaron las anteriores (cada una guarda sus `movimientos`). Con el candado del aparato, dos tandas a la vez
 * no cuentan lo mismo dos veces, y si una tanda se corta antes de su alerta, la siguiente cuenta lo que faltaba.
 * @param dependencias Los módulos y la bitácora.
 * @param transaccion La transacción del último comando de la tanda (o una propia, si la tanda se cortó).
 * @param aparato El aparato revocado.
 * @param ahora La hora de la subida.
 */
async function alertarDeUnRevocado(
	dependencias: DependenciasDeLaSubida,
	transaccion: Transaccion,
	aparato: AparatoConLlave,
	ahora: Temporal.Instant,
): Promise<void> {
	const dispositivoId = aparato.quien.dispositivoId;
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`alerta:${dispositivoId}`}, 0))`);
	const { rows } = await transaccion.execute(sql`
		SELECT
			(SELECT count(*) FROM comandos_recibidos
			 WHERE dispositivo_id = ${dispositivoId}::uuid AND dispositivo_revocado)
			- (SELECT coalesce(sum((despues->>'movimientos')::int), 0) FROM bitacora
			   WHERE accion = ${accionDeLaSubida} AND es_alerta AND entidad = 'dispositivos'
			     AND entidad_id = ${dispositivoId}::uuid)
			AS cuantos`);
	const cuantos = z.object({ cuantos: z.coerce.number() }).parse(rows[0]).cuantos;
	if (cuantos <= 0) return;
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
			descripcion:
				cuantos === 1
					? `Llegó 1 movimiento de ${aparato.nombre} después de revocarlo`
					: `Llegaron ${cuantos} movimientos de ${aparato.nombre} después de revocarlo`,
			entidad: "dispositivos",
			entidadId: dispositivoId,
			esAlerta: true,
			despues: { movimientos: cuantos },
		},
	]);
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
