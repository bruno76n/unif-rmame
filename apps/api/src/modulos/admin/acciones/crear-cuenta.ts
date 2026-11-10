/**
 * `admin.crear_cuenta`: la dueña da de alta una cuenta de Google, ya activa, con sus departamentos.
 * Fase 5 · docs/modulos/admin/cuentas.md («`admin.crear_cuenta`»)
 * Fase 7 · la persona de la cuenta y su PIN (reglas 2, 3 y 9)
 *
 * La persona tiene que estar activa y no ser de tienda. Una persona y un correo tienen a lo más una cuenta
 * viva (solicitada o activa); dos altas a la vez para la misma persona o el mismo correo dejan una sola,
 * porque cada una toma su candado antes de buscar. Si la persona tenía PIN del taller, se anula.
 */

import { crearCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { v7 as uuidv7 } from "uuid";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	anularPinPorCuenta,
	confirmadoConGoogle,
	cuentaQueLlama,
	departamentosPorClave,
	leerPersonaDeCuenta,
	revisarAsignables,
	revisarPersonaDeCuenta,
	revisarQueEstanLibres,
	tomarCandadosDeCuenta,
} from "../dominio/cuentas.ts";
import { usuarioDepartamentos, usuarios } from "../tablas.ts";

export const accionCrearCuenta = implementarAccion(crearCuenta, async (contexto, datos) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const claves = [...new Set(datos.departamentos)];
	const deptos = await departamentosPorClave(transaccion, claves);
	revisarAsignables(deptos.values());
	await tomarCandadosDeCuenta(transaccion, datos.persona_id, datos.correo);
	const persona = await leerPersonaDeCuenta(contexto, datos.persona_id);
	revisarPersonaDeCuenta(persona);
	await revisarQueEstanLibres(transaccion, persona, datos.correo);
	const usuarioId = uuidv7();
	const ahora = contexto.ahora.toString();
	await transaccion.insert(usuarios).values({
		id: usuarioId,
		personaId: persona.id,
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
	const pinAnulado = await anularPinPorCuenta(contexto, persona.id, duena);
	const nombres = [...deptos.values()].map((depto) => depto.nombre).join(", ");
	contexto.bitacora({
		descripcion: `Dio de alta a ${persona.nombre} con ${nombres}`,
		entidad: "usuarios",
		entidadId: usuarioId,
		despues: {
			correo: datos.correo,
			departamentos: claves,
			...(pinAnulado ? { acceso_quitado: ["PIN del taller"] } : {}),
		},
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
			mensaje: `${persona.nombre} dada de alta: ya puede entrar con su cuenta de Google`,
		},
		avisos: pinAnulado ? ["Su PIN del taller ya no entra"] : [],
		entidad: { nombre: "usuarios", id: usuarioId },
	};
});
