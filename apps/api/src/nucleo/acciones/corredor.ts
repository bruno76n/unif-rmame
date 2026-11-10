/**
 * El corredor de acciones: corre cada acción pública en el orden fijo de diez pasos.
 * Fase 3 · docs/cimientos/MODULOS.md («Cómo corre una acción»)
 *
 * Los pasos 1 a 4 (quién llama, la versión de la app, la forma y el permiso) los hace el servidor antes
 * de llegar aquí. El corredor hace los pasos 5 a 10: abre la transacción, aparta la clave, corre la
 * acción, pide la bitácora y los eventos una sola vez, guarda la respuesta y confirma. Si algo falla en
 * esos pasos no queda nada: ni sus escrituras, ni su clave, ni lo que hicieron sus internas.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { mensajeDeClaveUsada } from "@uniformame/compartido/contratos/protocolo";
import type { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { QuienLlama } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion, type Transaccion } from "../base/transacciones.ts";
import { errorDeRegla } from "../http/errores.ts";
import { apartarClave, guardarRespuesta, huellaDeCarga, sinSecretos } from "../idempotencia/claves.ts";
import type { AccionImplementada, ContextoDeAccion, Evento, RegistroDeModulos, RenglonDeBitacora } from "../modulos.ts";

/**
 * Lo que el corredor pide a `admin`: escribir la bitácora y guardar los eventos de la acción, en su
 * transacción. `admin.escribir_bitacora` y `admin.guardar_evento` llegan en la fase 4.
 */
export interface ServiciosDelCorredor {
	escribirBitacora: (
		transaccion: Transaccion,
		renglones: readonly RenglonDeBitacora[],
		comandoId: string,
	) => Promise<void>;
	guardarEventos: (transaccion: Transaccion, eventos: readonly Evento[], comandoId: string) => Promise<void>;
}

/** El cuerpo de una acción, ya validado contra su contrato. */
export interface CuerpoDeAccion {
	clave_idempotencia: string;
	datos: unknown;
	version?: number | undefined;
}

/** La respuesta correcta de una acción. */
export interface RespuestaDeAccion {
	ok: true;
	resultado: Record<string, unknown>;
	avisos: string[];
	secreto_entregado?: true;
}

/**
 * Arma el contexto de una acción: lo que recibe ella y las internas que llama.
 * @returns El contexto, con los renglones de bitácora y los eventos que va juntando.
 */
function crearContexto(
	registro: RegistroDeModulos,
	transaccion: Transaccion,
	quien: QuienLlama,
	ahora: Temporal.Instant,
	comandoId: string,
): {
	contexto: ContextoDeAccion;
	renglones: RenglonDeBitacora[];
	eventos: Evento[];
	estado: { versionTomada: boolean };
} {
	const renglones: RenglonDeBitacora[] = [];
	const eventos: Evento[] = [];
	const estado = { versionTomada: false };
	const contexto: ContextoDeAccion = {
		transaccion,
		quien,
		ahora,
		diaDeNegocio: diaDeNegocio(ahora),
		comandoId,
		interna: (nombre, datos) => {
			const interna = registro.internas.get(nombre);
			if (interna === undefined) throw new Error(`no existe la interna ${nombre}`);
			return interna(contexto, datos);
		},
		lectura: (nombre, datos) => {
			const lectura = registro.lecturas.get(nombre);
			if (lectura === undefined) throw new Error(`no existe la lectura ${nombre}`);
			return lectura(contexto, datos);
		},
		guardarEvento: (evento) => {
			eventos.push(evento);
		},
		bitacora: (renglon) => {
			renglones.push(renglon);
		},
		marcarVersionTomada: () => {
			estado.versionTomada = true;
		},
	};
	return { contexto, renglones, eventos, estado };
}

/**
 * Corre una acción pública (pasos 5 a 10).
 * @param dependencias La base, lo registrado por los módulos y los servicios de `admin`.
 * @param peticion La acción, quién llama, su cuerpo ya validado y la hora de la llamada.
 * @returns La respuesta: la nueva, o la misma de la primera vez si la clave ya se usó con el mismo contenido.
 * @throws El error de regla de la acción (`422`), `clave_usada` si la clave llegó con otro contenido, o
 * cualquier otro error; en todos los casos no queda nada escrito.
 */
export async function correrAccion(
	dependencias: { base: Base; registro: RegistroDeModulos; servicios: ServiciosDelCorredor },
	peticion: { accion: AccionImplementada; quien: QuienLlama; cuerpo: CuerpoDeAccion; ahora: Temporal.Instant },
): Promise<RespuestaDeAccion> {
	const { accion, quien, cuerpo, ahora } = peticion;
	const { contrato } = accion;
	const cargaHash = huellaDeCarga(contrato.nombre, cuerpo.datos, cuerpo.version);
	// Paso 5: la transacción. Si Postgres la corta por un choque, se repite completa con la misma clave.
	return enTransaccion(dependencias.base, async (transaccion) => {
		const comandoId = uuidv7();
		// Paso 6: aparta la clave; si ya estaba, contesta lo mismo que la primera vez.
		const apartada = await apartarClave(transaccion, {
			id: comandoId,
			clave: cuerpo.clave_idempotencia,
			quien,
			accion: contrato.nombre,
			ocurridoEn: ahora.toString(),
			cargaHash,
		});
		if (!apartada.nueva) {
			// La misma clave con otro contenido, o de otra cuenta de la web, no recibe la respuesta guardada.
			const otraCuenta = quien.tipo === "cuenta" && apartada.usuarioId !== quien.usuarioId;
			if (apartada.cargaHash !== cargaHash || otraCuenta) throw errorDeRegla("clave_usada", mensajeDeClaveUsada);
			return leerRespuestaGuardada(apartada.respuesta);
		}
		// Paso 7: la acción hace lo suyo.
		const { contexto, renglones, eventos, estado } = crearContexto(
			dependencias.registro,
			transaccion,
			quien,
			ahora,
			comandoId,
		);
		const salida = await accion.ejecutar(contexto, cuerpo.datos, cuerpo.version);
		// Una acción que edita tiene que haber tomado la versión que se leyó: si no, la versión no serviría.
		if (contrato.edita && !estado.versionTomada) throw new Error(`${contrato.nombre} edita pero no tomó su versión`);
		// La salida se revisa aquí, dentro de la transacción: un campo fuera del contrato no se guarda.
		const resultado = z.parse(contrato.resultado, salida.resultado);
		// Paso 8: la bitácora y los eventos, una sola vez por acción.
		await dependencias.servicios.escribirBitacora(transaccion, renglones, comandoId);
		await dependencias.servicios.guardarEventos(transaccion, eventos, comandoId);
		// Paso 9: la respuesta se guarda sin secretos.
		const respuesta: RespuestaDeAccion = { ok: true, resultado, avisos: salida.avisos ?? [] };
		await guardarRespuesta(transaccion, comandoId, sinSecretos(respuesta, contrato.secretos), salida.entidad);
		// Paso 10: confirma al salir de enTransaccion.
		return respuesta;
	});
}

/** Dice si un valor leído de JSON es un objeto (no una lista ni nulo). */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Lee la respuesta guardada de la primera vez.
 * @throws Error si lo guardado no tiene la forma de una respuesta.
 */
function leerRespuestaGuardada(guardada: unknown): RespuestaDeAccion {
	if (!esObjeto(guardada) || !esObjeto(guardada.resultado) || !Array.isArray(guardada.avisos)) {
		throw new Error("la respuesta guardada no tiene la forma de una respuesta");
	}
	return {
		ok: true,
		resultado: guardada.resultado,
		avisos: guardada.avisos.filter((aviso): aviso is string => typeof aviso === "string"),
		...(guardada.secreto_entregado === true ? { secreto_entregado: true as const } : {}),
	};
}
