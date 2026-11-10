/**
 * `admin.canjear_codigo` · `POST /v1/dispositivos/canjear`: el aparato nuevo canjea el código que le dio
 * la dueña y queda registrado con su propia llave.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.canjear_codigo`»)
 *
 * No va por `/v1/acciones`: no hay sesión ni llave, el código es la credencial. Lleva su clave de
 * idempotencia como una acción: el reintento con la misma clave y los mismos datos contesta lo mismo (la
 * respuesta nunca lleva el secreto: lo hizo el aparato), y con otros datos, `clave_usada`. Un código que no
 * existe o venció responde lo mismo (`codigo_no_valido`) y suma un intento de la IP; con
 * `admin.intentos_codigo_max` en la ventana, `429`. Los canjes de una IP van uno tras otro (un candado por
 * IP), así que una ráfaga a la vez no se brinca el `429`. Todo pasa en una transacción con el código
 * bloqueado: dos canjes a la vez dejan un solo aparato.
 */

import { cuerpoDelCanje, salidaDelCanje } from "@uniformame/compartido/contratos/admin/dispositivos";
import { type App, compararVersiones, versionMinima } from "@uniformame/compartido/contratos/versiones";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";
import { hashDe } from "../../../nucleo/acceso/cookies.ts";
import { anotarFalla, bloqueadaHasta, type LimiteDeIntentos } from "../../../nucleo/acceso/intentos.ts";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { crearContexto, type ServiciosDelCorredor } from "../../../nucleo/acciones/corredor.ts";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { enTransaccion, type Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { huellaDeCarga } from "../../../nucleo/idempotencia/claves.ts";
import type { RegistroDeModulos } from "../../../nucleo/modulos.ts";
import { codigoNormal, nombreDelTipo, nuevaLlaveId } from "../dominio/dispositivos.ts";
import { codigosRegistro, comandosRecibidos, dispositivos, dispositivosSync } from "../tablas.ts";

/** El nombre de la acción, en la bitácora y en `comandos_recibidos`. */
const accionDelCanje = "admin.canjear_codigo";

/** La app de cada tipo de aparato, para su versión mínima. */
const appDelTipo: Readonly<Record<string, App>> = {
	tablet_taller: "tablet",
	puente_impresion: "puente",
	telefono_escanear: "web",
};

/** Lo que necesita el canje. */
export interface DependenciasDelCanje {
	base: Base;
	registro: RegistroDeModulos;
	servicios: ServiciosDelCorredor;
	reloj: () => Temporal.Instant;
	/** La versión mínima del parámetro de la dueña para una app. */
	versionMinimaDelParametro: (app: App) => Promise<string>;
}

/** La respuesta del canje, como la de una acción. */
type RespuestaDelCanje = { ok: true; resultado: z.infer<typeof salidaDelCanje>; avisos: string[] };

/**
 * El plugin de Fastify con la ruta del canje.
 * @param dependencias La base, los módulos, la bitácora y los eventos, la hora y la versión mínima.
 */
export function canjeDeCodigo(dependencias: DependenciasDelCanje): FastifyPluginAsync {
	return async (app) => registrarCanje(app, dependencias);
}

/** Registra la ruta del canje en el plugin. */
function registrarCanje(app: FastifyInstance, dependencias: DependenciasDelCanje): void {
	const { base } = dependencias;

	/** El máximo de códigos equivocados y su ventana, de sus parámetros. */
	const limite = async (): Promise<LimiteDeIntentos> => ({
		maximo: await parametroEntero(base, "admin.intentos_codigo_max"),
		minutos: await parametroEntero(base, "admin.minutos_ventana_intentos"),
	});

	app.post("/v1/dispositivos/canjear", { schema: { hide: true } }, async (peticion, respuesta) => {
		const ahora = dependencias.reloj();
		const clave = `codigo:${peticion.ip}`;
		const hasta = await bloqueadaHasta(base, clave, ahora, await limite());
		if (hasta !== undefined) throw new ErrorDeApi("demasiados_intentos", null, undefined, { reintentar_en: hasta });
		const leido = cuerpoDelCanje.safeParse(peticion.body);
		if (!leido.success) {
			const campos = Object.fromEntries(
				leido.error.issues.map((problema) => [
					problema.path.filter((paso) => paso !== "datos").join("."),
					problema.message,
				]),
			);
			throw new ErrorDeApi("validacion", null, undefined, { campos });
		}
		const { clave_idempotencia: claveIdempotencia, datos } = leido.data;
		// Su versión mínima, como cualquier llamada de esa app.
		const app = appDelTipo[datos.tipo] ?? "web";
		const minima = versionMinima(app, await dependencias.versionMinimaDelParametro(app));
		const version = peticion.headers["x-app-version"];
		if (typeof version !== "string" || (compararVersiones(version, minima) ?? -1) < 0) {
			throw new ErrorDeApi("actualizar", null, undefined, { version_minima: minima });
		}
		respuesta.header("cache-control", "no-store");
		const tope = await limite();
		const canje = await enTransaccion(base, async (transaccion) => {
			// Los canjes de una misma IP van uno tras otro: el bloqueo se revisa y la falla se cuenta con el
			// candado puesto, así que una ráfaga de códigos a la vez no pasa entera antes de que cuente la primera.
			await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`);
			const bloqueada = await bloqueadaHasta(transaccion, clave, ahora, tope);
			if (bloqueada !== undefined) return { bloqueada };
			try {
				const pedido = { claveIdempotencia, datos, ip: peticion.ip, ahora };
				return { respuesta: await enTransaccion(transaccion, (punto) => canjear(punto, pedido)) };
			} catch (error) {
				if (!(error instanceof ErrorDeApi && error.codigo === "codigo_no_valido")) throw error;
				// La falla se cuenta en la misma transacción; el canje que falló ya se deshizo en su `SAVEPOINT`.
				await anotarFalla(transaccion, clave, ahora, tope);
				return { falla: error };
			}
		});
		if ("bloqueada" in canje) {
			throw new ErrorDeApi("demasiados_intentos", null, undefined, { reintentar_en: canje.bloqueada });
		}
		if ("falla" in canje) throw canje.falla;
		return canje.respuesta;
	});

	/**
	 * Canjea el código dentro de su transacción.
	 * @returns La respuesta, nueva o la guardada del primer canje con esa clave.
	 */
	async function canjear(
		transaccion: Transaccion,
		pedido: {
			claveIdempotencia: string;
			datos: z.infer<typeof cuerpoDelCanje>["datos"];
			ip: string;
			ahora: Temporal.Instant;
		},
	): Promise<unknown> {
		const { datos, ahora } = pedido;
		const cargaHash = huellaDeCarga(accionDelCanje, datos, undefined);
		const repetido = await respuestaGuardada(transaccion, pedido.claveIdempotencia, cargaHash);
		if (repetido !== undefined) return repetido;
		const [codigo] = await transaccion
			.select()
			.from(codigosRegistro)
			.where(
				and(eq(codigosRegistro.codigoHash, hashDe(codigoNormal(datos.codigo))), eq(codigosRegistro.estado, "vigente")),
			)
			.for("update");
		if (codigo === undefined || Temporal.Instant.compare(Temporal.Instant.from(codigo.venceEn), ahora) <= 0) {
			// Otro canje con esta misma clave pudo terminar mientras se esperaba el candado.
			const otroCanje = await respuestaGuardada(transaccion, pedido.claveIdempotencia, cargaHash);
			if (otroCanje !== undefined) return otroCanje;
			throw errorDeRegla("codigo_no_valido", "Ese código no existe o ya venció. Pide otro a la dueña.");
		}
		if (codigo.tipo !== datos.tipo) {
			throw errorDeRegla(
				"tipo_no_coincide",
				`Este código es para ${nombreDelTipo[codigo.tipo] ?? codigo.tipo}: escríbelo en ese aparato.`,
			);
		}
		const quien = {
			tipo: "sistema",
			trabajo: accionDelCanje,
			...(codigo.creadoPor === null ? {} : { aNombreDe: codigo.creadoPor }),
		} as const;
		const { contexto, renglones, eventos } = crearContexto(
			dependencias.registro,
			transaccion,
			quien,
			accionDelCanje,
			ahora,
			undefined,
		);
		const tomado = await contexto.interna("admin.tomar_folio", { tipo: "dispositivo" });
		const folio = typeof tomado === "object" && tomado !== null && "folio" in tomado ? String(tomado.folio) : "";
		const dispositivoId = uuidv7();
		const llaveId = nuevaLlaveId();
		await transaccion.insert(dispositivos).values({
			id: dispositivoId,
			folio,
			nombre: codigo.nombre,
			tipo: codigo.tipo,
			ubicacionId: codigo.ubicacionId,
			llaveId,
			llaveHash: hashDe(datos.secreto),
			codigoRegistroId: codigo.id,
			creadoPor: codigo.creadoPor,
		});
		await transaccion.insert(dispositivosSync).values({
			id: uuidv7(),
			dispositivoId,
			ultimoContactoEn: ahora.toString(),
			versionApp: datos.version_app,
			ip: pedido.ip,
		});
		await transaccion
			.update(codigosRegistro)
			.set({ estado: "canjeado", canjeadoEn: ahora.toString(), canjeIp: pedido.ip, dispositivoId })
			.where(eq(codigosRegistro.id, codigo.id));
		const respuesta: RespuestaDelCanje = {
			ok: true,
			resultado: salidaDelCanje.parse({
				dispositivo_id: dispositivoId,
				folio,
				tipo: codigo.tipo,
				ubicacion_id: codigo.ubicacionId,
				prefijo_folio: null,
				llave_id: llaveId,
				intervalo_segundos: await parametroEntero(transaccion, "sync.intervalo_segundos"),
				mensaje: `${codigo.nombre} registrado con su propia llave`,
			}),
			avisos: [],
		};
		await transaccion.insert(comandosRecibidos).values({
			id: uuidv7(),
			claveIdempotencia: pedido.claveIdempotencia,
			origen: "aparato",
			dispositivoId,
			tipoComando: accionDelCanje,
			ocurridoEn: ahora.toString(),
			cargaHash,
			resultado: "aplicado",
			respuesta,
			entidad: "dispositivos",
			entidadId: dispositivoId,
		});
		contexto.bitacora({
			descripcion: `Registró el dispositivo ${codigo.nombre}`,
			entidad: "dispositivos",
			entidadId: dispositivoId,
			entidadFolio: folio,
			despues: { folio, tipo: codigo.tipo, ubicacion_id: codigo.ubicacionId, prefijo_folio: null, llave_id: llaveId },
		});
		contexto.guardarEvento({
			tipo: "dispositivo.registrado",
			datos: { dispositivo_id: dispositivoId, codigo_registro_id: codigo.id, usuario_id: codigo.creadoPor },
			tablas: ["dispositivos"],
			entidad: "dispositivos",
			entidadId: dispositivoId,
			entidadFolio: folio,
		});
		await dependencias.servicios.escribirBitacora(contexto, renglones);
		await dependencias.servicios.guardarEventos(contexto, eventos);
		return respuesta;
	}
}

/**
 * La respuesta guardada de un canje con esa clave.
 * @returns La respuesta si ya llegó con los mismos datos; `undefined` si es nueva.
 * @throws `422 clave_usada` si llegó con otros datos.
 */
async function respuestaGuardada(transaccion: Transaccion, clave: string, cargaHash: string): Promise<unknown> {
	const [anterior] = await transaccion
		.select({ cargaHash: comandosRecibidos.cargaHash, respuesta: comandosRecibidos.respuesta })
		.from(comandosRecibidos)
		.where(eq(comandosRecibidos.claveIdempotencia, clave));
	if (anterior === undefined) return undefined;
	if (anterior.cargaHash !== cargaHash) {
		throw errorDeRegla("clave_usada", "Esa operación ya se mandó con otros datos. Recarga la pantalla.");
	}
	return anterior.respuesta;
}
