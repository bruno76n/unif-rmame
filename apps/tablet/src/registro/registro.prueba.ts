/**
 * Prueba del registro de la tablet, en un Chrome de tablet Android contra la API real: canjea su código, guarda su
 * secreto cifrado con una llave que no se puede exportar, baja su foto con los hashes de los PIN cifrados, y en nada de
 * lo que guarda están el secreto ni un hash en claro. Un código que no sirve regresa el mensaje de la API.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «La tablet registrada guarda su secreto y
 * los hashes cifrados…») y docs/apps/tablet.md («El registro»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { levantarTablet, personaConPin, type TabletDePrueba } from "../pruebas/tablet-de-prueba.ts";

describe("la tablet registrada guarda su secreto y los hashes cifrados", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("la tablet registrada guarda su secreto y los hashes cifrados: ni el secreto ni un hash están en claro", async () => {
		const { personaId } = await personaConPin(prueba);
		const { pagina, contexto } = await prueba.abrir();
		// El secreto viaja una sola vez, al canjear: la prueba lo toma de ahí para buscarlo en lo guardado.
		const canje = pagina.waitForRequest((pedido) => pedido.url().endsWith("/v1/dispositivos/canjear"));
		const registro = await pagina.evaluate((codigo) => window.porDentro.registrar(codigo), await prueba.codigo());
		expect(registro).toEqual({ registrada: true });
		const { datos } = z
			.object({ datos: z.object({ secreto: z.string(), tipo: z.string(), aparato: z.string() }) })
			.parse((await canje).postDataJSON());
		expect(datos).toMatchObject({ tipo: "tablet_taller", aparato: expect.stringMatching(/^Android /) });
		expect(datos.secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("preparando");
		expect(await pagina.evaluate(() => window.porDentro.bajarFoto())).toMatchObject({ ok: true });
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("lista");
		// Bajó el PIN de la persona, con su hash cifrado.
		const pines = z
			.array(z.object({ persona_id: z.uuid(), pin_hash: z.object({ iv: z.string(), datos: z.string() }) }))
			.parse(await pagina.evaluate(() => window.porDentro.leer("pines")));
		expect(pines.map((pin) => pin.persona_id)).toContain(personaId);
		const [{ pin_hash: hash } = { pin_hash: "" }] = await prueba.consultar(
			"SELECT pin_hash FROM pines WHERE persona_id = $1",
			[personaId],
		);
		const todo = await pagina.evaluate(() => window.porDentro.todo());
		expect(todo).not.toContain(datos.secreto);
		expect(todo).not.toContain(String(hash));
		expect(todo).not.toContain("$argon2id$");
		expect(await pagina.evaluate(() => window.porDentro.llaveExportable())).toBe(false);
		await contexto.close();
	});

	it("un código que no sirve regresa el mensaje de la API y la tablet sigue sin registro", async () => {
		const { pagina, contexto } = await prueba.abrir();
		expect(await pagina.evaluate(() => window.porDentro.registrar("ZZZ-999"))).toEqual({
			registrada: false,
			mensaje: "Ese código no existe o ya venció. Pide otro a la dueña.",
		});
		expect(await pagina.evaluate(() => window.porDentro.estadoDelAparato())).toBe("sin_registro");
		await contexto.close();
	});
});
