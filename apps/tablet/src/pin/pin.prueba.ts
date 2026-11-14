/**
 * Prueba del PIN sin internet, en un Chrome de tablet Android contra la API real: la tablet lo revisa sola con el hash
 * que bajó; a los intentos del parámetro bloquea a la persona y el bloqueo sube por la cola con su hora; sigue bloqueada
 * aunque escriba bien su PIN, y solo un desbloqueo de Personal posterior la deja entrar.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «El PIN se revisa sin red; a los intentos
 * del parámetro la persona queda bloqueada, el bloqueo sube con su hora y solo un desbloqueo posterior la deja entrar»)
 * y docs/apps/tablet.md («El PIN sin internet»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import {
	bajarHasta,
	levantarTablet,
	personaConPin,
	type TabletDePrueba,
	tabletLista,
} from "../pruebas/tablet-de-prueba.ts";

describe("el PIN se revisa sin red y su bloqueo sube con su hora", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("el PIN se revisa sin red; a los intentos del parámetro queda bloqueada, el bloqueo sube con su hora y solo un desbloqueo posterior la deja entrar", async () => {
		const { personaId, pin } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const otro = pin === "0000" ? "1111" : "0000";
		const revisar = (cifras: string) =>
			pagina.evaluate(([persona, escrito]) => window.porDentro.revisarPin(persona, escrito), [
				personaId,
				cifras,
			] as const);
		await contexto.setOffline(true);
		expect(await revisar(pin)).toEqual({ resultado: "entra" });
		for (const quedan of [4, 3, 2, 1]) expect(await revisar(otro)).toEqual({ resultado: "equivocado", quedan });
		// Un PIN correcto a la mitad regresa los intentos a cero.
		expect(await revisar(pin)).toEqual({ resultado: "entra" });
		for (const quedan of [4, 3, 2, 1]) expect(await revisar(otro)).toEqual({ resultado: "equivocado", quedan });
		const antes = Date.now();
		expect(await revisar(otro)).toEqual({ resultado: "bloqueado" });
		expect(await revisar(pin)).toEqual({ resultado: "bloqueado" });
		const cola = z
			.array(z.object({ accion: z.string(), ocurrido_en: z.string(), datos: z.object({ intentos: z.number() }) }))
			.parse(await pagina.evaluate(() => window.porDentro.cola()));
		expect(cola).toEqual([
			expect.objectContaining({
				accion: "produccion.registrar_bloqueo_pin",
				datos: expect.objectContaining({ intentos: 5 }),
			}),
		]);
		const ocurrido = Date.parse(cola[0]?.ocurrido_en ?? "");
		expect(ocurrido).toBeGreaterThanOrEqual(antes - 1000);
		// Al volver la red, el bloqueo llega a Personal con la hora en que pasó.
		await contexto.setOffline(false);
		expect(await pagina.evaluate(() => window.porDentro.subir())).toMatchObject({ ok: true });
		const [enElServidor] = await prueba.consultar(
			"SELECT estado, bloqueado_en FROM pines WHERE persona_id = $1 AND estado <> 'anulado'",
			[personaId],
		);
		expect(enElServidor?.estado).toBe("bloqueado");
		expect(Math.abs(new Date(String(enElServidor?.bloqueado_en)).getTime() - ocurrido)).toBeLessThan(1000);
		// Bajar el bloqueo no la desbloquea; el desbloqueo de Personal, que es posterior, sí.
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toMatchObject({ ok: true });
		expect(await revisar(pin)).toEqual({ resultado: "bloqueado" });
		const [{ version } = {}] = await prueba.consultar(
			"SELECT version FROM pines WHERE persona_id = $1 AND estado = 'bloqueado'",
			[personaId],
		);
		const desbloqueo = await mandarAccion(
			prueba.servidor,
			"personal.desbloquear_pin",
			{ datos: { persona_id: personaId }, version: Number(version) },
			"personal",
		);
		expect(desbloqueo.estado, JSON.stringify(desbloqueo.cuerpo)).toBe(200);
		await bajarHasta(pagina, async () =>
			z
				.array(z.object({ persona_id: z.uuid(), estado: z.string() }))
				.parse(await pagina.evaluate(() => window.porDentro.leer("pines")))
				.some((suyo) => suyo.persona_id === personaId && suyo.estado === "activo"),
		);
		await contexto.setOffline(true);
		expect(await revisar(otro)).toEqual({ resultado: "equivocado", quedan: 4 });
		expect(await revisar(pin)).toEqual({ resultado: "entra" });
		await contexto.close();
	});
});
