/**
 * Prueba de dar de baja y reactivar a una persona: nada se borra, la persona de la dueña no se da de baja.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (partes 2, 3 y 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("dar de baja conserva la persona y le quita lo que la deja entrar en la misma transacción; la persona de la dueña no se da de baja", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de una persona. */
	async function version(id: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM personas WHERE id = $1", [id]);
		return Number(rows[0]?.version);
	}

	it("da de baja con su motivo y su bitácora; otra vez, ya_dada_de_baja; reactivar la regresa sin PIN ni cuenta", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		const sinMotivo = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "x" }, version: await version(id) },
			"personal",
		);
		expect(sinMotivo.cuerpo).toMatchObject({ campos: { motivo: "Escribe el motivo" } });
		const baja = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "Renunció" }, version: await version(id) },
			"personal",
		);
		expect(baja.cuerpo).toMatchObject({ resultado: { mensaje: "Persona de prueba dada de baja" } });
		const { rows } = await servidor.base.dueno.query("SELECT baja_en, motivo_baja FROM personas WHERE id = $1", [id]);
		expect(rows[0]).toEqual({ baja_en: expect.any(Date), motivo_baja: "Renunció" });
		const otraVez = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "Renunció" }, version: await version(id) },
			"personal",
		);
		expect(otraVez.cuerpo).toMatchObject({ codigo: "ya_dada_de_baja" });
		const reactivada = await mandarAccion(
			servidor,
			"personal.reactivar_persona",
			{ datos: { persona_id: id }, version: await version(id) },
			"personal",
		);
		expect(reactivada.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba reactivada. Falta asignarle PIN del taller" },
		});
		const activa = await mandarAccion(
			servidor,
			"personal.reactivar_persona",
			{ datos: { persona_id: id }, version: await version(id) },
			"personal",
		);
		expect(activa.cuerpo).toMatchObject({ codigo: "no_esta_de_baja" });
	});

	it("la persona de la dueña no se da de baja", async () => {
		const id = "01936f2e-0000-7000-8000-0000000000e1";
		const respuesta = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "No se puede" }, version: await version(id) },
			"personal",
		);
		expect(respuesta.cuerpo).toMatchObject({ codigo: "es_la_duena", mensaje: "La dueña no se da de baja." });
	});

	it("en la misma transacción anula su PIN, rechaza su solicitud de cuenta y cancela su AU-; con cuenta activa, se la cierra", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		await mandarAccion(servidor, "personal.asignar_pin", { datos: { persona_id: id } }, "personal");
		const pedida = await mandarAccion(
			servidor,
			"admin.pedir_cuenta",
			{ datos: { persona_id: id, correo: "taller.baja@gmail.com", departamentos: ["calidad"] } },
			"admin",
		);
		const { usuario_id, autorizacion_id } = pedida.cuerpo.resultado as { usuario_id: string; autorizacion_id: string };
		const baja = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "Renunció" }, version: await version(id) },
			"personal",
		);
		expect(baja.cuerpo).toMatchObject({ resultado: { mensaje: "Persona de prueba dada de baja. Su PIN ya no entra" } });
		const { rows } = await servidor.base.dueno.query(
			`SELECT (SELECT estado FROM pines WHERE persona_id = $1) AS pin,
				(SELECT estado FROM usuarios WHERE id = $2) AS cuenta,
				(SELECT estado FROM autorizaciones WHERE id = $3) AS autorizacion,
				(SELECT despues FROM bitacora WHERE accion = 'personal.dar_baja_persona' AND entidad_id = $1) AS despues`,
			[id, usuario_id, autorizacion_id],
		);
		expect(rows[0]).toEqual({
			pin: "anulado",
			cuenta: "rechazada",
			autorizacion: "cancelada",
			despues: { activa: false, motivo: "Renunció", acceso_quitado: ["PIN del taller", "Solicitud de cuenta"] },
		});

		const conCuenta = await nuevaPersona(servidor.base.dueno);
		const alta = await mandarAccion(
			servidor,
			"admin.crear_cuenta",
			{ datos: { persona_id: conCuenta, correo: "oficina.baja@gmail.com", departamentos: ["calidad"] } },
			"duena",
			conGoogle(),
		);
		const cuenta = (alta.cuerpo.resultado as { usuario_id: string }).usuario_id;
		const otra = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: conCuenta, motivo: "Renunció" }, version: await version(conCuenta) },
			"personal",
		);
		expect(otra.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba dada de baja. Su cuenta de Google ya no entra" },
		});
		const cerrada = await servidor.base.dueno.query("SELECT estado, motivo_baja FROM usuarios WHERE id = $1", [cuenta]);
		expect(cerrada.rows[0]).toEqual({ estado: "sin_acceso", motivo_baja: "Baja de la persona" });
	});
});
