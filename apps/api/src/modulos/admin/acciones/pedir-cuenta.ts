/**
 * `admin.pedir_cuenta`: la oficina pide una cuenta de Google para una persona; la decide la dueña.
 * Fase 7 · docs/modulos/admin/cuentas.md («`admin.pedir_cuenta`», reglas 2 a 4)
 *
 * Con las mismas revisiones que el alta de la dueña, la cuenta nace `solicitada` con sus departamentos
 * pedidos (sin confirmación: la da la dueña al autorizar) y su autorización AU- de alta de usuario, que solo
 * la dueña decide. La dueña no pide: da la cuenta directo.
 */

import { pedirCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	cuentaQueLlama,
	departamentosPorClave,
	leerPersonaDeCuenta,
	revisarAsignables,
	revisarPersonaDeCuenta,
	revisarQueEstanLibres,
	tomarCandadosDeCuenta,
} from "../dominio/cuentas.ts";
import { usuarioDepartamentos, usuarios } from "../tablas.ts";

/** Lo que regresa `direccion.pedir_autorizacion`. */
const autorizacionPedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() });

export const accionPedirCuenta = implementarAccion(pedirCuenta, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	const pide = cuentaQueLlama(contexto);
	if (esLaDuena(quien)) {
		throw errorDeRegla("la_duena_da_de_alta", "Tú das la cuenta directo con «Cuenta nueva».");
	}
	const claves = [...new Set(datos.departamentos)];
	const deptos = await departamentosPorClave(transaccion, claves);
	revisarAsignables(deptos.values());
	await tomarCandadosDeCuenta(transaccion, datos.persona_id, datos.correo);
	const persona = await leerPersonaDeCuenta(contexto, datos.persona_id);
	revisarPersonaDeCuenta(persona);
	await revisarQueEstanLibres(transaccion, persona, datos.correo);
	const usuarioId = uuidv7();
	await transaccion
		.insert(usuarios)
		.values({ id: usuarioId, personaId: persona.id, correo: datos.correo, estado: "solicitada", creadoPor: pide });
	await transaccion
		.insert(usuarioDepartamentos)
		.values(
			[...deptos.values()].map((depto) => ({ id: uuidv7(), usuarioId, departamentoId: depto.id, creadoPor: pide })),
		);
	const nombres = [...deptos.values()].map((depto) => depto.nombre).join(", ");
	const paraQue = datos.para_que === undefined || datos.para_que === "" ? "" : `, ${datos.para_que}`;
	const pedida = autorizacionPedida.parse(
		await contexto.interna("direccion.pedir_autorizacion", {
			tipo: "alta_usuario",
			departamento_origen: "admin",
			resumen: `Dar cuenta a ${persona.nombre} con ${nombres}${paraQue}`,
			detalle: `${datos.correo} · ${nombres}`,
			documento: persona.nombre,
			usuario_solicitado_id: usuarioId,
		}),
	);
	await transaccion.update(usuarios).set({ autorizacionId: pedida.autorizacion_id }).where(eq(usuarios.id, usuarioId));
	contexto.bitacora({
		descripcion: `Pidió cuenta para ${persona.nombre}`,
		entidad: "usuarios",
		entidadId: usuarioId,
		despues: { correo: datos.correo, departamentos: claves, autorizacion: pedida.folio },
	});
	contexto.guardarEvento({
		tipo: "cuenta.solicitada",
		datos: { usuario_id: usuarioId, autorizacion_id: pedida.autorizacion_id },
		tablas: ["usuarios", "usuario_departamentos"],
		entidad: "usuarios",
		entidadId: usuarioId,
	});
	return {
		resultado: {
			usuario_id: usuarioId,
			autorizacion_id: pedida.autorizacion_id,
			folio: pedida.folio,
			mensaje: `Solicitud de cuenta para ${persona.nombre} enviada a Dirección`,
		},
		entidad: { nombre: "usuarios", id: usuarioId },
	};
});
