/**
 * `GET /v1/acceso/google` y su vuelta: entrar con Google y «Confirmar con Google».
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («`admin.entrar_con_google`» y «`admin.confirmar_con_google`»)
 *
 * No van por `/v1/acciones` porque son redirecciones del navegador: no traen `X-App-Version` ni sesión
 * (salvo para confirmar). La ida guarda en `ua_google`, cifrado, lo que la vuelta revisa. Cada falla de
 * la vuelta suma un intento de la IP; con `admin.intentos_entrada_max` en la ventana, responde `429`.
 *
 * - **Entrar:** busca la cuenta activa por su `google_sub`; si no la hay, por el correo entre las activas
 *   que todavía no tienen `google_sub`, y se lo pone. Sin cuenta: «Esta cuenta no tiene acceso» y la
 *   alerta. Con cuenta: abre la sesión, pone `ua_sesion` y `ua_aparato` y regresa a la web; un aparato
 *   nuevo (que no sea la primera entrada) es alerta.
 * - **Confirmar:** pide una sesión abierta; Google se abre con `login_hint` y `max_age`; la vuelta tiene
 *   que ser de la misma cuenta de Google y de hace menos de `admin.reautenticacion_minutos`, y guarda su
 *   `auth_time` en la sesión.
 */

import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { sesiones, usuarios } from "../../modulos/admin/tablas.ts";
import { crearContexto, type ServiciosDelCorredor } from "../acciones/corredor.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion } from "../base/transacciones.ts";
import { ErrorDeApi } from "../http/errores.ts";
import type { ContextoDeAccion, QuienEscribe, RegistroDeModulos } from "../modulos.ts";
import {
	cifrarEntrada,
	cookies,
	descifrarEntrada,
	type EntradaPendiente,
	hashDe,
	nuevoIdentificador,
	opcionesDeLaEntrada,
	opcionesDeLaSesion,
	opcionesDelAparato,
} from "./cookies.ts";
import type { AccesoConGoogle, CuentaQueEntro } from "./google.ts";
import { cuentaDeLaSesion } from "./identificar.ts";
import { anotarFalla, bloqueadaHasta, type LimiteDeIntentos } from "./intentos.ts";
import { abrirSesion, parametroEntero, revisarSesion } from "./sesion.ts";

/** Lo que necesita la entrada. */
export interface DependenciasDeLaEntrada {
	google: AccesoConGoogle;
	/** La llave de `ua_google` (`llaveDeLaEntrada(COOKIE_SECRETO)`). */
	llave: Buffer;
	dominioWeb: string;
	base: Base;
	registro: RegistroDeModulos;
	servicios: ServiciosDelCorredor;
	reloj: () => Temporal.Instant;
}

/** Lo que recibe la ida. */
const pedidoDeIda = z.object({
	regresar: z.string().max(500).optional(),
	proposito: z.enum(["entrar", "confirmar"]).optional(),
});

/** El nombre de la acción con que se anotan las entradas en la bitácora. */
const accionDeEntrar = "admin.entrar_con_google";

/**
 * Una ruta interna de la web, o `/` si no lo es: nunca otro sitio (`//otro.com`, `https:`…).
 * @param regresar Lo que pidió la pantalla.
 */
export function rutaInterna(regresar: string | undefined): string {
	if (regresar === undefined || !regresar.startsWith("/") || regresar.startsWith("//") || regresar.includes("\\")) {
		return "/";
	}
	return regresar;
}

/**
 * El plugin de Fastify con la ida y la vuelta de Google; el servidor ya registró `@fastify/cookie`.
 * @param dependencias Google, la llave de la cookie, la web, la base y los módulos.
 */
export function entradaConGoogle(dependencias: DependenciasDeLaEntrada): FastifyPluginAsync {
	return async (app) => registrarEntrada(app, dependencias);
}

/** Registra la ida y la vuelta de Google en el plugin. */
function registrarEntrada(app: FastifyInstance, dependencias: DependenciasDeLaEntrada): void {
	const { base, google, llave, reloj } = dependencias;

	/** La pantalla de la web a la que se regresa, con su error. */
	const enLaWeb = (ruta: string, error?: string, fragmento?: string): string => {
		const direccion = new URL(ruta, dependencias.dominioWeb);
		if (error !== undefined) direccion.searchParams.set("error", error);
		if (fragmento !== undefined) direccion.hash = fragmento;
		return direccion.toString();
	};

	/** El máximo de intentos y su ventana, de sus parámetros. */
	const limite = async (): Promise<LimiteDeIntentos> => ({
		maximo: await parametroEntero(base, "admin.intentos_entrada_max"),
		minutos: await parametroEntero(base, "admin.minutos_ventana_intentos"),
	});

	/** `429` si la IP ya se pasó de intentos. */
	const revisarIntentos = async (peticion: FastifyRequest, ahora: Temporal.Instant): Promise<void> => {
		const hasta = await bloqueadaHasta(base, `entrada:${peticion.ip}`, ahora, await limite());
		if (hasta !== undefined) throw new ErrorDeApi("demasiados_intentos", null, undefined, { reintentar_en: hasta });
	};

	/** Corre algo con el contexto de la entrada y escribe su bitácora y sus eventos. */
	const conContexto = (
		quien: QuienEscribe,
		ahora: Temporal.Instant,
		hacer: (contexto: ContextoDeAccion) => Promise<void>,
	) =>
		enTransaccion(base, async (transaccion) => {
			const { contexto, renglones, eventos } = crearContexto(
				dependencias.registro,
				transaccion,
				quien,
				accionDeEntrar,
				ahora,
				undefined,
			);
			await hacer(contexto);
			await dependencias.servicios.escribirBitacora(contexto, renglones);
			await dependencias.servicios.guardarEventos(contexto, eventos);
		});

	app.get("/v1/acceso/google", { schema: { hide: true } }, async (peticion, respuesta) => {
		const ahora = reloj();
		await revisarIntentos(peticion, ahora);
		const pedido = pedidoDeIda.safeParse(peticion.query);
		const proposito = pedido.success ? (pedido.data.proposito ?? "entrar") : "entrar";
		const regresar = rutaInterna(pedido.success ? pedido.data.regresar : undefined);
		let opciones: { correo?: string; maxAge?: number } = {};
		if (proposito === "confirmar") {
			const sesion = await revisarSesion(base, peticion.cookies[cookies.sesion], ahora);
			if (sesion === undefined) throw new ErrorDeApi("sin_sesion", "sin_sesion");
			const [cuenta] = await base
				.select({ correo: usuarios.correo })
				.from(usuarios)
				.where(eq(usuarios.id, sesion.usuarioId));
			opciones = {
				...(cuenta === undefined ? {} : { correo: cuenta.correo }),
				maxAge: (await parametroEntero(base, "admin.reautenticacion_minutos")) * 60,
			};
		}
		let ida: Awaited<ReturnType<AccesoConGoogle["ida"]>>;
		try {
			ida = await google.ida(opciones);
		} catch (error) {
			peticion.log.warn({ err: error }, "Google no respondió a la ida");
			return redirigir(
				respuesta,
				enLaWeb(proposito === "confirmar" ? "/acceso/confirmado" : "/acceso", "google_fallo"),
			);
		}
		const entrada: EntradaPendiente = { ...ida.ida, proposito, regresar, emitida: ahora.epochMilliseconds };
		respuesta.setCookie(cookies.google, cifrarEntrada(llave, entrada), opcionesDeLaEntrada);
		return redirigir(respuesta, ida.direccion.toString());
	});

	app.get("/v1/acceso/google/vuelta", { schema: { hide: true } }, async (peticion, respuesta) => {
		const ahora = reloj();
		await revisarIntentos(peticion, ahora);
		respuesta.clearCookie(cookies.google, { path: "/" });
		const entrada = descifrarEntrada(llave, peticion.cookies[cookies.google], ahora.epochMilliseconds);
		const pantalla = entrada?.proposito === "confirmar" ? "/acceso/confirmado" : "/acceso";
		const fallar = async (error: string, fragmento?: string) => {
			await anotarFalla(base, `entrada:${peticion.ip}`, ahora, await limite());
			return redirigir(respuesta, enLaWeb(pantalla, error, fragmento));
		};
		if (entrada === undefined) return fallar("google_fallo");
		const reautenticacion = await parametroEntero(base, "admin.reautenticacion_minutos");
		let cuentaDeGoogle: CuentaQueEntro;
		try {
			cuentaDeGoogle = await google.vuelta(
				busquedaDe(peticion.query),
				entrada,
				entrada.proposito === "confirmar" ? reautenticacion * 60 : undefined,
			);
		} catch (error) {
			peticion.log.warn({ err: error }, "la vuelta de Google no pasó la revisión");
			return fallar("google_fallo");
		}
		if (entrada.proposito === "confirmar") {
			const resultado = await confirmar(peticion, cuentaDeGoogle, ahora, reautenticacion);
			return resultado === "confirmado" ? redirigir(respuesta, enLaWeb(pantalla)) : fallar(resultado);
		}
		const entro = await entrar(peticion, respuesta, cuentaDeGoogle, ahora);
		if (entro === undefined) return fallar("sin_acceso", `correo=${encodeURIComponent(cuentaDeGoogle.correo)}`);
		return redirigir(respuesta, enLaWeb(entrada.regresar));
	});

	/**
	 * Confirma con Google la sesión abierta.
	 * @returns `confirmado`, o el error para la pantalla.
	 */
	async function confirmar(
		peticion: FastifyRequest,
		cuentaDeGoogle: CuentaQueEntro,
		ahora: Temporal.Instant,
		reautenticacion: number,
	): Promise<"confirmado" | "sin_sesion" | "otra_cuenta" | "google_fallo"> {
		const sesion = await revisarSesion(base, peticion.cookies[cookies.sesion], ahora);
		if (sesion === undefined) return "sin_sesion";
		const [cuenta] = await base
			.select({ googleSub: usuarios.googleSub })
			.from(usuarios)
			.where(eq(usuarios.id, sesion.usuarioId));
		if (cuenta?.googleSub !== cuentaDeGoogle.sub) return "otra_cuenta";
		if (cuentaDeGoogle.authTime === undefined) return "google_fallo";
		const pasoPorGoogle = Temporal.Instant.fromEpochMilliseconds(cuentaDeGoogle.authTime * 1000);
		if (Temporal.Instant.compare(pasoPorGoogle.add({ minutes: reautenticacion }), ahora) < 0) return "google_fallo";
		await base
			.update(sesiones)
			.set({ googleConfirmadoEn: pasoPorGoogle.toString(), actualizadoEn: ahora.toString() })
			.where(eq(sesiones.id, sesion.sesionId));
		return "confirmado";
	}

	/**
	 * Entra con la cuenta de Google: busca la cuenta, abre la sesión y pone las cookies.
	 * @returns La sesión, o `undefined` si la cuenta de Google no tiene acceso (y entonces deja la alerta).
	 */
	async function entrar(
		peticion: FastifyRequest,
		respuesta: FastifyReply,
		cuentaDeGoogle: CuentaQueEntro,
		ahora: Temporal.Instant,
	): Promise<string | undefined> {
		const ip = peticion.ip;
		const usuarioId = await buscarCuenta(cuentaDeGoogle);
		if (usuarioId === undefined) {
			await conContexto({ tipo: "sistema", trabajo: accionDeEntrar }, ahora, async (contexto) => {
				contexto.bitacora({
					tipo: "acceso",
					departamento: "admin",
					descripcion: `Intentó entrar una cuenta de Google sin acceso: ${cuentaDeGoogle.correo}`,
					correoIntento: cuentaDeGoogle.correo,
					ip,
					esAlerta: true,
				});
				contexto.guardarEvento({ tipo: "acceso.sin_acceso", datos: {}, tablas: ["bitacora"] });
			});
			return undefined;
		}
		const deAntes = peticion.cookies[cookies.aparato];
		const aparato = deAntes === undefined || deAntes === "" ? nuevoIdentificador() : deAntes;
		const identificador = nuevoIdentificador();
		const ciudad = peticion.headers["cf-ipcity"];
		const sesion = await enTransaccion(base, (transaccion) =>
			abrirSesion(
				transaccion,
				usuarioId,
				identificador,
				{
					ip,
					ciudad: typeof ciudad === "string" ? ciudad : undefined,
					agente: peticion.headers["user-agent"],
					huella: hashDe(aparato),
				},
				ahora,
			),
		);
		const quien = await cuentaDeLaSesion(base, { ...sesion, usuarioId, googleConfirmadoEn: undefined });
		if (quien === undefined) throw new Error("la cuenta que acaba de entrar ya no está activa");
		await conContexto(quien, ahora, async (contexto) => {
			contexto.bitacora({ tipo: "acceso", departamento: "admin", descripcion: "Entró al sistema", ip });
			contexto.guardarEvento({
				tipo: "sesion.abierta",
				datos: { usuario_id: usuarioId, sesion_id: sesion.sesionId },
				tablas: ["sesiones"],
			});
			if (sesion.aparatoNuevo) {
				const donde = typeof ciudad === "string" && ciudad !== "" ? `, ${ciudad}` : "";
				contexto.bitacora({
					tipo: "acceso",
					departamento: "admin",
					descripcion: `Entró desde un dispositivo nuevo: ${sesion.aparato}${donde}`,
					ip,
					esAlerta: true,
				});
				contexto.guardarEvento({
					tipo: "sesion.aparato_nuevo",
					datos: { usuario_id: usuarioId, sesion_id: sesion.sesionId },
					tablas: ["sesiones"],
				});
			}
		});
		respuesta.setCookie(cookies.sesion, identificador, opcionesDeLaSesion(new Date(sesion.venceEn.epochMilliseconds)));
		respuesta.setCookie(cookies.aparato, aparato, opcionesDelAparato);
		return sesion.sesionId;
	}

	/**
	 * La cuenta activa de una cuenta de Google: por su `google_sub`, o la primera vez por el correo (y se le
	 * pone el `google_sub`). Un correo de una cuenta que ya tiene otro `google_sub` no entra.
	 */
	async function buscarCuenta(cuentaDeGoogle: CuentaQueEntro): Promise<string | undefined> {
		return enTransaccion(base, async (transaccion) => {
			const activas = await transaccion
				.select({ id: usuarios.id, googleSub: usuarios.googleSub, correo: usuarios.correo })
				.from(usuarios)
				.where(eq(usuarios.estado, "activa"));
			const porSub = activas.find((cuenta) => cuenta.googleSub === cuentaDeGoogle.sub);
			if (porSub !== undefined) return porSub.id;
			const porCorreo = activas.find((cuenta) => cuenta.correo === cuentaDeGoogle.correo && cuenta.googleSub === null);
			if (porCorreo === undefined) return undefined;
			await transaccion.update(usuarios).set({ googleSub: cuentaDeGoogle.sub }).where(eq(usuarios.id, porCorreo.id));
			return porCorreo.id;
		});
	}
}

/**
 * Los parámetros de texto de la dirección, como los mandó Google (`code`, `state`, `iss`…).
 * @param query Lo que leyó Fastify.
 */
function busquedaDe(query: unknown): URLSearchParams {
	const busqueda = new URLSearchParams();
	if (typeof query !== "object" || query === null) return busqueda;
	for (const [nombre, valor] of Object.entries(query)) {
		if (typeof valor === "string") busqueda.set(nombre, valor);
	}
	return busqueda;
}

/** Responde con una redirección que no se guarda. */
function redirigir(respuesta: FastifyReply, direccion: string): FastifyReply {
	return respuesta.header("cache-control", "no-store").redirect(direccion, 302);
}
