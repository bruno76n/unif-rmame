/**
 * `admin.aplicar_decision_alta_usuario`: el efecto de decidir una AU- de alta de usuario.
 * Fase 7 · docs/modulos/admin/cuentas.md («`admin.aplicar_decision_alta_usuario`»)
 *
 * La llama `direccion.decidir_autorizacion` en su transacción, con la dueña y su «Confirmar con Google». No
 * escribe bitácora: regresa lo que la decisión anota. Al autorizar vuelve a revisar la persona, la persona y
 * el correo, porque pudieron cambiar mientras esperaba; la cuenta pasa a activa con sus departamentos
 * pedidos, y si la persona tenía PIN del taller, se anula. Al rechazar, la cuenta queda `rechazada`.
 */

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	anularPinPorCuenta,
	confirmadoConGoogle,
	cuentaQueLlama,
	leerPersonaDeCuenta,
	revisarQueEstanLibres,
	tomarCandadosDeCuenta,
} from "../dominio/cuentas.ts";
import { departamentos, usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Lo que manda la decisión. */
const decision = z.object({
	autorizacion_id: z.uuid(),
	decision: z.enum(["autorizar", "rechazar"]),
	usuario_solicitado_id: z.uuid(),
});

/**
 * Aplica la decisión a la cuenta solicitada.
 * @param contexto El contexto de la decisión.
 * @param datos La AU-, la decisión y la cuenta solicitada.
 * @returns El mensaje, la descripción de la bitácora, el antes y el después, y `usuario_id`.
 * @throws `422 persona_dada_de_baja`, `persona_con_cuenta` o `correo_con_cuenta` al autorizar.
 */
export async function aplicarDecisionAltaUsuario(contexto: ContextoDeAccion, datos: unknown) {
	const pedida = decision.parse(datos);
	const { transaccion } = contexto;
	const [leida] = await transaccion
		.select({ personaId: usuarios.personaId, correo: usuarios.correo })
		.from(usuarios)
		.where(eq(usuarios.id, pedida.usuario_solicitado_id));
	if (leida?.personaId === null || leida?.personaId === undefined) {
		throw new Error(`la cuenta ${pedida.usuario_solicitado_id} no existe o no tiene persona`);
	}
	// El mismo orden de candados que el alta y la baja: los del correo y la persona, la persona, la cuenta.
	await tomarCandadosDeCuenta(transaccion, leida.personaId, leida.correo);
	const persona = await leerPersonaDeCuenta(contexto, leida.personaId);
	const [cuenta] = await transaccion
		.select()
		.from(usuarios)
		.where(eq(usuarios.id, pedida.usuario_solicitado_id))
		.for("update");
	if (cuenta === undefined || cuenta.estado !== "solicitada" || cuenta.autorizacionId !== pedida.autorizacion_id) {
		throw new Error(`la cuenta ${pedida.usuario_solicitado_id} no está solicitada con esa autorización`);
	}
	const datosDeVuelta = { usuario_id: cuenta.id };
	if (pedida.decision === "rechazar") {
		await transaccion.update(usuarios).set({ estado: "rechazada" }).where(eq(usuarios.id, cuenta.id));
		guardarDecision(contexto, cuenta.id, "cuenta.rechazada");
		return {
			antes: { estado: "solicitada" },
			despues: { estado: "rechazada" },
			datos: datosDeVuelta,
		};
	}
	if (!persona.activa) {
		throw errorDeRegla("persona_dada_de_baja", `${persona.nombre} ya está dada de baja: rechaza la solicitud.`);
	}
	await revisarQueEstanLibres(transaccion, persona, cuenta.correo, cuenta.id);
	const duena = cuentaQueLlama(contexto);
	await transaccion
		.update(usuarios)
		.set({
			estado: "activa",
			activadaEn: contexto.ahora.toString(),
			activadaPor: duena,
			confirmadoConGoogleEn: confirmadoConGoogle(contexto),
		})
		.where(eq(usuarios.id, cuenta.id));
	const pinAnulado = await anularPinPorCuenta(contexto, persona.id, duena);
	const pedidos = await transaccion
		.select({ clave: departamentos.clave, nombre: departamentos.nombre })
		.from(usuarioDepartamentos)
		.innerJoin(departamentos, eq(departamentos.id, usuarioDepartamentos.departamentoId))
		.where(and(eq(usuarioDepartamentos.usuarioId, cuenta.id), isNull(usuarioDepartamentos.bajaEn)))
		.orderBy(departamentos.orden);
	guardarDecision(contexto, cuenta.id, "cuenta.activada");
	return {
		mensaje: `${persona.nombre} dada de alta: ya puede entrar con su cuenta de Google${pinAnulado ? ". Su PIN del taller ya no entra" : ""}`,
		descripcion: `Dio de alta a ${persona.nombre} con ${pedidos.map((depto) => depto.nombre).join(", ")}`,
		antes: { estado: "solicitada" },
		despues: {
			estado: "activa",
			correo: cuenta.correo,
			departamentos: pedidos.map((depto) => depto.clave),
			...(pinAnulado ? { acceso_quitado: ["PIN del taller"] } : {}),
		},
		datos: datosDeVuelta,
	};
}

/**
 * Guarda el evento de la cuenta decidida: «hay cambios» en sus tablas para Administración y Personal.
 * @param contexto El contexto de la decisión.
 * @param usuarioId La cuenta.
 * @param tipo `cuenta.activada` o `cuenta.rechazada`.
 */
function guardarDecision(contexto: ContextoDeAccion, usuarioId: string, tipo: "cuenta.activada" | "cuenta.rechazada") {
	contexto.guardarEvento({
		tipo,
		datos: { usuario_id: usuarioId },
		tablas: ["usuarios", "usuario_departamentos"],
		entidad: "usuarios",
		entidadId: usuarioId,
	});
}
