/**
 * Lo que comparten las acciones de las escuelas: leerla, crearla con su color y su evento.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md (reglas 1 y 2)
 */

import { paletaDeEscuelas } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { count, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { escuelas } from "../tablas.ts";

/** Una escuela como la leen las acciones. */
export type Escuela = typeof escuelas.$inferSelect;

/**
 * Lee una escuela y la bloquea.
 * @param transaccion La transacción.
 * @param id La escuela.
 * @throws `404` si no existe.
 */
export async function leerEscuela(transaccion: Transaccion, id: string): Promise<Escuela> {
	const [escuela] = await transaccion.select().from(escuelas).where(eq(escuelas.id, id)).for("update");
	if (escuela === undefined) throw noExiste();
	return escuela;
}

/**
 * Crea una escuela con el siguiente color de la paleta (en orden; al acabarse, vuelve a empezar). Dos a la vez
 * esperan una a la otra, para no tomar el mismo color.
 * @param contexto El contexto de la acción.
 * @param datos El nombre y el municipio.
 * @param mensajeRepetida El mensaje de `escuela_repetida` de quien la crea.
 * @returns El id y el color.
 * @throws `422 escuela_repetida` si ya hay una con ese nombre y municipio, sin importar acentos ni mayúsculas.
 */
export async function crearEscuela(
	contexto: ContextoDeAccion,
	datos: { nombre: string; municipio: string },
	mensajeRepetida: string,
): Promise<{ id: string; color: string }> {
	const { transaccion } = contexto;
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext('catalogo.color_de_escuela'))`);
	const [cuantas] = await transaccion.select({ n: count() }).from(escuelas);
	const color = paletaDeEscuelas[(cuantas?.n ?? 0) % paletaDeEscuelas.length] ?? paletaDeEscuelas[0];
	const id = uuidv7();
	const [creada] = await transaccion
		.insert(escuelas)
		.values({ id, nombre: datos.nombre, municipio: datos.municipio, color, creadoPor: quienCambia(contexto) })
		.onConflictDoNothing()
		.returning({ id: escuelas.id });
	if (creada === undefined) throw errorDeRegla("escuela_repetida", mensajeRepetida);
	contexto.guardarEvento({
		tipo: "escuela.agregada",
		datos: { escuela_id: id },
		tablas: ["escuelas"],
		entidad: "escuelas",
		entidadId: id,
	});
	return { id, color };
}

/**
 * Guarda `escuela.cambiada`.
 * @param contexto El contexto de la acción.
 * @param id La escuela.
 */
export function escuelaCambiada(contexto: ContextoDeAccion, id: string): void {
	contexto.guardarEvento({
		tipo: "escuela.cambiada",
		datos: { escuela_id: id },
		tablas: ["escuelas"],
		entidad: "escuelas",
		entidadId: id,
	});
}
