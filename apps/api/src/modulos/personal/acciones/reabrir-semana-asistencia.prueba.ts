/**
 * Prueba de reabrir una semana: solo la dueña, con motivo, y nunca con la nómina pagada.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «una semana con la nómina pagada
 * ya no se reabre»), con la nómina pagada de verdad
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	pagarNominaDePrueba,
	personaDeNomina,
	registroDeNomina,
	semanaConNomina,
} from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña reabre una semana cerrada, con motivo, y nunca con la nómina pagada", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una semana cerrada, directo en la base, empezando en ese lunes. */
	async function semanaCerrada(lunes: string, sabado: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			`INSERT INTO asistencia_semanas (id, fecha_inicio, fecha_fin, estado, cerrada_en)
			 VALUES (gen_random_uuid(), $1, $2, 'cerrada', now()) RETURNING id`,
			[lunes, sabado],
		);
		return z.object({ id: z.uuid() }).parse(rows[0]).id;
	}

	/** Reabre como `quien`. */
	async function reabrir(id: string, motivo: string, quien = "duena") {
		const { rows } = await servidor.base.dueno.query(
			"SELECT version::int AS version FROM asistencia_semanas WHERE id = $1",
			[id],
		);
		return mandarAccion(
			servidor,
			"personal.reabrir_semana_asistencia",
			{ datos: { asistencia_semana_id: id, motivo }, version: rows[0]?.version },
			quien,
		);
	}

	it("Personal sin ser la dueña no reabre; sin motivo, 400; la dueña la reabre con su bitácora; abierta, semana_abierta", async () => {
		const id = await semanaCerrada("2026-10-19", "2026-10-24");
		const personal = await reabrir(id, "Faltó un día de Sergio", "personal");
		expect(personal.estado).toBe(403);
		expect(personal.cuerpo).toMatchObject({ codigo: "solo_duena" });
		const sinMotivo = await reabrir(id, "");
		expect(sinMotivo.estado).toBe(400);
		expect(sinMotivo.cuerpo).toMatchObject({ campos: { motivo: "Escribe el motivo" } });
		const reabierta = await reabrir(id, "Faltó un día de Sergio");
		expect(reabierta.cuerpo).toMatchObject({ resultado: { mensaje: "Semana del 19 al 24 de octubre reabierta" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_reapertura, reabierta_en IS NOT NULL AS reabierta FROM asistencia_semanas WHERE id = $1",
			[id],
		);
		expect(rows[0]).toEqual({ estado: "abierta", motivo_reapertura: "Faltó un día de Sergio", reabierta: true });
		const bitacora = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [id]);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Reabrió la asistencia del 19 al 24 de octubre: Faltó un día de Sergio" },
		]);
		expect((await reabrir(id, "Otra vez")).cuerpo).toMatchObject({ codigo: "semana_abierta" });
	});

	it("Una semana con la nómina pagada ya no se reabre: nomina_pagada, y la semana sigue cerrada", async () => {
		const semana = await semanaConNomina(servidor, "2026-10-12");
		const pagada = await pagarNominaDePrueba(servidor, semana.nominaId);
		expect(pagada.estado).toBe(200);
		const id = semana.semanaId;
		const respuesta = await reabrir(id, "Faltó un día");
		expect(respuesta.cuerpo).toMatchObject({
			codigo: "nomina_pagada",
			mensaje: "La nómina del 12 al 17 de octubre ya se pagó: la semana ya no se reabre. Corrige en la siguiente",
		});
		const { rows } = await servidor.base.dueno.query("SELECT estado FROM asistencia_semanas WHERE id = $1", [id]);
		expect(rows[0]).toEqual({ estado: "cerrada" });
	});

	it("reabrir mientras se paga la nómina espera al pago y responde nomina_pagada: la semana sigue cerrada", async () => {
		const semana = await semanaConNomina(servidor, "2024-01-08");
		const persona = await personaDeNomina(servidor, { nombre: "Pieza de la carrera", formaPago: "pieza" });
		await registroDeNomina(servidor, { personaId: persona, fecha: "2024-01-09", buenas: 10, tarifaCentavos: 100 });
		// Se detiene el pago a la mitad: la persona está tomada por otra conexión.
		const conexion = await servidor.base.dueno.connect();
		await conexion.query("BEGIN");
		await conexion.query("SELECT id FROM personas WHERE id = $1 FOR UPDATE", [persona]);
		const pago = pagarNominaDePrueba(servidor, semana.nominaId);
		const reapertura = (async () => {
			await esperarQueEsperen(1);
			return reabrir(semana.semanaId, "Faltó un día de prueba");
		})();
		// Reabrir espera al pago; si no lo espera, termina antes y el pago sigue detenido.
		try {
			await Promise.race([esperarQueEsperen(2), reapertura]);
		} finally {
			await conexion.query("ROLLBACK");
			conexion.release();
		}
		expect((await pago).estado).toBe(200);
		expect((await reapertura).cuerpo).toMatchObject({ codigo: "nomina_pagada" });
		expect(
			(await servidor.base.dueno.query("SELECT estado FROM asistencia_semanas WHERE id = $1", [semana.semanaId])).rows,
		).toEqual([{ estado: "cerrada" }]);
	});

	/**
	 * Espera, hasta diez segundos, a que haya `cuantas` transacciones esperando un candado.
	 * @returns Si llegaron.
	 */
	async function esperarQueEsperen(cuantas: number): Promise<boolean> {
		for (let vuelta = 0; vuelta < 200; vuelta++) {
			const { rows } = await servidor.base.dueno.query(
				"SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
			);
			if (z.object({ n: z.number() }).parse(rows[0]).n >= cuantas) return true;
			await new Promise((listo) => setTimeout(listo, 50));
		}
		return false;
	}
});
