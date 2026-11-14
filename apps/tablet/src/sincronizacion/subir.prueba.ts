/**
 * Prueba de subir, con Playwright en un Chrome de tablet Android contra la API real: sin internet se registra, se
 * reporta y se toma; al volver la red sube todo una vez y en orden, aunque la respuesta de una tanda se pierda o el
 * servidor la corte con `detenido`.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Sin internet se registra, se reporta y se
 * toma; al volver la red sube todo una vez, en orden, aunque se corte a media tanda o llegue `detenido`») y
 * docs/apps/tablet.md («Cómo sube»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	capturasDePrueba,
	levantarTablet,
	personaConPin,
	type TabletDePrueba,
	tabletLista,
} from "../pruebas/tablet-de-prueba.ts";

/** Lo que regresa subir: los comandos contestados y si se cortó. */
const subida = z.object({ ok: z.literal(true), valor: z.object({ contestados: z.number(), detenido: z.boolean() }) });

describe("sin internet se captura; al volver la red sube todo una vez y en orden", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	/**
	 * Cuántas veces llegó cada captura al servidor: el registro, la toma (por la clave de su comando) y la falla.
	 * @param ids Sus ids.
	 * @param claveDeLaToma La clave del comando de la toma.
	 */
	async function vecesEnElServidor(ids: { registro: string; falla: string }, claveDeLaToma: string) {
		const [fila] = await prueba.consultar(
			`SELECT (SELECT count(*)::int FROM registros_operacion WHERE id = $1) AS registro,
				(SELECT count(*)::int FROM fallas WHERE id = $2) AS falla,
				(SELECT count(*)::int FROM comandos_recibidos WHERE tipo_comando = 'produccion.tomar_consumible'
					AND resultado = 'aplicado' AND clave_idempotencia = $3) AS toma`,
			[ids.registro, ids.falla, claveDeLaToma],
		);
		return fila;
	}

	/**
	 * Las claves de la cola, en su orden.
	 * @param pagina La tablet.
	 */
	async function clavesDeLaCola(pagina: Page): Promise<string[]> {
		return z
			.array(z.object({ clave_idempotencia: z.uuid() }))
			.parse(await pagina.evaluate(() => window.porDentro.cola()))
			.map((comando) => comando.clave_idempotencia);
	}

	it("sin internet se registra, se reporta y se toma; al volver la red sube todo una vez, en orden", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const capturas = await capturasDePrueba(prueba, personaId, 2);
		await contexto.setOffline(true);
		for (const encolado of capturas.encolados)
			await pagina.evaluate((dato) => window.porDentro.encolar(dato), encolado);
		expect(await pagina.evaluate(() => window.porDentro.subir())).toEqual({ ok: false, error: "sin_internet" });
		const claves = await clavesDeLaCola(pagina);
		expect(claves).toHaveLength(3);
		const fallas = z
			.array(z.object({ id: z.uuid(), _local: z.string().optional() }))
			.parse(await pagina.evaluate(() => window.porDentro.leer("fallas")));
		expect(fallas.find((falla) => falla.id === capturas.ids.falla)).toMatchObject({ _local: "guardada" });
		await contexto.setOffline(false);
		expect(subida.parse(await pagina.evaluate(() => window.porDentro.subir())).valor).toEqual(
			expect.objectContaining({ contestados: 3, detenido: false }),
		);
		expect(await clavesDeLaCola(pagina)).toEqual([]);
		expect(await vecesEnElServidor(capturas.ids, claves[1] ?? "")).toEqual({ registro: 1, falla: 1, toma: 1 });
		// En el orden en que pasaron.
		const recibidos = await prueba.consultar(
			"SELECT clave_idempotencia FROM comandos_recibidos WHERE clave_idempotencia = ANY($1::uuid[]) ORDER BY recibido_en, id",
			[claves],
		);
		expect(recibidos.map((fila) => fila.clave_idempotencia)).toEqual(claves);
		const despues = z
			.array(z.object({ id: z.uuid(), _local: z.string().optional() }))
			.parse(await pagina.evaluate(() => window.porDentro.leer("fallas")));
		expect(despues.find((falla) => falla.id === capturas.ids.falla)?._local).toBeUndefined();
		await contexto.close();
	});

	it("si se pierde la respuesta de una tanda, la vuelve a mandar con las mismas claves y nada se duplica", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const capturas = await capturasDePrueba(prueba, personaId, 3);
		for (const encolado of capturas.encolados)
			await pagina.evaluate((dato) => window.porDentro.encolar(dato), encolado);
		const claves = await clavesDeLaCola(pagina);
		// El servidor la recibe y la aplica, pero la respuesta no llega a la tablet.
		await pagina.route("**/v1/sync/subir", async (ruta) => {
			await ruta.fetch();
			await ruta.abort("connectionreset");
		});
		expect(await pagina.evaluate(() => window.porDentro.subir())).toEqual({ ok: false, error: "sin_internet" });
		expect(await clavesDeLaCola(pagina)).toEqual(claves);
		await pagina.unroute("**/v1/sync/subir");
		expect(subida.parse(await pagina.evaluate(() => window.porDentro.subir())).valor.contestados).toBe(3);
		expect(await clavesDeLaCola(pagina)).toEqual([]);
		expect(await vecesEnElServidor(capturas.ids, claves[1] ?? "")).toEqual({ registro: 1, falla: 1, toma: 1 });
		await contexto.close();
	});

	it("con detenido manda otra vez desde el primero sin respuesta, en orden, y nada se duplica", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const capturas = await capturasDePrueba(prueba, personaId, 4);
		for (const encolado of capturas.encolados)
			await pagina.evaluate((dato) => window.porDentro.encolar(dato), encolado);
		const claves = await clavesDeLaCola(pagina);
		// La bitácora de la toma falla una vez: el servidor corta la tanda después del registro.
		const [material] = await prueba.consultar("SELECT nombre FROM materiales WHERE id = $1", [capturas.material]);
		prueba.servidor.fallas.bitacoraUnaVez.add(String(material?.nombre));
		const cortada = subida.parse(await pagina.evaluate(() => window.porDentro.subir())).valor;
		expect(cortada).toEqual(expect.objectContaining({ contestados: 1, detenido: true }));
		expect(await clavesDeLaCola(pagina)).toEqual(claves.slice(1));
		expect(subida.parse(await pagina.evaluate(() => window.porDentro.subir())).valor).toEqual(
			expect.objectContaining({ contestados: 2, detenido: false }),
		);
		expect(await vecesEnElServidor(capturas.ids, claves[1] ?? "")).toEqual({ registro: 1, falla: 1, toma: 1 });
		const recibidos = await prueba.consultar(
			"SELECT clave_idempotencia FROM comandos_recibidos WHERE clave_idempotencia = ANY($1::uuid[]) ORDER BY recibido_en, id",
			[claves],
		);
		expect(recibidos.map((fila) => fila.clave_idempotencia)).toEqual(claves);
		await contexto.close();
	});
});
