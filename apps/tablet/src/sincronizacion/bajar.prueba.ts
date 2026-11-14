/**
 * Prueba de bajar, en un Chrome de tablet Android contra la API real con la muestra: la foto y la bajada llegan por
 * páginas y aplican cambios y quitados; la foto no toca la cola ni lo que nació en la tablet; y un registro que
 * Producción cancela se ve cancelado en la tablet.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «La bajada aplica cambios y quitados por
 * página, la foto no toca la cola, y un registro cancelado en Producción se ve cancelado») y docs/apps/tablet.md
 * («Cómo baja»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba } from "../../../api/src/nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import {
	bajarHasta,
	bultoEnProceso,
	levantarTablet,
	personaConPin,
	registroDeOperacion,
	type TabletDePrueba,
	tabletLista,
} from "../pruebas/tablet-de-prueba.ts";

/** Un renglón de la copia, como lo da la tablet. */
const renglon = z.object({ id: z.uuid() }).catchall(z.unknown());

describe("la bajada aplica cambios y quitados por página; la foto no toca la cola; lo cancelado se ve cancelado", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
		// Páginas chicas: la foto y la bajada llegan en varias.
		await prueba.consultar("UPDATE parametros SET valor_entero = 7 WHERE clave = 'sync.pagina_max_renglones'");
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("la bajada aplica cambios y quitados por página: una máquina que cambia de nombre y una que se da de baja", async () => {
		const { pagina, contexto } = await prueba.abrir();
		const fotos: string[] = [];
		pagina.on("request", (pedido) => {
			if (pedido.url().includes("/v1/sync/foto")) fotos.push(pedido.url());
		});
		await pagina.evaluate((codigo) => window.porDentro.registrar(codigo), await prueba.codigo());
		expect(await pagina.evaluate(() => window.porDentro.bajarFoto())).toMatchObject({ ok: true });
		expect(fotos.length).toBeGreaterThan(2);
		const maquinas = await prueba.consultar("SELECT id FROM maquinas WHERE baja_en IS NULL ORDER BY folio LIMIT 2");
		const [cambia, sale] = maquinas.map((fila) => z.uuid().parse(fila.id));
		await prueba.consultar("UPDATE maquinas SET nombre = 'Recta Juki nueva' WHERE id = $1", [cambia]);
		await prueba.consultar(
			"UPDATE maquinas SET baja_en = now(), baja_por = $2, motivo_baja = 'Se vendió' WHERE id = $1",
			[sale, cuentaDePrueba("duena")],
		);
		const bajadas: string[] = [];
		pagina.on("request", (pedido) => {
			if (pedido.url().includes("/v1/sync/bajar")) bajadas.push(pedido.url());
		});
		const maquinasLocales = async () =>
			z.array(renglon).parse(await pagina.evaluate(() => window.porDentro.leer("maquinas")));
		await bajarHasta(pagina, async () => (await maquinasLocales()).every((maquina) => maquina.id !== sale));
		expect(bajadas.length).toBeGreaterThan(0);
		const locales = await maquinasLocales();
		expect(locales.find((maquina) => maquina.id === cambia)).toMatchObject({ nombre: "Recta Juki nueva" });
		expect(locales.find((maquina) => maquina.id === sale)).toBeUndefined();
		await contexto.close();
	});

	it("la foto no toca la cola ni lo que nació en la tablet y todavía no regresa", async () => {
		const { pagina, contexto } = await tabletLista(prueba);
		const { personaId } = await personaConPin(prueba);
		const bulto = await bultoEnProceso(prueba);
		const id = uuidv7();
		await pagina.evaluate(
			(encolado) => window.porDentro.encolar(encolado),
			registroDeOperacion({
				id,
				bultoId: bulto.bultoId,
				flujoOperacionId: bulto.flujoOperacionId,
				personaId,
				buenas: 3,
			}),
		);
		expect(await pagina.evaluate(() => window.porDentro.bajarFoto())).toMatchObject({ ok: true });
		expect(await pagina.evaluate(() => window.porDentro.cola())).toHaveLength(1);
		const registros = z.array(renglon).parse(await pagina.evaluate(() => window.porDentro.leer("registros_operacion")));
		expect(registros.find((registro) => registro.id === id)).toMatchObject({ _local: "guardada", piezas_buenas: 3 });
		await contexto.close();
	});

	it("un registro cancelado en Producción se ve cancelado en la tablet", async () => {
		const { pagina, contexto } = await tabletLista(prueba);
		const { personaId } = await personaConPin(prueba);
		const bulto = await bultoEnProceso(prueba, 1);
		const id = uuidv7();
		await pagina.evaluate(
			(encolado) => window.porDentro.encolar(encolado),
			registroDeOperacion({
				id,
				bultoId: bulto.bultoId,
				flujoOperacionId: bulto.flujoOperacionId,
				personaId,
				buenas: 2,
			}),
		);
		expect(await pagina.evaluate(() => window.porDentro.subir())).toMatchObject({ ok: true });
		const [{ version } = {}] = await prueba.consultar("SELECT version FROM registros_operacion WHERE id = $1", [id]);
		const cancelado = await mandarAccion(
			prueba.servidor,
			"produccion.cancelar_registro",
			{ datos: { registro_id: id, motivo: "Se contó dos veces" }, version: Number(version) },
			"produccion",
		);
		expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
		const suyoEnLaTablet = async () =>
			z
				.array(renglon)
				.parse(await pagina.evaluate(() => window.porDentro.leer("registros_operacion")))
				.find((registro) => registro.id === id);
		await bajarHasta(pagina, async () => (await suyoEnLaTablet())?.estado === "cancelado");
		const suyo = await suyoEnLaTablet();
		expect(suyo).toMatchObject({ estado: "cancelado", piezas_buenas: 2 });
		expect(suyo?._local).toBeUndefined();
		await contexto.close();
	});
});
