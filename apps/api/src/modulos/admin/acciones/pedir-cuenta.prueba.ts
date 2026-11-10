/**
 * Prueba de pedir una cuenta, decidir su alta y cerrarla con la baja de la persona.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa pedir una cuenta. */
const laPedida = z.object({ usuario_id: z.uuid(), autorizacion_id: z.uuid(), folio: z.string() });

describe("la oficina pide la cuenta y solo la dueña la decide; la baja de la persona cierra su cuenta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Administración del sistema (no la dueña) pide una cuenta para una persona. */
	async function pedir(personaId: string, correo: string, quien = "admin") {
		return mandarAccion(
			servidor,
			"admin.pedir_cuenta",
			{ datos: { persona_id: personaId, correo, departamentos: ["calidad"], para_que: "para revisar lotes" } },
			quien,
		);
	}

	/** La dueña decide la AU- desde Administración del sistema. */
	async function decidir(autorizacionId: string, decision: "autorizar" | "rechazar", motivo?: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT version::int AS version FROM autorizaciones WHERE id = $1",
			[autorizacionId],
		);
		return mandarAccion(
			servidor,
			"direccion.decidir_autorizacion",
			{
				datos: {
					autorizacion_id: autorizacionId,
					desde: "admin",
					decision,
					...(motivo === undefined ? {} : { motivo }),
				},
				version: rows[0]?.version,
			},
			"duena",
			conGoogle(),
		);
	}

	/** La cuenta como está en la base. */
	async function cuenta(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, activada_por, confirmado_con_google_en IS NOT NULL AS confirmada, motivo_baja FROM usuarios WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	/** La versión de una persona. */
	async function versionDePersona(id: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM personas WHERE id = $1", [
			id,
		]);
		return Number(rows[0]?.version);
	}

	it("nace solicitada con su AU- de alta de usuario; la dueña no pide; otra para la misma persona, persona_con_cuenta", async () => {
		const personaId = await nuevaPersona(servidor.base.dueno);
		const respuesta = await pedir(personaId, "rosa.mendez@gmail.com");
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: "Solicitud de cuenta para Persona de prueba enviada a Dirección" },
		});
		const pedida = laPedida.parse(respuesta.cuerpo.resultado);
		expect(await cuenta(pedida.usuario_id)).toMatchObject({ estado: "solicitada", confirmada: false });
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, estado, resumen, detalle, usuario_solicitado_id FROM autorizaciones WHERE id = $1",
			[pedida.autorizacion_id],
		);
		expect(rows[0]).toEqual({
			tipo: "alta_usuario",
			estado: "por_autorizar",
			resumen: "Dar cuenta a Persona de prueba con Calidad, para revisar lotes",
			detalle: "rosa.mendez@gmail.com · Calidad",
			usuario_solicitado_id: pedida.usuario_id,
		});
		const otraVez = await pedir(personaId, "otra@gmail.com");
		expect(otraVez.cuerpo).toMatchObject({
			codigo: "persona_con_cuenta",
			mensaje: "Persona de prueba ya tiene cuenta.",
		});
		const laDuena = await pedir(await nuevaPersona(servidor.base.dueno), "nueva@gmail.com", "duena");
		expect(laDuena.cuerpo).toMatchObject({ codigo: "la_duena_da_de_alta" });
		const tienda = await pedir(await nuevaPersona(servidor.base.dueno, "tienda"), "caja@gmail.com");
		expect(tienda.cuerpo).toMatchObject({ codigo: "persona_no_valida" });
		const sinAdmin = await pedir(await nuevaPersona(servidor.base.dueno), "x@gmail.com", "ventas");
		expect(sinAdmin.estado).toBe(403);
	});

	it("autorizarla la activa con la dueña y su confirmación, y anula el PIN; rechazarla la deja rechazada", async () => {
		const delTaller = await nuevaPersona(servidor.base.dueno, "taller");
		await mandarAccion(servidor, "personal.asignar_pin", { datos: { persona_id: delTaller } }, "personal");
		const pedida = laPedida.parse((await pedir(delTaller, "lupita@gmail.com")).cuerpo.resultado);
		const autorizada = await decidir(pedida.autorizacion_id, "autorizar");
		expect(autorizada.cuerpo).toMatchObject({
			resultado: {
				estado: "autorizada",
				mensaje:
					"Persona de prueba dada de alta: ya puede entrar con su cuenta de Google. Su PIN del taller ya no entra",
				datos: { usuario_id: pedida.usuario_id },
			},
		});
		expect(await cuenta(pedida.usuario_id)).toMatchObject({
			estado: "activa",
			activada_por: cuentaDePrueba("duena"),
			confirmada: true,
		});
		const pin = await servidor.base.dueno.query("SELECT estado, motivo_anulacion FROM pines WHERE persona_id = $1", [
			delTaller,
		]);
		expect(pin.rows).toEqual([{ estado: "anulado", motivo_anulacion: "cuenta_google" }]);
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, despues FROM bitacora WHERE entidad_id = $1",
			[pedida.autorizacion_id],
		);
		expect(bitacora.rows).toEqual([
			{
				descripcion: "Dio de alta a Persona de prueba con Calidad · autorizado por dirección",
				despues: {
					estado: "autorizada",
					documento: {
						estado: "activa",
						correo: "lupita@gmail.com",
						departamentos: ["calidad"],
						acceso_quitado: ["PIN del taller"],
					},
				},
			},
		]);

		const otra = laPedida.parse(
			(await pedir(await nuevaPersona(servidor.base.dueno), "no@gmail.com")).cuerpo.resultado,
		);
		const rechazada = await decidir(otra.autorizacion_id, "rechazar", "No necesita cuenta");
		expect(rechazada.cuerpo).toMatchObject({ resultado: { estado: "rechazada", mensaje: "Alta rechazada" } });
		expect(await cuenta(otra.usuario_id)).toMatchObject({ estado: "rechazada" });
		const rechazo = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [
			otra.autorizacion_id,
		]);
		expect(rechazo.rows).toEqual([{ descripcion: "Rechazó la alta de Persona de prueba: No necesita cuenta" }]);
	});

	it("si la persona se dio de baja mientras esperaba, autorizar responde persona_dada_de_baja y no decide nada", async () => {
		const personaId = await nuevaPersona(servidor.base.dueno);
		const pedida = laPedida.parse((await pedir(personaId, "tarde@gmail.com")).cuerpo.resultado);
		await servidor.base.dueno.query("UPDATE personas SET baja_en = now(), motivo_baja = 'Renunció' WHERE id = $1", [
			personaId,
		]);
		const respuesta = await decidir(pedida.autorizacion_id, "autorizar");
		expect(respuesta.cuerpo).toMatchObject({
			codigo: "persona_dada_de_baja",
			mensaje: "Persona de prueba ya está dada de baja: rechaza la solicitud.",
		});
		expect(await cuenta(pedida.usuario_id)).toMatchObject({ estado: "solicitada" });
	});

	it("dar de baja a la persona cierra su cuenta activa sin Google, o rechaza su solicitud y cancela la AU-", async () => {
		const conCuenta = await nuevaPersona(servidor.base.dueno);
		const alta = await mandarAccion(
			servidor,
			"admin.crear_cuenta",
			{ datos: { persona_id: conCuenta, correo: "activa@gmail.com", departamentos: ["calidad"] } },
			"duena",
			conGoogle(),
		);
		const { usuario_id } = z.object({ usuario_id: z.uuid() }).parse(alta.cuerpo.resultado);
		const baja = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: conCuenta, motivo: "Renunció" }, version: await versionDePersona(conCuenta) },
			"personal",
		);
		expect(baja.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba dada de baja. Su cuenta de Google ya no entra" },
		});
		expect(await cuenta(usuario_id)).toMatchObject({ estado: "sin_acceso", motivo_baja: "Baja de la persona" });
		const departamentos = await servidor.base.dueno.query(
			"SELECT count(*)::int AS vigentes FROM usuario_departamentos WHERE usuario_id = $1 AND baja_en IS NULL",
			[usuario_id],
		);
		expect(departamentos.rows[0]).toEqual({ vigentes: 0 });

		const conSolicitud = await nuevaPersona(servidor.base.dueno);
		const pedida = laPedida.parse((await pedir(conSolicitud, "espera@gmail.com")).cuerpo.resultado);
		await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: conSolicitud, motivo: "Renunció" }, version: await versionDePersona(conSolicitud) },
			"personal",
		);
		expect(await cuenta(pedida.usuario_id)).toMatchObject({ estado: "rechazada" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_cancelacion FROM autorizaciones WHERE id = $1",
			[pedida.autorizacion_id],
		);
		expect(rows[0]).toEqual({ estado: "cancelada", motivo_cancelacion: "La persona se dio de baja" });
	});

	it("dar de baja a la persona y decidir su alta a la vez: nunca queda una cuenta activa de una persona dada de baja", async () => {
		for (let vuelta = 0; vuelta < 3; vuelta++) {
			const personaId = await nuevaPersona(servidor.base.dueno);
			const pedida = laPedida.parse((await pedir(personaId, `a-la-vez-${vuelta}@gmail.com`)).cuerpo.resultado);
			const [decidida, baja] = await Promise.all([
				decidir(pedida.autorizacion_id, "autorizar"),
				mandarAccion(
					servidor,
					"personal.dar_baja_persona",
					{ datos: { persona_id: personaId, motivo: "Renunció" }, version: await versionDePersona(personaId) },
					"personal",
				),
			]);
			expect(baja.estado).toBe(200);
			const { rows } = await servidor.base.dueno.query(
				"SELECT (SELECT estado FROM usuarios WHERE id = $1) AS cuenta, (SELECT estado FROM autorizaciones WHERE id = $2) AS au",
				[pedida.usuario_id, pedida.autorizacion_id],
			);
			// O se autorizó primero y la baja la cerró, o la baja la rechazó y canceló su AU-.
			if (decidida.estado === 200) expect(rows[0]).toEqual({ cuenta: "sin_acceso", au: "autorizada" });
			else expect(rows[0]).toEqual({ cuenta: "rechazada", au: "cancelada" });
		}
	});
});
