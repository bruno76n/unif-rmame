/**
 * `admin.cuentas_por_regla`: las cuentas activas que cumplen una regla de destinatarios de los avisos.
 * Fase 5 · docs/modulos/admin/avisos.md (regla 2)
 *
 * `duena`, `soporte` (las cuentas de soporte técnico) o `departamento:{clave}` (las cuentas con ese
 * departamento sin baja). Solo cuentas activas, en el orden de su id.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { departamentos, usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	regla: z.union([z.literal("duena"), z.literal("soporte"), z.string().regex(/^departamento:[a-z_]+$/)]),
});

/**
 * Las cuentas de la regla.
 * @param contexto El contexto de la acción.
 * @param datos `regla`.
 * @returns Los ids de las cuentas.
 */
export async function cuentasPorRegla(contexto: ContextoDeAccion, datos: unknown): Promise<string[]> {
	const { regla } = pedido.parse(datos);
	const { transaccion } = contexto;
	const activa = eq(usuarios.estado, "activa");
	if (regla === "duena" || regla === "soporte") {
		const renglones = await transaccion
			.select({ id: usuarios.id })
			.from(usuarios)
			.where(and(activa, regla === "duena" ? eq(usuarios.esDuena, true) : eq(usuarios.esSoporte, true)))
			.orderBy(asc(usuarios.id));
		return renglones.map((renglon) => renglon.id);
	}
	const renglones = await transaccion
		.selectDistinct({ id: usuarios.id })
		.from(usuarios)
		.innerJoin(usuarioDepartamentos, eq(usuarioDepartamentos.usuarioId, usuarios.id))
		.innerJoin(departamentos, eq(departamentos.id, usuarioDepartamentos.departamentoId))
		.where(
			and(activa, isNull(usuarioDepartamentos.bajaEn), eq(departamentos.clave, regla.replace("departamento:", ""))),
		)
		.orderBy(asc(usuarios.id));
	return renglones.map((renglon) => renglon.id);
}
