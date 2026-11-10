/**
 * `admin.crear_cuenta`: la dueña da de alta una cuenta de Google, ya activa, con sus departamentos.
 * Fase 5 · docs/modulos/admin/cuentas.md («`admin.crear_cuenta`»)
 *
 * Una persona y un correo tienen a lo más una cuenta viva (solicitada o activa); dos altas a la vez para
 * la misma persona o el mismo correo dejan una sola, porque cada una toma su candado antes de buscar. La
 * revisión de la persona (activa, no de tienda) y la anulación de su PIN llegan con Personal, en la fase 7.
 */

import { crearCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle, cuentaQueLlama, departamentosPorClave, revisarAsignables } from "../dominio/cuentas.ts";
import { usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Los estados de una cuenta viva. */
const vivas = ["solicitada", "activa"];

export const accionCrearCuenta = implementarAccion(crearCuenta, async (contexto, datos) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const claves = [...new Set(datos.departamentos)];
	const deptos = await departamentosPorClave(transaccion, claves);
	revisarAsignables(deptos.values());
	// Los candados en orden fijo (persona, luego correo): dos altas a la vez no se cruzan.
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cuenta_persona:${datos.persona_id}`}))`);
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cuenta_correo:${datos.correo}`}))`);
	const [conPersona] = await transaccion
		.select({ id: usuarios.id })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, datos.persona_id), inArray(usuarios.estado, vivas)));
	if (conPersona !== undefined) throw errorDeRegla("persona_con_cuenta", "Esa persona ya tiene cuenta.");
	const [conCorreo] = await transaccion
		.select({ estado: usuarios.estado })
		.from(usuarios)
		.where(and(eq(usuarios.correo, datos.correo), inArray(usuarios.estado, vivas)));
	if (conCorreo?.estado === "activa") throw errorDeRegla("correo_con_cuenta", "Ese correo ya tiene cuenta.");
	if (conCorreo !== undefined) throw errorDeRegla("correo_solicitado", "Ya hay una solicitud para ese correo.");
	const usuarioId = uuidv7();
	const ahora = contexto.ahora.toString();
	await transaccion.insert(usuarios).values({
		id: usuarioId,
		personaId: datos.persona_id,
		correo: datos.correo,
		estado: "activa",
		activadaEn: ahora,
		activadaPor: duena,
		confirmadoConGoogleEn: confirmado,
		creadoPor: duena,
	});
	await transaccion.insert(usuarioDepartamentos).values(
		[...deptos.values()].map((depto) => ({
			id: uuidv7(),
			usuarioId,
			departamentoId: depto.id,
			confirmadoConGoogleEn: confirmado,
			creadoPor: duena,
		})),
	);
	const nombres = [...deptos.values()].map((depto) => depto.nombre).join(", ");
	contexto.bitacora({
		descripcion: `Dio de alta a ${datos.correo} con ${nombres}`,
		entidad: "usuarios",
		entidadId: usuarioId,
		despues: { correo: datos.correo, departamentos: claves },
		confirmadoConGoogleEn: confirmado,
	});
	contexto.guardarEvento({
		tipo: "cuenta.activada",
		datos: { usuario_id: usuarioId },
		tablas: ["usuarios", "usuario_departamentos"],
		entidad: "usuarios",
		entidadId: usuarioId,
	});
	return {
		resultado: {
			usuario_id: usuarioId,
			mensaje: `${datos.correo} dada de alta: ya puede entrar con su cuenta de Google`,
		},
		entidad: { nombre: "usuarios", id: usuarioId },
	};
});
