/**
 * El cliente de la API con tipos: el SDK que usan la web y la tablet.
 * Fase 3 · docs/cimientos/PAQUETE-COMPARTIDO.md («El cliente de la API») y docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («Los reintentos»)
 *
 * Sale de los contratos: un nombre o un dato que no existe no compila. La clave de idempotencia nace
 * cuando la persona aprieta el botón y se reusa en cada reintento de esa intención. Reintenta solo sin
 * red, sin respuesta, con `500`, `502`, `503` o `504` (o si la respuesta se corta), con espera creciente; ante `401 reautenticar` pide
 * «Confirmar con Google» y repite una vez; ante `426` pide actualizar; ante `409` entrega los datos
 * nuevos a la pantalla. Nunca inventa mensajes: el error trae el de la API.
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContratoDeAccion, ContratoDeConsulta } from "../contratos/definir.ts";
import { type RespuestaDeError, respuestaDeError } from "../contratos/protocolo.ts";

/** Un error que contestó la API, con su forma completa. */
export class ErrorDeLaApi extends Error {
	readonly respuesta: RespuestaDeError;
	readonly estado: number;
	/** La clave de la intención, si fue una acción: la pantalla la reusa si la persona vuelve a intentar. */
	readonly clave: string | undefined;

	/**
	 * @param estado El estado HTTP.
	 * @param respuesta El cuerpo del error, como lo mandó la API.
	 * @param clave La clave de la intención, si fue una acción.
	 */
	constructor(estado: number, respuesta: RespuestaDeError, clave?: string) {
		super(respuesta.mensaje);
		this.estado = estado;
		this.respuesta = respuesta;
		this.clave = clave;
	}
}

/** Alguien más cambió el registro: la pantalla muestra `datos` y la persona decide. */
export class ErrorDeConflicto extends ErrorDeLaApi {
	/** La versión actual. */
	get version(): number | undefined {
		return this.respuesta.version;
	}

	/** Lo que hay ahora, recortado según la cuenta. */
	get datos(): unknown {
		return this.respuesta.datos;
	}
}

/**
 * No hubo red ni respuesta legible después de todos los reintentos. Lleva la clave de la intención: si la
 * persona vuelve a intentar, la pantalla la pasa otra vez, porque la primera pudo haberse aplicado.
 */
export class ErrorSinRed extends Error {
	readonly clave: string | undefined;

	/**
	 * @param clave La clave de la intención, si fue una acción.
	 */
	constructor(clave?: string) {
		super("No hay conexión con el sistema.");
		this.clave = clave;
	}
}

/** Cómo se arma el cliente. */
export interface OpcionesDelCliente {
	/** La dirección de la API, sin la diagonal final. */
	urlBase: string;
	/** La versión de esta app, para `X-App-Version`. */
	versionApp: string;
	/** Abre «Confirmar con Google» y espera a que la persona termine. */
	alReautenticar: (proposito: string | undefined) => Promise<void>;
	/** La app es vieja: recargarla o actualizarla. */
	alActualizar: (versionMinima: string | undefined) => void;
	/** Lo de cada llamada: la llave del aparato, en la tablet. */
	encabezados?: () => Record<string, string>;
	/** `include` en la web, para mandar la cookie de sesión. */
	credenciales?: "include" | "same-origin" | "omit";
	/** Los avisos que no bloquean de una acción («Ojo: cambio de más de 30 %»), si trae alguno: la pantalla los dice. */
	alAvisos?: (avisos: readonly string[]) => void;
	/** Cuántas veces se reintenta sin red, sin respuesta, con `500` o con `503` (por omisión, 4). */
	reintentos?: number;
	/** Para las pruebas: otro `fetch`, otra espera y otra forma de hacer claves. */
	fetch?: typeof fetch;
	esperar?: (milisegundos: number) => Promise<void>;
	nuevaClave?: () => string;
}

/** Lo que regresa `POST /v1/archivos/subida`: el archivo y su dirección firmada, con los encabezados que pide. */
const subidaFirmada = z.object({
	resultado: z.object({
		archivo_id: z.string(),
		url_subida: z.string(),
		encabezados: z.record(z.string(), z.string()),
	}),
});

/** Los avisos de la respuesta de una acción. */
const avisosDe = z.object({ avisos: z.array(z.string()) });

/** Los contratos que conoce un cliente: las acciones y las consultas, por nombre. */
export interface ContratosDelCliente {
	acciones: Record<string, ContratoDeAccion>;
	consultas: Record<string, ContratoDeConsulta>;
}

/** Lo que regresa una consulta: su resultado y los campos que no viajaron. */
export interface Consultado<Resultado> {
	resultado: Resultado;
	recortado: string[];
}

/** La marca de un cuerpo que no se pudo leer como JSON. */
const sinCuerpo = Symbol("sin cuerpo");

/** Dice si un estado se reintenta con la misma clave: el servidor o su balanceador no dieron respuesta útil. */
function seReintenta(estado: number): boolean {
	return estado === 500 || estado === 502 || estado === 503 || estado === 504;
}

/**
 * Arma el cliente de la API.
 * @param contratos Las acciones y las consultas que puede llamar, por su nombre.
 * @param opciones La dirección, la versión de la app y qué hacer al reautenticar y al actualizar.
 */
export function crearCliente<
	Acciones extends ContratosDelCliente["acciones"],
	Consultas extends ContratosDelCliente["consultas"],
>(contratos: { acciones: Acciones; consultas: Consultas }, opciones: OpcionesDelCliente) {
	const llamar = opciones.fetch ?? fetch;
	const esperar =
		opciones.esperar ?? ((milisegundos: number) => new Promise((listo) => setTimeout(listo, milisegundos)));
	const reintentos = opciones.reintentos ?? 4;

	/**
	 * Hace una llamada con sus reintentos y su reautenticación.
	 * @returns El cuerpo de la respuesta correcta.
	 * @throws `ErrorDeLaApi` (o `ErrorDeConflicto`) con lo que contestó la API, o `ErrorSinRed`.
	 */
	async function pedir(url: string, init: RequestInit, clave?: string): Promise<unknown> {
		let yaReautentico = false;
		for (let intento = 0; ; intento++) {
			let respuesta: Response;
			try {
				respuesta = await llamar(url, {
					...init,
					...(opciones.credenciales === undefined ? {} : { credentials: opciones.credenciales }),
					headers: { "x-app-version": opciones.versionApp, ...(opciones.encabezados?.() ?? {}), ...init.headers },
				});
			} catch {
				if (intento < reintentos) {
					await esperar(2 ** intento * 500);
					continue;
				}
				throw new ErrorSinRed(clave);
			}
			const estado = respuesta.status;
			// Un cuerpo que se corta o que no es JSON no se pudo leer: en un `2xx` o un `5xx` cuenta como falta
			// de red y se reintenta; en un `4xx` (de un proxy, por ejemplo) no, porque repetirlo da lo mismo.
			const cuerpo: unknown = await respuesta.json().catch(() => sinCuerpo);
			const correcto = estado >= 200 && estado < 300;
			if (correcto && cuerpo !== sinCuerpo) return cuerpo;
			if ((correcto || seReintenta(estado)) && intento < reintentos) {
				await esperar(2 ** intento * 500);
				continue;
			}
			const error = respuestaDeError.safeParse(cuerpo);
			if (!error.success) throw new ErrorSinRed(clave);
			if (error.data.error === "reautenticar" && !yaReautentico) {
				await opciones.alReautenticar(error.data.proposito);
				yaReautentico = true;
				continue;
			}
			if (error.data.error === "actualizar") opciones.alActualizar(error.data.version_minima);
			throw error.data.error === "conflicto_version"
				? new ErrorDeConflicto(estado, error.data, clave)
				: new ErrorDeLaApi(estado, error.data, clave);
		}
	}

	return {
		/**
		 * Manda una acción. La clave se hace una vez por llamada (por intención) y se reusa en sus reintentos.
		 * @param nombre El nombre del contrato.
		 * @param peticion Los datos y, si la acción edita, la versión que se leyó.
		 * @param clave La clave de la intención, si la pantalla ya la tiene (por ejemplo, al reintentar a mano).
		 * @returns El resultado, del tipo del contrato. Sus avisos, si trae, van a `alAvisos`.
		 */
		async accion<Nombre extends keyof Acciones & string>(
			nombre: Nombre,
			peticion: { datos: z.input<Acciones[Nombre]["entrada"]>; version?: number },
			clave: string = (opciones.nuevaClave ?? uuidv7)(),
		): Promise<z.output<Acciones[Nombre]["resultado"]>> {
			const contrato: Acciones[Nombre] | undefined = contratos.acciones[nombre];
			if (contrato === undefined) throw new Error(`no existe la acción ${nombre}`);
			const cuerpo = await pedir(
				`${opciones.urlBase}/v1/acciones/${nombre}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						clave_idempotencia: clave,
						datos: peticion.datos,
						...(peticion.version === undefined ? {} : { version: peticion.version }),
					}),
				},
				clave,
			);
			const leido =
				typeof cuerpo === "object" && cuerpo !== null && "resultado" in cuerpo ? cuerpo.resultado : undefined;
			const esquema: Acciones[Nombre]["resultado"] = contrato.resultado;
			const resultado = z.parse(esquema, leido);
			// Los avisos que no bloquean van aparte del resultado: los dice la pantalla junto a su mensaje.
			const avisos = avisosDe.safeParse(cuerpo);
			if (avisos.success && avisos.data.avisos.length > 0) opciones.alAvisos?.(avisos.data.avisos);
			return resultado;
		},

		/**
		 * Sube un archivo en los pasos de la API (docs/modulos/admin/archivos.md, regla 1): pide la dirección firmada con
		 * el propósito, el tipo, el tamaño y la suma SHA-256, y sube los bytes directo al almacén con esos encabezados.
		 * La acción que lo usa manda después el `archivo_id`.
		 * @param datos El propósito (`foto`, `comprobante`…), el módulo que lo usa y el archivo que escogió la persona.
		 * @returns El `archivo_id`.
		 * @throws `ErrorDeLaApi` si la API no lo acepta (tipo o tamaño); `ErrorSinRed` si la subida directa no llegó.
		 */
		async subirArchivo(datos: { proposito: string; modulo: string; archivo: File }): Promise<string> {
			const bytes = new Uint8Array(await datos.archivo.arrayBuffer());
			const suma = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
				byte.toString(16).padStart(2, "0"),
			).join("");
			const cuerpo = await pedir(`${opciones.urlBase}/v1/archivos/subida`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					proposito: datos.proposito,
					modulo: datos.modulo,
					nombre_original: datos.archivo.name,
					tipo_mime: datos.archivo.type,
					tamano_bytes: bytes.byteLength,
					sha256: suma,
				}),
			});
			const { resultado } = subidaFirmada.parse(cuerpo);
			// La subida va directo al almacén, sin la cookie ni los encabezados de la API.
			const subida = await llamar(resultado.url_subida, {
				method: "PUT",
				headers: resultado.encabezados,
				body: bytes,
			}).catch(() => undefined);
			if (subida?.ok !== true) throw new ErrorSinRed();
			return resultado.archivo_id;
		},

		/**
		 * Lee una consulta.
		 * @param nombre El nombre del contrato.
		 * @param parametros Los parámetros, del tipo del contrato.
		 * @returns El resultado y los campos recortados.
		 */
		async consulta<Nombre extends keyof Consultas & string>(
			nombre: Nombre,
			parametros: z.input<Consultas[Nombre]["entrada"]>,
		): Promise<Consultado<z.output<Consultas[Nombre]["resultado"]>>> {
			const contrato: Consultas[Nombre] | undefined = contratos.consultas[nombre];
			if (contrato === undefined) throw new Error(`no existe la consulta ${nombre}`);
			const busqueda = new URLSearchParams();
			for (const [llave, valor] of Object.entries(parametros)) {
				if (valor !== undefined && valor !== null) busqueda.set(llave, String(valor));
			}
			const sufijo = busqueda.size > 0 ? `?${busqueda.toString()}` : "";
			const cuerpo = await pedir(`${opciones.urlBase}/v1/consultas/${nombre}${sufijo}`, { method: "GET" });
			const leido = typeof cuerpo === "object" && cuerpo !== null ? cuerpo : {};
			const esquema: Consultas[Nombre]["resultado"] = contrato.resultado;
			return {
				resultado: z.parse(esquema, "resultado" in leido ? leido.resultado : undefined),
				recortado:
					"recortado" in leido && Array.isArray(leido.recortado)
						? leido.recortado.filter((campo): campo is string => typeof campo === "string")
						: [],
			};
		},
	};
}
