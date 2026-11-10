/**
 * `admin.cerrar_cuenta_de_persona`: la baja de una persona le quita su cuenta en la misma transacción.
 * Fase 7 · docs/modulos/admin/cuentas.md («`admin.cerrar_cuenta_de_persona`»)
 *
 * No pide «Confirmar con Google»: quita acceso, no lo da. La cuenta activa queda `sin_acceso` con el motivo
 * «Baja de la persona», sin sus departamentos ni permisos y con sus sesiones cerradas; la solicitada queda
 * `rechazada` y su autorización se cancela. Sin cuenta viva, no hace nada.
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { estadosVivos, quitarElAcceso } from "../dominio/cuentas.ts";
import { usuarios } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ persona_id: z.uuid() });

/** El motivo de la baja de una cuenta que se cierra con su persona (el CHECK de la tabla lo conoce). */
const motivoBajaDePersona = "Baja de la persona";

/**
 * Cierra la cuenta viva de una persona.
 * @param contexto El contexto de la baja de la persona.
 * @param datos `persona_id`.
 * @returns `cerrada`: `activa` o `solicitada` si había una, o `null`.
 */
export async function cerrarCuentaDePersona(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_id } = pedido.parse(datos);
	const { transaccion, quien } = contexto;
	const [viva] = await transaccion
		.select({ id: usuarios.id, estado: usuarios.estado, autorizacionId: usuarios.autorizacionId })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, persona_id), inArray(usuarios.estado, estadosVivos)))
		.for("update");
	if (viva === undefined) return { cerrada: null };
	if (viva.estado === "activa") {
		await quitarElAcceso(contexto, viva.id, {
			por: quien.tipo === "cuenta" ? quien.usuarioId : null,
			motivo: motivoBajaDePersona,
			confirmado: null,
		});
		return { cerrada: "activa" };
	}
	await transaccion.update(usuarios).set({ estado: "rechazada" }).where(eq(usuarios.id, viva.id));
	if (viva.autorizacionId !== null) {
		await contexto.interna("direccion.cancelar_autorizacion", {
			autorizacion_id: viva.autorizacionId,
			motivo: "La persona se dio de baja",
		});
	}
	contexto.guardarEvento({
		tipo: "cuenta.rechazada",
		datos: { usuario_id: viva.id },
		tablas: ["usuarios"],
		entidad: "usuarios",
		entidadId: viva.id,
	});
	return { cerrada: "solicitada" };
}
