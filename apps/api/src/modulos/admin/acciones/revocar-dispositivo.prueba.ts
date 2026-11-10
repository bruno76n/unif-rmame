/**
 * Prueba de revocar la tablet del taller con «anular los PIN»: la tablet pide decidirlo, y si se perdió,
 * todos los PIN del Taller dejan de entrar en la misma transacción.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("revocar la tablet pide decir si se perdió; con «anular los PIN», ningún PIN del Taller sigue entrando", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El id de la tablet de prueba. */
	const tablet = quienesDePrueba.tablet?.tipo === "aparato" ? quienesDePrueba.tablet.dispositivoId : "";

	/** La dueña revoca la tablet. */
	async function revocar(datos: Record<string, unknown>) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS version FROM dispositivos WHERE id = $1", [
			tablet,
		]);
		return mandarAccion(
			servidor,
			"admin.revocar_dispositivo",
			{ datos: { dispositivo_id: tablet, motivo: "Se perdió", ...datos }, version: rows[0]?.version },
			"duena",
			conGoogle(),
		);
	}

	it("sin decir si se perdió responde 400; con anular_pines anula todos los PIN vivos del Taller y lo avisa", async () => {
		const sinDecir = await revocar({});
		expect(sinDecir.estado).toBe(400);
		expect(sinDecir.cuerpo).toMatchObject({
			campos: { anular_pines: "Di si se perdió o la pudo usar alguien más." },
		});
		const personas = [
			await nuevaPersona(servidor.base.dueno, "taller"),
			await nuevaPersona(servidor.base.dueno, "taller"),
		];
		for (const persona of personas) {
			await mandarAccion(servidor, "personal.asignar_pin", { datos: { persona_id: persona } }, "personal");
		}
		await servidor.base.dueno.query(
			"UPDATE pines SET estado = 'bloqueado', bloqueado_en = now() WHERE persona_id = $1",
			[personas[1]],
		);
		const revocada = await revocar({ anular_pines: true });
		expect(revocada.cuerpo).toMatchObject({
			resultado: { mensaje: "Tablet del taller revocado: ya no entra" },
			avisos: ["Los PIN del taller ya no entran: Personal tiene que dar nuevos."],
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_anulacion FROM pines WHERE persona_id = ANY($1::uuid[])",
			[personas],
		);
		expect(rows).toEqual([
			{ estado: "anulado", motivo_anulacion: "restablecido" },
			{ estado: "anulado", motivo_anulacion: "restablecido" },
		]);
		const bitacora = await servidor.base.dueno.query(
			"SELECT despues FROM bitacora WHERE accion = 'admin.revocar_dispositivo' AND entidad_id = $1",
			[tablet],
		);
		expect(bitacora.rows[0]?.despues).toMatchObject({ revocado: true, pines_anulados: 2 });
	});
});
