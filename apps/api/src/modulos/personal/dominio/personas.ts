/**
 * Lo que comparten las acciones de las personas: leerlas, revisar su ficha y el permiso del pago por día.
 * Fase 7 · docs/modulos/personal/personas.md (reglas 3 a 5)
 */

import type { darAltaPersona } from "@uniformame/compartido/contratos/personal/personas";
import { and, eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeCampo, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { personas } from "../tablas.ts";

/** Una persona como la leen las acciones. */
export type Persona = typeof personas.$inferSelect;

/** El permiso fino que deja ver y cambiar el pago por día. */
export const permisoDeSueldos = "ven_sueldos_y_tarifas";

/** El mensaje de quien manda o cambia un sueldo sin el permiso. */
const sinPermisoDeSueldos = "Esta cuenta no puede poner sueldos. Lo decide la dueña en Administración del sistema.";

/**
 * Dice si quien llama ve y cambia sueldos: la dueña o quien tiene «ven sueldos y tarifas» (nunca soporte).
 * @param contexto El contexto de la acción.
 */
export function veSueldos(contexto: Pick<ContextoDeAccion, "quien">): boolean {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta" || quien.esSoporte) return false;
	return quien.esDuena || quien.permisosFinos.includes(permisoDeSueldos);
}

/**
 * Pide el permiso de sueldos.
 * @throws `403 sin_permiso_fino`.
 */
export function pedirPermisoDeSueldos(contexto: Pick<ContextoDeAccion, "quien">): void {
	if (!veSueldos(contexto)) throw new ErrorDeApi("sin_permiso", "sin_permiso_fino", sinPermisoDeSueldos);
}

/**
 * Lee una persona y la bloquea.
 * @param transaccion La transacción de la acción.
 * @param id La persona.
 * @throws `404` si no existe.
 */
export async function leerPersona(transaccion: Transaccion, id: string): Promise<Persona> {
	const [persona] = await transaccion.select().from(personas).where(eq(personas.id, id)).for("update");
	if (persona === undefined) throw noExiste();
	return persona;
}

/** La ficha que llega en el alta o al guardar. */
export type Ficha = z.infer<typeof darAltaPersona.entrada>;

/**
 * Revisa la ficha (lo que el contrato no ve solo): la tienda y su rol, el pago por día según la forma de
 * pago, y la fecha de ingreso no futura.
 * @param contexto El contexto de la acción, por su día de negocio.
 * @param ficha La ficha.
 * @param pagoDia El pago por día que quedará (el que llegó, o el que ya tenía si no se puede cambiar).
 * @throws `400` en el campo.
 */
export async function revisarFicha(contexto: ContextoDeAccion, ficha: Ficha, pagoDia: number | null): Promise<void> {
	if (ficha.area === "tienda") {
		if (ficha.ubicacion_id === undefined) throw errorDeCampo("ubicacion_id", "Escoge la tienda.");
		const [tienda] = await contexto.transaccion
			.select({ id: ubicaciones.id })
			.from(ubicaciones)
			.where(and(eq(ubicaciones.id, ficha.ubicacion_id), eq(ubicaciones.tipo, "tienda")));
		if (tienda === undefined) throw errorDeCampo("ubicacion_id", "Escoge la tienda.");
		if (ficha.rol_tienda === undefined) throw errorDeCampo("rol_tienda", "Escoge si es cajera o encargada.");
	}
	if (ficha.forma_pago === "pieza" && ficha.pago_dia_centavos !== undefined) {
		throw errorDeCampo("pago_dia_centavos", "Por pieza no lleva pago por día");
	}
	if (ficha.forma_pago !== "pieza" && pagoDia === null) throw errorDeCampo("pago_dia_centavos", "Pesos por día");
	if (Temporal.PlainDate.compare(Temporal.PlainDate.from(ficha.fecha_ingreso), contexto.diaDeNegocio) > 0) {
		throw errorDeCampo("fecha_ingreso", "La fecha de ingreso no puede ser después de hoy.");
	}
}

/**
 * Las columnas de la ficha para guardar: fuera de una tienda, sin tienda ni rol.
 * @param ficha La ficha.
 * @param pagoDia El pago por día que queda.
 */
export function columnasDeLaFicha(ficha: Ficha, pagoDia: number | null) {
	const enTienda = ficha.area === "tienda";
	return {
		nombre: ficha.nombre,
		area: ficha.area,
		ubicacionId: enTienda ? (ficha.ubicacion_id ?? null) : null,
		rolTienda: enTienda ? (ficha.rol_tienda ?? null) : null,
		puesto: ficha.puesto,
		formaPago: ficha.forma_pago,
		pagoDiaCentavos: ficha.forma_pago === "pieza" ? null : pagoDia,
		fechaIngreso: ficha.fecha_ingreso,
	};
}

/**
 * La ficha como va en la bitácora: con el pago por día si lo tiene (que la marca como sueldo); quien cobra por
 * pieza no lo lleva, y su renglón no queda como sueldo.
 * @param persona La persona guardada.
 */
export function fichaParaBitacora(persona: Persona) {
	return {
		folio: persona.folio,
		nombre: persona.nombre,
		area: persona.area,
		ubicacion_id: persona.ubicacionId,
		rol_tienda: persona.rolTienda,
		puesto: persona.puesto,
		forma_pago: persona.formaPago,
		...(persona.pagoDiaCentavos === null ? {} : { pago_dia_centavos: persona.pagoDiaCentavos }),
		fecha_ingreso: persona.fechaIngreso,
	};
}

/**
 * Dice si la persona tiene una cuenta de Google viva (activa o solicitada).
 * @param transaccion La transacción.
 * @param personaId La persona.
 */
export async function tieneCuenta(transaccion: Transaccion, personaId: string): Promise<boolean> {
	const vivas = await transaccion
		.select({ id: usuarios.id })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, personaId), inArray(usuarios.estado, ["activa", "solicitada"])));
	return vivas.length > 0;
}

/**
 * Dice si la persona es la de la dueña.
 * @param transaccion La transacción.
 * @param personaId La persona.
 */
export async function esDeLaDuena(transaccion: Transaccion, personaId: string): Promise<boolean> {
	const duena = await transaccion
		.select({ id: usuarios.id })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, personaId), eq(usuarios.esDuena, true)));
	return duena.length > 0;
}
