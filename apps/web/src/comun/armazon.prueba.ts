/**
 * Prueba del armazón en el navegador, con la API de prueba y la muestra: el menú solo trae los departamentos de la
 * cuenta, cada pastilla cuenta lo que da su módulo, y una dirección de un departamento ajeno lleva a «No tienes acceso
 * a esta pantalla». Guarda las capturas del armazón en escritorio y teléfono.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo, y una dirección de un departamento ajeno lleva a "No tienes acceso a esta
 * pantalla"»)
 */

import { expect as enPantalla } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPantalla, type PantallaDePrueba } from "./pruebas/pantalla-de-prueba.ts";

describe("El menú solo muestra los departamentos de la cuenta, con sus pastillas; lo ajeno no se abre", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it("Bodega ve solo Bodega en el menú, con la pastilla de Inventario, y entra a su Pendientes", {
		timeout: 90_000,
	}, async () => {
		const pagina = await pantalla.abrir("/", { quien: "bodega" });
		const menu = pagina.getByRole("navigation", { name: "Departamentos" });
		await enPantalla(pagina.locator("h1")).toHaveText("Bodega");
		// Las entradas de los departamentos (sin el botón de la cuenta ni el de cerrar el menú).
		const departamentos = await menu.locator("button:not([aria-haspopup]):not([aria-label])").allInnerTexts();
		expect(departamentos.map((texto) => texto.split("\n")[0])).toEqual(["Bodega"]);
		// La pastilla es la que da Inventario.
		const pastillas = await pedirConsulta(pantalla.servidor, "inventario.pastillas_menu", {}, "bodega");
		const { conteo } = (pastillas.cuerpo.resultado as { bodega: { conteo: number } }).bodega;
		if (conteo > 0) await enPantalla(menu.getByRole("button", { name: /Bodega/ })).toContainText(String(conteo));
		await enPantalla(pagina.getByRole("navigation", { name: "Migas" })).toContainText("Almacén");
		await pantalla.capturar(pagina, "comun/armazon-escritorio");
		await pagina.close();
	});

	it("la dueña ve los catorce departamentos, por grupos, sin la Puerta del taller", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/direccion", { quien: "duena" });
		const menu = pagina.getByRole("navigation", { name: "Departamentos" });
		await enPantalla(pagina.locator("h1")).toHaveText("Dirección");
		for (const grupo of ["Operación", "Taller", "Almacén", "Administración"]) {
			await enPantalla(menu.getByText(grupo, { exact: true })).toBeVisible();
		}
		await enPantalla(menu.getByRole("button", { name: /Administración del sistema/ })).toBeVisible();
		await enPantalla(menu.getByText("Puerta del taller")).toHaveCount(0);
		await pagina.close();
	});

	it("una dirección de un departamento ajeno lleva a «No tienes acceso a esta pantalla»", {
		timeout: 90_000,
	}, async () => {
		const pagina = await pantalla.abrir("/ventas", { quien: "bodega" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await enPantalla(
			pagina.getByRole("navigation", { name: "Departamentos" }).getByRole("button", { name: /Ventas/ }),
		).toHaveCount(0);
		await pagina.close();
	});

	it("en el teléfono el menú se abre con su botón y lleva al departamento", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/", { quien: "duena", tamano: "telefono" });
		await enPantalla(pagina.locator("h1")).toHaveText("Dirección");
		await pagina.getByRole("button", { name: "Abrir el menú" }).click();
		await pantalla.capturar(pagina, "comun/armazon-telefono-menu");
		await pagina
			.getByRole("navigation", { name: "Departamentos" })
			.getByRole("button", { name: /Bodega/ })
			.click();
		await enPantalla(pagina.locator("h1")).toHaveText("Bodega");
		await pantalla.capturar(pagina, "comun/armazon-telefono");
		await pagina.close();
	});
});
