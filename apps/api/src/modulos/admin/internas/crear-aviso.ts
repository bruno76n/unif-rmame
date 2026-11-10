/**
 * `admin.crear_aviso`: avisa algo a una o varias cuentas.
 * Fase 4 · docs/modulos/admin/avisos.md («`admin.crear_aviso` · interna»)
 *
 * Resuelve a quién con las cuentas activas de ese momento (`duena`, `soporte`, `departamento:{clave}` o
 * la lista de cuentas) y escribe un aviso por cuenta. No repite uno del mismo tipo, para la misma cuenta y
 * el mismo documento, mientras el anterior no se lea. Si va por correo lo dice `avisos.correo_{tipo}`; el
 * correo lo manda después el worker. Cada aviso sale en vivo a las sesiones de su cuenta al confirmar.
 */

import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { canalDeAvisos } from "../../../nucleo/sincronizacion/eventos-en-vivo.ts";
import { encolar } from "../../../nucleo/trabajos/encolar.ts";
import { avisos } from "../tablas.ts";

/** La lectura que resuelve una regla de destinatarios en ids de cuentas activas: `lecturas/cuentas-por-regla.ts`. */
export const lecturaDeCuentasPorRegla = "admin.cuentas_por_regla";

/** La tarea del worker que manda los correos. */
export const tareaDeCorreos = "admin.enviar_correos";

/** Lo que recibe. */
const avisoACrear = z.object({
	tipo: z.string().min(1),
	destinatarios: z.union([
		z.object({
			regla: z.union([z.literal("duena"), z.literal("soporte"), z.string().regex(/^departamento:[a-z_]+$/)]),
		}),
		z.object({ cuentas: z.array(z.uuid()) }),
	]),
	texto: z.string().min(1),
	enlace: z.string().optional(),
	entidad: z.string().optional(),
	entidadId: z.uuid().optional(),
	eventoId: z.uuid().optional(),
	/** Para no mandar por correo lo que avisa que el correo falla. */
	sinCorreo: z.literal(true).optional(),
});

/** Lee la lista de cuentas que regresa la lectura de las reglas. */
const cuentas = z.array(z.uuid());

/**
 * Crea los avisos.
 * @param contexto El contexto de la acción, del trabajo o del proceso de la bandeja.
 * @param datos `tipo`, `destinatarios`, `texto`, `enlace`, el documento y el evento.
 * @returns Los ids de los avisos nuevos (sin los que ya estaban sin leer).
 */
export async function crearAviso(contexto: ContextoDeAccion, datos: unknown): Promise<{ aviso_ids: string[] }> {
	const aviso = avisoACrear.parse(datos);
	const { transaccion } = contexto;
	const destinatarios =
		"cuentas" in aviso.destinatarios
			? aviso.destinatarios.cuentas
			: cuentas.parse(await contexto.lectura(lecturaDeCuentasPorRegla, aviso.destinatarios));
	const porCorreo =
		aviso.sinCorreo !== true &&
		(await contexto.lectura("admin.parametro", { clave: `avisos.correo_${aviso.tipo}` })) === true;
	const ids: string[] = [];
	for (const usuarioId of new Set(destinatarios)) {
		// Uno a la vez por cuenta, tipo y documento: dos avisos iguales al mismo tiempo dejan uno solo.
		await transaccion.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${`aviso:${usuarioId}:${aviso.tipo}:${aviso.entidadId ?? ""}`}))`,
		);
		const repetido = await transaccion.execute(sql`
			SELECT 1 FROM ${avisos}
			WHERE usuario_id = ${usuarioId} AND tipo = ${aviso.tipo} AND leido_en IS NULL
				AND entidad_id IS NOT DISTINCT FROM ${aviso.entidadId ?? null}::uuid`);
		if (repetido.rows.length > 0) continue;
		const id = uuidv7();
		await transaccion.insert(avisos).values({
			id,
			usuarioId,
			tipo: aviso.tipo,
			texto: aviso.texto,
			enlace: aviso.enlace ?? null,
			entidad: aviso.entidad ?? null,
			entidadId: aviso.entidadId ?? null,
			eventoId: aviso.eventoId ?? null,
			porCorreo,
		});
		await transaccion.execute(sql`SELECT pg_notify(${canalDeAvisos}, ${id})`);
		ids.push(id);
	}
	if (porCorreo && ids.length > 0) {
		await encolar(transaccion, { tarea: tareaDeCorreos, cola: tareaDeCorreos, clave: tareaDeCorreos });
	}
	return { aviso_ids: ids };
}
