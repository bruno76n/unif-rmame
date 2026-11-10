/**
 * Las sesiones de la web: abrir una al entrar con Google y revisarla en cada llamada.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («Cómo se revisa la sesión en cada llamada» y «La tabla `sesiones`»)
 *
 * La cookie lleva el identificador; la base, solo su hash. En cada llamada se revisa, en este orden, que
 * no esté cerrada, que no haya vencido (`duracion_maxima`), que tenga actividad reciente (`inactividad`) y
 * que la cuenta siga activa (`acceso_quitado`); si algo falla, la sesión queda cerrada con ese motivo y la
 * llamada no pasa. `ultima_actividad_en` se escribe a lo más una vez por minuto.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { sesiones, usuarios } from "../../modulos/admin/tablas.ts";
import type { Base } from "../base/conexion.ts";
import type { Transaccion } from "../base/transacciones.ts";
import { leerParametro } from "../parametros.ts";
import { hashDe } from "./cookies.ts";

/** Una sesión abierta que pasó la revisión. */
export interface SesionValida {
	sesionId: string;
	usuarioId: string;
	/** La última vez que la sesión confirmó con Google. */
	googleConfirmadoEn: Temporal.Instant | undefined;
}

/** Cada cuánto se escribe la última actividad: a lo más una vez por minuto. */
const segundosEntreActividades = 60;

/**
 * Lee un parámetro entero.
 * @param base La base o la transacción.
 * @param clave La clave del parámetro.
 */
export async function parametroEntero(base: Base | Transaccion, clave: string): Promise<number> {
	return Number(await leerParametro(base, { clave }));
}

/**
 * Revisa la sesión de una cookie.
 * @param base La base.
 * @param identificador Lo que trae `ua_sesion`.
 * @param ahora La hora de la llamada.
 * @returns La sesión, o `undefined` si no hay o no pasó (y entonces queda cerrada con su motivo).
 */
export async function revisarSesion(
	base: Base,
	identificador: string | undefined,
	ahora: Temporal.Instant,
): Promise<SesionValida | undefined> {
	if (identificador === undefined || identificador === "") return undefined;
	const [sesion] = await base
		.select({
			id: sesiones.id,
			usuarioId: sesiones.usuarioId,
			ultimaActividadEn: sesiones.ultimaActividadEn,
			venceEn: sesiones.venceEn,
			googleConfirmadoEn: sesiones.googleConfirmadoEn,
			cerradaEn: sesiones.cerradaEn,
			estado: usuarios.estado,
		})
		.from(sesiones)
		.innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
		.where(eq(sesiones.tokenHash, hashDe(identificador)));
	if (sesion === undefined || sesion.cerradaEn !== null) return undefined;
	const inactividad = await parametroEntero(base, "admin.sesion_inactividad_min");
	const motivo =
		Temporal.Instant.compare(ahora, Temporal.Instant.from(sesion.venceEn)) >= 0
			? "duracion_maxima"
			: Temporal.Instant.compare(
						ahora,
						Temporal.Instant.from(sesion.ultimaActividadEn).add({ minutes: inactividad }),
					) >= 0
				? "inactividad"
				: sesion.estado !== "activa"
					? "acceso_quitado"
					: undefined;
	if (motivo !== undefined) {
		await cerrarSesion(base, sesion.id, motivo, ahora);
		return undefined;
	}
	const ultima = Temporal.Instant.from(sesion.ultimaActividadEn);
	if (ultima.until(ahora).total("seconds") >= segundosEntreActividades) {
		await base
			.update(sesiones)
			.set({ ultimaActividadEn: ahora.toString(), actualizadoEn: sql`now()` })
			.where(and(eq(sesiones.id, sesion.id), isNull(sesiones.cerradaEn)));
	}
	return {
		sesionId: sesion.id,
		usuarioId: sesion.usuarioId,
		googleConfirmadoEn:
			sesion.googleConfirmadoEn === null ? undefined : Temporal.Instant.from(sesion.googleConfirmadoEn),
	};
}

/** Cierra una sesión por el sistema, si sigue abierta. */
async function cerrarSesion(
	base: Base,
	sesionId: string,
	motivo: "duracion_maxima" | "inactividad" | "acceso_quitado",
	ahora: Temporal.Instant,
): Promise<void> {
	await base
		.update(sesiones)
		.set({ cerradaEn: ahora.toString(), motivoCierre: motivo, actualizadoEn: sql`now()` })
		.where(and(eq(sesiones.id, sesionId), isNull(sesiones.cerradaEn)));
}

/** Lo que se sabe del navegador que entra. */
export interface NavegadorQueEntra {
	ip: string | undefined;
	ciudad: string | undefined;
	agente: string | undefined;
	/** El hash de `ua_aparato`. */
	huella: string;
}

/**
 * Abre una sesión: guarda el hash del identificador y dice si el aparato es nuevo para esa cuenta.
 * @param transaccion La transacción de la entrada.
 * @param usuarioId La cuenta.
 * @param identificador Lo que llevará `ua_sesion`.
 * @param navegador De dónde entra.
 * @param ahora La hora de la entrada.
 * @returns La sesión, cuándo vence, si es la primera entrada de la cuenta y si el aparato es nuevo.
 */
export async function abrirSesion(
	transaccion: Transaccion,
	usuarioId: string,
	identificador: string,
	navegador: NavegadorQueEntra,
	ahora: Temporal.Instant,
): Promise<{ sesionId: string; venceEn: Temporal.Instant; primera: boolean; aparatoNuevo: boolean; aparato: string }> {
	const [antes] = await transaccion
		.select({
			total: sql<number>`count(*)::int`,
			conEsteAparato: sql<number>`count(*) FILTER (WHERE ${sesiones.huellaAparato} = ${navegador.huella})::int`,
		})
		.from(sesiones)
		.where(eq(sesiones.usuarioId, usuarioId));
	const primera = (antes?.total ?? 0) === 0;
	const aparatoNuevo = !primera && (antes?.conEsteAparato ?? 0) === 0;
	const horas = await parametroEntero(transaccion, "admin.sesion_duracion_max_h");
	const venceEn = ahora.add({ hours: horas });
	const sesionId = uuidv7();
	const aparato = describirAparato(navegador.agente);
	await transaccion.insert(sesiones).values({
		id: sesionId,
		usuarioId,
		tokenHash: hashDe(identificador),
		ultimaActividadEn: ahora.toString(),
		venceEn: venceEn.toString(),
		ip: navegador.ip ?? null,
		ciudadAproximada: navegador.ciudad ?? null,
		agente: navegador.agente ?? null,
		aparato,
		huellaAparato: navegador.huella,
		esAparatoNuevo: aparatoNuevo,
	});
	return { sesionId, venceEn, primera, aparatoNuevo, aparato };
}

/** Los equipos que se reconocen en el agente del navegador, en orden. */
const equipos: readonly [string, RegExp][] = [
	["iPhone", /iPhone/],
	["iPad", /iPad/],
	["Android", /Android/],
	["Windows", /Windows/],
	["Mac", /Macintosh|Mac OS/],
	["Linux", /Linux/],
];

/** Los navegadores que se reconocen, en orden: Edge y Chrome también dicen «Safari». */
const navegadores: readonly [string, RegExp][] = [
	["Edge", /Edg\//],
	["Firefox", /Firefox\//],
	["Chrome", /Chrome\/|CriOS\//],
	["Safari", /Safari\//],
];

/**
 * El aparato en corto, del agente del navegador: «iPhone · Safari».
 * @param agente El encabezado `User-Agent`.
 */
export function describirAparato(agente: string | undefined): string {
	const texto = agente ?? "";
	const equipo = equipos.find(([, patron]) => patron.test(texto))?.[0] ?? "Otro aparato";
	const navegador = navegadores.find(([, patron]) => patron.test(texto))?.[0] ?? "otro navegador";
	return `${equipo} · ${navegador}`;
}
