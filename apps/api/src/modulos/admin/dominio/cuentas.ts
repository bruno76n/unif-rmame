/**
 * Lo que comparten las acciones de las cuentas: leer una cuenta, sus departamentos y permisos vigentes,
 * revisar que se pueda tocar y cerrar sus sesiones.
 * Fase 5 · docs/modulos/admin/cuentas.md y docs/modulos/admin/permisos.md
 *
 * El nombre de una cuenta es el de soporte o, en las demás, el de su persona; Personal llega en la fase 7 y
 * mientras se usa el correo.
 */

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { departamentos, permisosFinos, sesiones, usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Una cuenta como la leen las acciones. */
export type Cuenta = typeof usuarios.$inferSelect;

/** Por qué se cierra una sesión. */
export type MotivoDeCierre = "salio" | "inactividad" | "duracion_maxima" | "cerrada_por_otra_cuenta" | "acceso_quitado";

/**
 * Lee una cuenta.
 * @param transaccion La transacción de la acción.
 * @param usuarioId La cuenta.
 * @throws `404` si no existe.
 */
export async function leerCuenta(transaccion: Transaccion, usuarioId: string): Promise<Cuenta> {
	const [cuenta] = await transaccion.select().from(usuarios).where(eq(usuarios.id, usuarioId));
	if (cuenta === undefined) throw noExiste();
	return cuenta;
}

/**
 * Cómo se nombra una cuenta en los mensajes y la bitácora.
 * @param cuenta La cuenta.
 */
export function nombreDeCuenta(cuenta: Pick<Cuenta, "nombre" | "correo">): string {
	return cuenta.nombre ?? cuenta.correo;
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
