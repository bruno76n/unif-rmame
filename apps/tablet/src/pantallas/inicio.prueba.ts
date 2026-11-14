/**
 * Prueba de que la tablet calcula como la API, en un Chrome de tablet Android contra la API real con la muestra: el tope
 * de cada bulto de «Bultos para ti» es el que la API le da al registro cuando llega, y el color de la salud de cada lote es
 * el de la lectura `produccion.salud_de_lotes`. El orden de «Bultos para ti» es el de la función del paquete compartido,
 * que prueban sus propias pruebas.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «El tope, «Bultos para ti» y la salud dan en
 * la tablet lo mismo que en la API») y docs/apps/tablet.md (regla 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { leerDePrueba } from "../../../api/src/nucleo/pruebas/por-pagar-de-prueba.ts";
import {
	levantarTablet,
	personaDeBaseConPin,
	registroDeOperacion,
	type TabletDePrueba,
	tabletLista,
} from "../pruebas/tablet-de-prueba.ts";

describe("la tablet calcula como la API", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("el tope, «Bultos para ti» y la salud dan en la tablet lo mismo que en la API", async () => {
		const { personaId } = await personaDeBaseConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		// La salud: el color de cada lote en proceso, en la tablet y en la API.
		const tonos = z
			.record(z.string(), z.enum(["rojo", "ambar", "normal"]))
			.parse(await pagina.evaluate(() => window.porDentro.tonosDeLosLotes()));
		const { lotes } = z
			.object({ lotes: z.array(z.object({ lote_id: z.uuid(), tono: z.string() })) })
			.parse(await leerDePrueba(prueba.servidor, "produccion.salud_de_lotes", {}));
		expect(Object.keys(tonos).length).toBeGreaterThan(0);
		expect(tonos).toEqual(Object.fromEntries(lotes.map((lote) => [lote.lote_id, lote.tono])));
		// «Bultos para ti»: cada uno con el tono de su lote y con el tope que la API calcula al llegar el registro.
		const bultos = z
			.array(z.object({ bultoId: z.uuid(), flujoOperacionId: z.uuid(), listas: z.number(), tono: z.string() }))
			.parse(await pagina.evaluate((persona) => window.porDentro.bultosParaTi(persona), personaId));
		expect(bultos.length).toBeGreaterThan(0);
		for (const bulto of bultos.slice(0, 3)) {
			const [lote] = await prueba.consultar("SELECT lote_id FROM bultos WHERE id = $1", [bulto.bultoId]);
			expect(bulto.tono).toBe(tonos[String(lote?.lote_id)]);
			const registro = registroDeOperacion({
				id: crypto.randomUUID(),
				bultoId: bulto.bultoId,
				flujoOperacionId: bulto.flujoOperacionId,
				personaId,
				buenas: 1,
			});
			const clave = await pagina.evaluate((encolado) => window.porDentro.encolar(encolado), registro);
			expect(await pagina.evaluate(() => window.porDentro.subir())).toMatchObject({ ok: true });
			const [recibido] = await prueba.consultar(
				"SELECT respuesta FROM comandos_recibidos WHERE clave_idempotencia = $1",
				[clave],
			);
			// La respuesta guardada del comando lleva lo que regresó la acción en sus datos.
			const { tope } = z
				.object({ datos: z.object({ tope: z.number() }).passthrough() })
				.passthrough()
				.parse(recibido?.respuesta).datos;
			expect(tope).toBe(bulto.listas);
		}
		await contexto.close();
	});
});
