/**
 * Prueba del aparato, con Playwright en un Chrome de tablet Android contra la API real: revocada, la tablet deja de bajar
 * y sigue subiendo su cola hasta vaciarla; con `426` deja de subir, su cola espera en la base y, con la versión nueva,
 * sube todo sin perder nada.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Revocada, la tablet deja de bajar y sube
 * su cola hasta vaciarla; con `426` se actualiza sin perder su cola») y docs/apps/tablet.md («El registro», paso 7, y
 * «Cómo se actualiza»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import {
	capturasDePrueba,
	levantarTablet,
	personaConPin,
	type TabletDePrueba,
	tabletLista,
} from "../pruebas/tablet-de-prueba.ts";

describe("el aparato revocado y la versión vieja", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("revocada, la tablet deja de bajar y sube su cola hasta vaciarla", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const capturas = await capturasDePrueba(prueba, personaId, 5);
		for (const encolado of capturas.encolados)
			await pagina.evaluate((dato) => window.porDentro.encolar(dato), encolado);
		const [aparato] = await prueba.consultar(
			"SELECT id, version FROM dispositivos WHERE tipo = 'tablet_taller' ORDER BY creado_en DESC LIMIT 1",
		);
		const revocado = await mandarAccion(
			prueba.servidor,
			"admin.revocar_dispositivo",
			{
				datos: { dispositivo_id: z.uuid().parse(aparato?.id), motivo: "Se perdió la tablet", anular_pines: false },
				version: Number(aparato?.version),
			},
			"duena",
			conGoogle(),
		);
		expect(revocado.estado, JSON.stringify(revocado.cuerpo)).toBe(200);
		const llamadas: string[] = [];
		pagina.on("request", (pedido) => llamadas.push(new URL(pedido.url()).pathname));
		await pagina.evaluate(() => window.porDentro.motor.sincronizar());
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("revocada");
		expect(await pagina.evaluate(() => window.porDentro.cola())).toEqual([]);
		await pagina.evaluate(() => window.porDentro.motor.sincronizar());
		expect(llamadas.filter((ruta) => ruta === "/v1/sync/subir")).toHaveLength(1);
		expect(llamadas.filter((ruta) => ruta.startsWith("/v1/sync/bajar") || ruta.startsWith("/v1/sync/foto"))).toEqual(
			[],
		);
		// Lo que pasó antes de revocarla no se perdió: quedó retenido para que la dueña lo aplique.
		const [retenidos] = await prueba.consultar(
			"SELECT count(*)::int AS n FROM comandos_recibidos WHERE dispositivo_id = $1 AND dispositivo_revocado",
			[aparato?.id],
		);
		expect(retenidos?.n).toBe(3);
		await contexto.close();
	});

	it("con 426 deja de subir y su cola espera; con la versión nueva sube todo sin perder nada", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await tabletLista(prueba);
		const capturas = await capturasDePrueba(prueba, personaId, 6);
		for (const encolado of capturas.encolados)
			await pagina.evaluate((dato) => window.porDentro.encolar(dato), encolado);
		prueba.servidor.parametros.versionMinima = "2.0.0";
		try {
			await pagina.evaluate(() => window.porDentro.motor.sincronizar());
			expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("actualizar");
			expect(await pagina.evaluate(() => window.porDentro.cola())).toHaveLength(3);
		} finally {
			prueba.servidor.parametros.versionMinima = "1.0.0";
		}
		// La versión nueva: la tablet se recarga, su cola sigue en la base y al arrancar sube todo.
		await pagina.reload();
		await pagina.waitForFunction(() => "porDentro" in window);
		expect(await pagina.evaluate(() => window.porDentro.cola())).toHaveLength(3);
		await pagina.evaluate(() => window.porDentro.motor.arrancar());
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("lista");
		expect(await pagina.evaluate(() => window.porDentro.cola())).toEqual([]);
		const [{ registros } = {}] = await prueba.consultar(
			"SELECT count(*)::int AS registros FROM registros_operacion WHERE id = $1",
			[capturas.ids.registro],
		);
		expect(registros).toBe(1);
		await pagina.evaluate(() => window.porDentro.motor.detener());
		await contexto.close();
	});
});
