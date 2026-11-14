/**
 * Prueba del cambio de llave de la tablet cuando se pierde la respuesta de `admin.rotar_llave`, en un Chrome de tablet
 * Android contra la API real: si el cambio se aplicó, la siguiente llamada entra con la nueva y la deja; si no llegó, la
 * API no conoce la nueva y la tablet sigue con la vieja.
 * Fase 20 · docs/apps/tablet.md («El registro», paso 6) y docs/modulos/admin/dispositivos.md («`admin.rotar_llave`»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levantarTablet, type TabletDePrueba, tabletLista } from "../pruebas/tablet-de-prueba.ts";

describe("el cambio de llave sin saber si se aplicó", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	/**
	 * Las llaves con que bajó la tablet, en orden.
	 * @param pagina La tablet.
	 */
	function llavesDeBajada(pagina: Page): string[] {
		const llaves: string[] = [];
		pagina.on("request", (pedido) => {
			if (pedido.url().includes("/v1/sync/bajar")) llaves.push(pedido.headers().authorization ?? "");
		});
		return llaves;
	}

	/** Le toca cambiar su llave a la tablet más nueva, o ya no. */
	async function tocaRotar(toca: boolean): Promise<void> {
		await prueba.consultar(
			`UPDATE dispositivos SET llave_rotada_en = ${toca ? "now() - interval '200 days'" : "now()"}
			 WHERE id = (SELECT id FROM dispositivos WHERE tipo = 'tablet_taller' ORDER BY creado_en DESC LIMIT 1)`,
		);
	}

	/**
	 * Si la tablet guarda un secreto nuevo sin confirmar.
	 * @param pagina La tablet.
	 */
	async function tieneNueva(pagina: Page): Promise<boolean> {
		return (await pagina.evaluate(() => window.porDentro.todo())).includes("secreto_nuevo");
	}

	it("se aplicó y se perdió la respuesta: la siguiente llamada entra con la nueva y se queda con ella", async () => {
		const { pagina, contexto } = await tabletLista(prueba);
		const llaves = llavesDeBajada(pagina);
		await tocaRotar(true);
		await pagina.route("**/v1/acciones/admin.rotar_llave", async (ruta) => {
			await ruta.fetch();
			await ruta.abort("connectionreset");
		});
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toEqual({ ok: false, error: "sin_internet" });
		await pagina.unroute("**/v1/acciones/admin.rotar_llave");
		expect(await tieneNueva(pagina)).toBe(true);
		const vieja = llaves.at(-1);
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toEqual({ ok: true, valor: undefined });
		expect(await tieneNueva(pagina)).toBe(false);
		expect(llaves.at(-1)).not.toBe(vieja);
		const nueva = llaves.at(-1);
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toMatchObject({ ok: true });
		expect(llaves.at(-1)).toBe(nueva);
		await contexto.close();
	});

	it("no llegó: la API no conoce la nueva, la tablet sigue con la vieja y olvida la nueva", async () => {
		const { pagina, contexto } = await tabletLista(prueba);
		const llaves = llavesDeBajada(pagina);
		await tocaRotar(true);
		await pagina.route("**/v1/acciones/admin.rotar_llave", (ruta) => ruta.abort("connectionreset"));
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toEqual({ ok: false, error: "sin_internet" });
		await pagina.unroute("**/v1/acciones/admin.rotar_llave");
		const vieja = llaves.at(-1);
		expect(await tieneNueva(pagina)).toBe(true);
		await tocaRotar(false);
		expect(await pagina.evaluate(() => window.porDentro.bajar())).toMatchObject({ ok: true });
		expect(await tieneNueva(pagina)).toBe(false);
		expect(llaves.at(-1)).toBe(vieja);
		await contexto.close();
	});
});
