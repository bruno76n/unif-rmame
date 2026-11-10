/**
 * Lo que comparten las acciones de las cuentas: leer una cuenta, sus departamentos y permisos vigentes,
 * revisar que se pueda tocar, revisar la persona y el correo de una cuenta nueva, quitar el acceso y cerrar
 * sus sesiones.
 * Fase 5 · docs/modulos/admin/cuentas.md y docs/modulos/admin/permisos.md
 * Fase 7 · docs/modulos/admin/cuentas.md (la persona de la cuenta, «Acciones internas»)
 *
 * El nombre de una cuenta es el de soporte o, en las demás, el de su persona.
 */

import { and, eq, getTableColumns, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { personas } from "../../personal/tablas.ts";
import { departamentos, permisosFinos, sesiones, usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Una cuenta como la leen las acciones, con el nombre de su persona. */
export type Cuenta = typeof usuarios.$inferSelect & { nombrePersona: string | null };

/** Los estados de una cuenta viva. */
export const estadosVivos = ["solicitada", "activa"];

/** Por qué se cierra una sesión. */
export type MotivoDeCierre = "salio" | "inactividad" | "duracion_maxima" | "cerrada_por_otra_cuenta" | "acceso_quitado";

/**
 * Lee una cuenta.
 * @param transaccion La transacción de la acción.
 * @param usuarioId La cuenta.
 * @throws `404` si no existe.
 */
export async function leerCuenta(transaccion: Transaccion, usuarioId: string): Promise<Cuenta> {
	const [cuenta] = await transaccion
		.select({ ...getTableColumns(usuarios), nombrePersona: personas.nombre })
		.from(usuarios)
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(eq(usuarios.id, usuarioId));
	if (cuenta === undefined) throw noExiste();
	return cuenta;
}

/**
 * Cómo se nombra una cuenta en los mensajes y la bitácora: el nombre de soporte, el de su persona o, si no
 * lo tiene, su correo.
 * @param cuenta La cuenta.
 */
export function nombreDeCuenta(cuenta: Pick<Cuenta, "nombre" | "correo" | "nombrePersona">): string {
	return cuenta.nombre ?? cuenta.nombrePersona ?? cuenta.correo;
}

/** La persona de una cuenta, como la da Personal. */
const personaDeCuenta = z.object({
	id: z.uuid(),
	folio: z.string(),
	nombre: z.string(),
	area: z.string(),
	activa: z.boolean(),
});

/** La persona de una cuenta. */
export type PersonaDeCuenta = z.infer<typeof personaDeCuenta>;

/**
 * Lee la persona de una cuenta con la lectura de Personal (que no la deja dar de baja mientras tanto).
 * @param contexto El contexto de la acción.
 * @param personaId La persona.
 */
export async function leerPersonaDeCuenta(contexto: ContextoDeAccion, personaId: string): Promise<PersonaDeCuenta> {
	return personaDeCuenta.parse(await contexto.lectura("personal.datos_de_persona", { persona_id: personaId }));
}

/**
 * Revisa que la persona pueda tener cuenta: activa y no de tienda.
 * @param persona La persona.
 * @throws `422 persona_no_valida`.
 */
export function revisarPersonaDeCuenta(persona: PersonaDeCuenta): void {
	if (!persona.activa) throw errorDeRegla("persona_no_valida", `${persona.nombre} está dada de baja.`);
	if (persona.area === "tienda") {
		throw errorDeRegla("persona_no_valida", "Nadie de tienda entra al sistema de fábrica.");
	}
}

/**
 * Toma los candados de una cuenta nueva, en orden fijo (persona, luego correo): dos altas o solicitudes a la
 * vez para la misma persona o el mismo correo esperan una a la otra y la segunda ve la primera.
 * @param transaccion La transacción.
 * @param personaId La persona.
 * @param correo El correo.
 */
export async function tomarCandadosDeCuenta(
	transaccion: Transaccion,
	personaId: string,
	correo: string,
): Promise<void> {
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cuenta_persona:${personaId}`}))`);
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cuenta_correo:${correo}`}))`);
}

/**
 * Revisa que la persona y el correo no tengan otra cuenta viva.
 * @param transaccion La transacción.
 * @param persona La persona.
 * @param correo El correo.
 * @param menos La cuenta que no cuenta (la solicitada que se está autorizando).
 * @throws `422 persona_con_cuenta`, `422 correo_con_cuenta` o `422 correo_solicitado`.
 */
export async function revisarQueEstanLibres(
	transaccion: Transaccion,
	persona: PersonaDeCuenta,
	correo: string,
	menos?: string,
): Promise<void> {
	const otra = menos === undefined ? undefined : ne(usuarios.id, menos);
	const [conPersona] = await transaccion
		.select({ id: usuarios.id })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, persona.id), inArray(usuarios.estado, estadosVivos), otra));
	if (conPersona !== undefined) throw errorDeRegla("persona_con_cuenta", `${persona.nombre} ya tiene cuenta.`);
	const [conCorreo] = await transaccion
		.select({ estado: usuarios.estado })
		.from(usuarios)
		.where(and(eq(usuarios.correo, correo), inArray(usuarios.estado, estadosVivos), otra));
	if (conCorreo?.estado === "activa") throw errorDeRegla("correo_con_cuenta", "Ese correo ya tiene cuenta.");
	if (conCorreo !== undefined) throw errorDeRegla("correo_solicitado", "Ya hay una solicitud para ese correo.");
}

/**
 * Anula el PIN del taller de la persona que recibe cuenta de Google (regla 9).
 * @param contexto El contexto de la acción.
 * @param personaId La persona.
 * @param anuladoPor La cuenta que da el alta.
 * @returns Si tenía un PIN vivo.
 */
export async function anularPinPorCuenta(
	contexto: ContextoDeAccion,
	personaId: string,
	anuladoPor: string,
): Promise<boolean> {
	const respuesta = await contexto.interna("personal.anular_pin", {
		persona_id: personaId,
		motivo: "cuenta_google",
		anulado_por: anuladoPor,
	});
	return z.object({ anulado: z.boolean() }).parse(respuesta).anulado;
}

/**
 * Quita el acceso a una cuenta activa: queda `sin_acceso` con su baja; sus departamentos y permisos finos
 * vigentes se dan de baja y sus sesiones abiertas se cierran con `acceso_quitado`. Guarda
 * `cuenta.acceso_quitado`, que les manda `sesion_cerrada` a sus pantallas.
 * @param contexto El contexto de la acción.
 * @param cuentaId La cuenta.
 * @param baja Quién (nulo si es el sistema), el motivo y su «Confirmar con Google» (la baja de una persona
 * no lo pide).
 * @returns Las sesiones que cerró.
 */
export async function quitarElAcceso(
	contexto: ContextoDeAccion,
	cuentaId: string,
	baja: { por: string | null; motivo: string | null; confirmado: string | null },
): Promise<string[]> {
	const { transaccion } = contexto;
	const ahora = contexto.ahora.toString();
	await transaccion
		.update(usuarios)
		.set({
			estado: "sin_acceso",
			bajaEn: ahora,
			bajaPor: baja.por,
			motivoBaja: baja.motivo,
			bajaConfirmadoConGoogleEn: baja.confirmado,
		})
		.where(eq(usuarios.id, cuentaId));
	const deLoQueTenia = { bajaEn: ahora, bajaPor: baja.por, motivoBaja: "Se le quitó el acceso" };
	await transaccion
		.update(usuarioDepartamentos)
		.set(deLoQueTenia)
		.where(and(eq(usuarioDepartamentos.usuarioId, cuentaId), isNull(usuarioDepartamentos.bajaEn)));
	await transaccion
		.update(permisosFinos)
		.set(deLoQueTenia)
		.where(and(eq(permisosFinos.usuarioId, cuentaId), isNull(permisosFinos.bajaEn)));
	const cerradas = await cerrarSesionesDe(transaccion, cuentaId, {
		motivo: "acceso_quitado",
		cerradaPor: baja.por,
		ahora,
	});
	contexto.guardarEvento({
		tipo: "cuenta.acceso_quitado",
		datos: { usuario_id: cuentaId },
		tablas: ["usuarios", "usuario_departamentos", "permisos_finos", "sesiones"],
		entidad: "usuarios",
		entidadId: cuentaId,
	});
	return cerradas;
}

/**
 * Revisa que la dueña pueda cambiarle algo a una cuenta: que no sea la suya y que siga activa.
 * @param cuenta La cuenta.
 * @param mensajeDeLaDuena El mensaje de `es_la_duena` de cada acción.
 * @throws `422 es_la_duena` o `422 cuenta_no_activa`.
 */
export function revisarQueSePuedeCambiar(cuenta: Cuenta, mensajeDeLaDuena: string): void {
	if (cuenta.esDuena) throw errorDeRegla("es_la_duena", mensajeDeLaDuena);
	if (cuenta.estado !== "activa") {
		throw errorDeRegla("cuenta_no_activa", `${nombreDeCuenta(cuenta)} ya no tiene acceso.`);
	}
}

/**
 * El momento de «Confirmar con Google» de quien llama, para guardarlo con lo que hizo.
 * @param contexto El contexto de la acción.
 * @throws Error del programa si la acción no lo pidió: el corredor ya lo revisó.
 */
export function confirmadoConGoogle(contexto: ContextoDeAccion): string {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta" || quien.confirmadoConGoogleEn === undefined) {
		throw new Error(`${contexto.accion} pide «Confirmar con Google» y no llegó`);
	}
	return quien.confirmadoConGoogleEn.toString();
}

/**
 * La cuenta que hace la acción.
 * @param contexto El contexto de la acción.
 * @throws `403` si no la llama una cuenta: el corredor ya lo revisó.
 */
export function cuentaQueLlama(contexto: ContextoDeAccion): string {
	if (contexto.quien.tipo !== "cuenta") throw new ErrorDeApi("sin_permiso", "solo_duena");
	return contexto.quien.usuarioId;
}

/**
 * Los departamentos vigentes de una cuenta, con el renglón de cada uno.
 * @param transaccion La transacción.
 * @param usuarioId La cuenta.
 */
export async function departamentosVigentes(
	transaccion: Base | Transaccion,
	usuarioId: string,
): Promise<{ id: string; clave: string; ubicacionId: string | null }[]> {
	return transaccion
		.select({ id: usuarioDepartamentos.id, clave: departamentos.clave, ubicacionId: usuarioDepartamentos.ubicacionId })
		.from(usuarioDepartamentos)
		.innerJoin(departamentos, eq(departamentos.id, usuarioDepartamentos.departamentoId))
		.where(and(eq(usuarioDepartamentos.usuarioId, usuarioId), isNull(usuarioDepartamentos.bajaEn)))
		.orderBy(departamentos.orden);
}

/**
 * Los permisos finos vigentes de una cuenta.
 * @param transaccion La transacción.
 * @param usuarioId La cuenta.
 */
export async function permisosFinosVigentes(
	transaccion: Base | Transaccion,
	usuarioId: string,
): Promise<{ id: string; permiso: string }[]> {
	return transaccion
		.select({ id: permisosFinos.id, permiso: permisosFinos.permiso })
		.from(permisosFinos)
		.where(and(eq(permisosFinos.usuarioId, usuarioId), isNull(permisosFinos.bajaEn)));
}

/**
 * Los departamentos por su clave, con lo que hace falta para darlos.
 * @param transaccion La transacción.
 * @param claves Las claves.
 */
export async function departamentosPorClave(
	transaccion: Transaccion,
	claves: readonly string[],
): Promise<Map<string, { id: string; nombre: string; asignableEnAlta: boolean }>> {
	if (claves.length === 0) return new Map();
	const renglones = await transaccion
		.select({
			id: departamentos.id,
			clave: departamentos.clave,
			nombre: departamentos.nombre,
			asignableEnAlta: departamentos.asignableEnAlta,
		})
		.from(departamentos)
		.where(inArray(departamentos.clave, [...claves]));
	return new Map(renglones.map(({ clave, ...depto }) => [clave, depto]));
}

/**
 * Guarda `sesion.cerrada` con las sesiones que se cerraron, para que les llegue `sesion_cerrada`.
 * @param contexto El contexto de la acción.
 * @param usuarioId La cuenta de las sesiones.
 * @param cerradas Los ids de las sesiones.
 * @param motivo Por qué se cerraron.
 */
export function avisarSesionesCerradas(
	contexto: ContextoDeAccion,
	usuarioId: string,
	cerradas: readonly string[],
	motivo: MotivoDeCierre,
): void {
	if (cerradas.length === 0) return;
	contexto.guardarEvento({
		tipo: "sesion.cerrada",
		datos: { usuario_id: usuarioId, sesion_ids: cerradas.join(","), motivo },
		tablas: ["sesiones"],
		entidad: "usuarios",
		entidadId: usuarioId,
	});
}

/**
 * Revisa que ningún departamento sea la Puerta del taller, que se entra con PIN.
 * @param deptos Los departamentos que se dan.
 * @throws `422 departamento_no_asignable`.
 */
export function revisarAsignables(deptos: Iterable<{ asignableEnAlta: boolean }>): void {
	for (const depto of deptos) {
		if (!depto.asignableEnAlta) throw errorDeRegla("departamento_no_asignable", "La Puerta del taller entra con PIN.");
	}
}

/**
 * Cierra las sesiones abiertas de una cuenta: todas, solo una (`solo`) o todas menos una (`menos`).
 * @param transaccion La transacción.
 * @param usuarioId La cuenta.
 * @param cierre El motivo, quién la cierra (nulo si es el sistema), la hora y cuáles.
 * @returns Los ids de las sesiones que cerró.
 */
export async function cerrarSesionesDe(
	transaccion: Transaccion,
	usuarioId: string,
	cierre: { motivo: MotivoDeCierre; cerradaPor: string | null; ahora: string; solo?: string; menos?: string },
): Promise<string[]> {
	const cerradas = await transaccion
		.update(sesiones)
		.set({
			cerradaEn: cierre.ahora,
			cerradaPor: cierre.cerradaPor,
			motivoCierre: cierre.motivo,
			actualizadoEn: sql`now()`,
		})
		.where(
			and(
				eq(sesiones.usuarioId, usuarioId),
				isNull(sesiones.cerradaEn),
				cierre.solo === undefined ? undefined : eq(sesiones.id, cierre.solo),
				cierre.menos === undefined ? undefined : ne(sesiones.id, cierre.menos),
			),
		)
		.returning({ id: sesiones.id });
	return cerradas.map((sesion) => sesion.id);
}
