/**
 * Prueba de la pestaña Nómina en el navegador: lo que se ve es lo que se paga (el total que muestra la pantalla es el que
 * manda «Pagar nómina» y con el que la API la paga), y si la cuenta cambió mientras se veía, no se paga y la pantalla
 * vuelve a leer lo nuevo.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Lo que se ve en la nómina es lo que se paga, y si cambió mientras
 * se veía no se paga») y docs/interfaz/fabrica/contaduria.md («Nómina»)
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import {
	personaDeNomina,
	registroDeNomina,
	semanaConNomina,
} from "../../../../api/src/nucleo/pruebas/nomina-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 120_000 };

/** Lo que se lee de la nómina de una semana. */
const nomina = z.object({ total_nomina_centavos: z.number(), nomina: z.object({ estado: z.string() }) });

describe("Lo que se ve en la nómina es lo que se paga", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/**
	 * Abre la nómina de una semana como Contaduría con «ven sueldos y tarifas», ya confirmada con Google.
	 * @param semanaId La semana.
	 */
	async function abrir(semanaId: string): Promise<Page> {
		const pagina = await pantalla.abrir(`/contaduria/nomina?semana=${semanaId}`, { quien: "contaduria_sueldos" });
		await pagina.setExtraHTTPHeaders({
			"x-prueba-quien": "contaduria_sueldos",
			"x-prueba-google": new Date().toISOString(),
		});
		return pagina;
	}

	/** La nómina de una semana, como la da la API. */
	async function laNomina(semanaId: string) {
		const pedida = await pedirConsulta(
			pantalla.servidor,
			"contaduria.nomina_semana",
			{ asistencia_semana_id: semanaId },
			"contaduria_sueldos",
		);
		return nomina.parse(pedida.cuerpo.resultado);
	}

	it("el total que se ve es el que viaja en «Pagar nómina», y con él queda pagada", espera, async () => {
		const semana = await semanaConNomina(pantalla.servidor, "2025-03-03");
		const persona = await personaDeNomina(pantalla.servidor, {
			nombre: "Costurera de la Pantalla",
			formaPago: "pieza",
		});
		await registroDeNomina(pantalla.servidor, {
			personaId: persona,
			fecha: "2025-03-04",
			buenas: 200,
			tarifaCentavos: 150,
		});
		const vista = await laNomina(semana.semanaId);
		const pagina = await abrir(semana.semanaId);
		await enPantalla(pagina.getByText(enPesos(vista.total_nomina_centavos)).first()).toBeVisible();
		await enPantalla(pagina.getByText("La consulta de la nómina queda registrada en la bitácora")).toBeVisible();
		await pantalla.capturar(pagina, "contaduria/nomina-escritorio");
		const pedida = pagina.waitForRequest((suya) => suya.url().includes("/v1/acciones/contaduria.pagar_nomina"));
		const respuesta = pagina.waitForResponse((suya) => suya.url().includes("/v1/acciones/contaduria.pagar_nomina"));
		await pagina.getByRole("button", { name: "Pagar nómina" }).click();
		const cuerpo = z
			.object({ datos: z.object({ total_visto_centavos: z.number() }) })
			.parse((await pedida).postDataJSON());
		expect(cuerpo.datos.total_visto_centavos).toBe(vista.total_nomina_centavos);
		expect((await respuesta).status()).toBe(200);
		await enPantalla(pagina.locator("[role=status]", { hasText: /^Nómina del .+ pagada$/ })).toBeVisible();
		await enPantalla(pagina.getByText(/^Pagada el /)).toBeVisible();
		expect((await laNomina(semana.semanaId)).nomina.estado).toBe("pagada");
		await pagina.close();
	});

	it("si la cuenta cambió mientras se veía, no se paga y la pantalla vuelve a leer lo nuevo", espera, async () => {
		const semana = await semanaConNomina(pantalla.servidor, "2025-03-10");
		const persona = await personaDeNomina(pantalla.servidor, { nombre: "Cortador de la Pantalla", formaPago: "pieza" });
		await registroDeNomina(pantalla.servidor, {
			personaId: persona,
			fecha: "2025-03-11",
			buenas: 100,
			tarifaCentavos: 100,
		});
		const antes = await laNomina(semana.semanaId);
		const pagina = await abrir(semana.semanaId);
		await enPantalla(pagina.getByText(enPesos(antes.total_nomina_centavos)).first()).toBeVisible();
		// Mientras se ve, llega otro registro: la cuenta ya no da el total que se ve.
		await registroDeNomina(pantalla.servidor, {
			personaId: persona,
			fecha: "2025-03-12",
			buenas: 50,
			tarifaCentavos: 100,
		});
		const despues = await laNomina(semana.semanaId);
		expect(despues.total_nomina_centavos).toBe(antes.total_nomina_centavos + 5_000);
		const respuesta = pagina.waitForResponse((suya) => suya.url().includes("/v1/acciones/contaduria.pagar_nomina"));
		await pagina.getByRole("button", { name: "Pagar nómina" }).click();
		expect((await respuesta).status()).toBe(422);
		await enPantalla(
			pagina.locator("[role=status]", { hasText: /La nómina cambió desde que la abriste/ }),
		).toBeVisible();
		expect((await laNomina(semana.semanaId)).nomina.estado).toBe("por_pagar");
		await enPantalla(pagina.getByText(enPesos(despues.total_nomina_centavos)).first()).toBeVisible();
		await pagina.close();
	});
});
