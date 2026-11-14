/**
 * Lo que el puente le pide a la API, con su llave (`Authorization: Llave {llave_id}.{secreto}`) y su versión: sus
 * trabajos, el ZPL de cada uno, la confirmación y el cambio de su llave. Usa el cliente con tipos del paquete
 * compartido, con sus reintentos y su misma clave en cada reintento.
 * Fase 20 · docs/apps/puente-de-impresion.md (regla 3, «Cómo trabaja», «La llave» y «Cómo se actualiza»)
 *
 * El cambio de llave: guarda primero el secreto nuevo junto al viejo y luego llama a `admin.rotar_llave` con el viejo.
 * Si no supo si se aplicó, la siguiente llamada prueba la nueva; si la API no la conoce, usa la vieja (que vale durante
 * la gracia) y olvida la nueva.
 */

import { randomBytes } from "node:crypto";
import { crearCliente, ErrorDeLaApi, ErrorSinRed } from "@uniformame/compartido/cliente/cliente";
import { conLaLlaveQueVale } from "@uniformame/compartido/cliente/llave";
import { rotarLlave } from "@uniformame/compartido/contratos/admin/dispositivos";
import { confirmarImpresion, trabajosImpresion } from "@uniformame/compartido/contratos/admin/impresion";
import { respuestaDeError } from "@uniformame/compartido/contratos/protocolo";
import type { z } from "zod";
import type { Configuracion } from "./configuracion.ts";
import { versionDelPuente } from "./version.ts";

/** Los trabajos que regresa `admin.trabajos_impresion`. */
export type RespuestaDeTrabajos = z.output<typeof trabajosImpresion.resultado>;

/** La dueña revocó este aparato: ya no entra. */
export class AparatoRevocado extends Error {
	constructor() {
		super("Este aparato fue revocado: ya no entra.");
	}
}

/** La versión del puente es vieja: hay que actualizarlo. */
export class HayQueActualizar extends Error {
	constructor() {
		super("Hay una versión nueva. Actualiza para seguir.");
	}
}

/** Lo que el puente le pide a la API. */
export interface ApiDelPuente {
	/** Pide sus trabajos por imprimir con la clave del pedido: es también su señal de vida. */
	trabajos: (clave: string) => Promise<RespuestaDeTrabajos>;
	/** Baja el ZPL de un trabajo por su ruta. */
	bajarZpl: (ruta: string) => Promise<string>;
	/** Confirma un trabajo con su clave: el reintento recibe la misma respuesta. */
	confirmar: (
		trabajoId: string,
		terminado: { resultado: "impreso" | "fallo"; error?: string; clave: string },
	) => Promise<void>;
	/** Cambia su llave por una nueva. */
	rotarLlave: () => Promise<void>;
	/** Los encabezados de su llave y su versión, para los avisos en vivo. */
	encabezados: () => Promise<Record<string, string>>;
}

/** Cómo se leen y se guardan la configuración, y con qué `fetch` se llama. */
export interface DependenciasDeLaApi {
	leer: () => Promise<Configuracion>;
	guardar: (configuracion: Configuracion) => Promise<void>;
	fetch?: typeof fetch;
	/** Cuántas veces reintenta sin red (4); las pruebas lo bajan. */
	reintentos?: number;
}

/**
 * Convierte un error de la API en lo que detiene al puente: revocado o versión vieja.
 * @param error Lo que pasó.
 * @returns El error que sigue.
 */
export function errorDelPuente(error: unknown): unknown {
	if (error instanceof ErrorDeLaApi) {
		if (error.estado === 426) return new HayQueActualizar();
		if (error.respuesta.codigo === "llave_revocada") return new AparatoRevocado();
	}
	return error;
}

/**
 * Arma lo que el puente le pide a la API.
 * @param dependencias Cómo se lee y se guarda su configuración.
 */
export function crearApiDelPuente(dependencias: DependenciasDeLaApi): ApiDelPuente {
	const llamar = dependencias.fetch ?? fetch;

	/** El cliente con un secreto dado. */
	function clienteCon(configuracion: Configuracion, secreto: string) {
		return crearCliente(
			{
				acciones: {
					[trabajosImpresion.nombre]: trabajosImpresion,
					[confirmarImpresion.nombre]: confirmarImpresion,
					[rotarLlave.nombre]: rotarLlave,
				},
				consultas: {},
			},
			{
				urlBase: configuracion.api,
				versionApp: versionDelPuente,
				encabezados: () => ({ authorization: `Llave ${configuracion.llave_id}.${secreto}` }),
				// El puente no tiene sesión: nunca le piden «Confirmar con Google».
				alReautenticar: async () => {
					throw new Error("el puente no confirma con Google");
				},
				alActualizar: () => undefined,
				fetch: llamar,
				...(dependencias.reintentos === undefined ? {} : { reintentos: dependencias.reintentos }),
			},
		);
	}

	/**
	 * Hace una llamada con la llave que vale: la nueva si hay una por confirmar, y si la API no la conoce, la vieja.
	 * @param hacer La llamada, con su cliente y el secreto que usa.
	 */
	async function conLaLlave<T>(
		hacer: (cliente: ReturnType<typeof clienteCon>, secreto: string) => Promise<T>,
	): Promise<T> {
		const configuracion = await dependencias.leer();
		const { secreto_nuevo: secretoNuevo, ...sinNuevo } = configuracion;
		try {
			return await conLaLlaveQueVale(
				{ secreto: configuracion.secreto, secretoNuevo },
				(secreto) => hacer(clienteCon(configuracion, secreto), secreto),
				(secreto) => dependencias.guardar({ ...sinNuevo, secreto }),
			);
		} catch (error) {
			throw errorDelPuente(error);
		}
	}

	return {
		trabajos: (clave) => conLaLlave((cliente) => cliente.accion("admin.trabajos_impresion", { datos: {} }, clave)),
		bajarZpl: (ruta) =>
			conLaLlave(async (_cliente, secreto) => {
				const configuracion = await dependencias.leer();
				const respuesta = await llamar(`${configuracion.api}${ruta}`, {
					headers: {
						authorization: `Llave ${configuracion.llave_id}.${secreto}`,
						"x-app-version": versionDelPuente,
					},
				}).catch(() => {
					throw new ErrorSinRed();
				});
				if (respuesta.ok) return respuesta.text();
				// Un error de la API trae su forma; uno sin ella (un proxy, un corte) cuenta como falta de red.
				const error = respuestaDeError.safeParse(await respuesta.json().catch(() => null));
				if (!error.success) throw new ErrorSinRed();
				throw new ErrorDeLaApi(respuesta.status, error.data);
			}),
		confirmar: async (trabajoId, terminado) => {
			await conLaLlave((cliente) =>
				cliente.accion(
					"admin.confirmar_impresion",
					{
						datos: {
							trabajo_id: trabajoId,
							resultado: terminado.resultado,
							...(terminado.error === undefined ? {} : { error: terminado.error }),
						},
					},
					terminado.clave,
				),
			);
		},
		rotarLlave: async () => {
			const configuracion = await dependencias.leer();
			const nuevo = randomBytes(32).toString("base64url");
			// Primero se guarda la nueva: si se corta la respuesta, la siguiente llamada la prueba.
			await dependencias.guardar({ ...configuracion, secreto_nuevo: nuevo });
			try {
				await clienteCon(configuracion, configuracion.secreto).accion("admin.rotar_llave", {
					datos: { secreto_nuevo: nuevo },
				});
			} catch (error) {
				// Sin red no se sabe si se aplicó: la nueva se queda para probarla. Si la API dijo que no, se olvida.
				if (!(error instanceof ErrorSinRed)) await dependencias.guardar(configuracion);
				throw errorDelPuente(error);
			}
			await dependencias.guardar({ ...configuracion, secreto: nuevo });
		},
		encabezados: async () => {
			const configuracion = await dependencias.leer();
			return {
				authorization: `Llave ${configuracion.llave_id}.${configuracion.secreto_nuevo ?? configuracion.secreto}`,
				"x-app-version": versionDelPuente,
			};
		},
	};
}
