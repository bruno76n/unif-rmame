/**
 * Correr las acciones del sistema desde una carga de la muestra: como una cuenta de la muestra, en una sesión que
 * nadie tiene y que se cierra al terminar.
 * Fase 8 · docs/cimientos/BASE-DE-DATOS.md («Siembra del sistema y datos de la muestra»); desde la fase 10 la usan
 * también Compras y Patronaje.
 */

import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { sesiones } from "../src/modulos/admin/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import { correrAccion, escribirBitacoraConAdmin, guardarEventosConAdmin } from "../src/nucleo/acciones/corredor.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import type { RegistroDeModulos } from "../src/nucleo/modulos.ts";

/** Corre una acción con sus datos y, si edita, su versión; regresa su resultado. */
export type Hacer = (nombre: string, datos: unknown, version?: number) => Promise<Record<string, unknown>>;

/**
 * Corre lo que hace una carga en una sesión de `quien` que nadie tiene: la abre antes y la cierra al terminar,
 * aunque algo falle.
 * @param base La base, con el rol dueño.
 * @param registro Lo que registraron los módulos.
 * @param quien La cuenta de la muestra, con la sesión de la carga.
 * @param cargar Lo que hace la carga, con la función que corre las acciones.
 */
export async function enSesionDeCarga(
	base: Base,
	registro: RegistroDeModulos,
	quien: CuentaQueLlama,
	cargar: (hacer: Hacer) => Promise<void>,
): Promise<void> {
	const ahora = Temporal.Now.instant().toString();
	await base.insert(sesiones).values({
		id: quien.sesionId,
		usuarioId: quien.usuarioId,
		tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
		ultimaActividadEn: ahora,
		venceEn: ahora,
		agente: "Carga de la muestra",
	});
	try {
		await cargar(async (nombre, datos, version) => {
			const accion = registro.acciones.get(nombre);
			if (accion === undefined) throw new Error(`no existe la acción ${nombre}`);
			const respuesta = await correrAccion(
				{
					base,
					registro,
					servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
				},
				{
					accion,
					quien,
					cuerpo: { clave_idempotencia: uuidv7(), datos, version },
					ahora: Temporal.Now.instant(),
				},
			);
			return respuesta.resultado;
		});
	} finally {
		await base
			.update(sesiones)
			.set({ cerradaEn: sql`now()`, motivoCierre: "salio" })
			.where(eq(sesiones.id, quien.sesionId));
	}
}

/**
 * Lee un id de lo que regresó una acción.
 * @param resultado Lo que regresó.
 * @param campo El campo con el id.
 */
export function idDe(resultado: Record<string, unknown>, campo: string): string {
	return z.uuid().parse(resultado[campo]);
}
