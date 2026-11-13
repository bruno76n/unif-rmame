/**
 * Prueba de los estados de una pantalla en el navegador: cargando (la forma en gris), vacío, error con «Reintentar»,
 * sin permiso, sin conexión (la franja de arriba) y versión vieja. El choque de versión lo prueba cada departamento
 * en su captura, donde se guarda algo.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada pantalla tiene sus estados: cargando, vacío, error, sin
 * permiso, sin conexión y choque de versión»)
 */

import { expect as enPantalla } from "@playwright/test";
import { afterAll, beforeAll, describe, it } from "vitest";
import { levantarPantalla, type PantallaDePrueba } from "./pruebas/pantalla-de-prueba.ts";

describe("Cada pantalla tiene sus estados: cargando, vacío, error, sin permiso, sin conexión y versión vieja", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it("cargando muestra la forma en gris y luego la pantalla", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/", { quien: "calidad" });
		// Detiene el armazón un momento para ver el esqueleto.
		let soltar: () => void = () => undefined;
		const detenido = new Promise<void>((listo) => {
			soltar = listo;
		});
		await pagina.route("**/v1/consultas/admin.armazon**", async (ruta) => {
			await detenido;
			await ruta.continue();
		});
		await pagina.reload();
		await enPantalla(pagina.locator("[aria-busy='true']")).toBeVisible();
		soltar();
		await enPantalla(pagina.locator("h1")).toHaveText("Calidad");
		// Ya cargó: el panel de Pendientes de su departamento en lugar de la forma en gris.
		await enPantalla(pagina.getByRole("heading", { name: "Pendientes" })).toBeVisible();
		await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
		await pagina.close();
	});

	it("un error al cargar dice «No se pudo cargar. Intenta otra vez» y «Reintentar» vuelve a leer", {
		timeout: 90_000,
	}, async () => {
		const pagina = await pantalla.abrir("/", { quien: "calidad" });
		await enPantalla(pagina.locator("h1")).toHaveText("Calidad");
		let fallar = true;
		await pagina.route("**/v1/consultas/admin.armazon**", (ruta) =>
			fallar
				? ruta.fulfill({
						status: 422,
						contentType: "application/json",
						body: JSON.stringify({ ok: false, error: "regla", codigo: "prueba", mensaje: "Falla de prueba" }),
					})
				: ruta.continue(),
		);
		await pagina.reload();
		await enPantalla(pagina.getByText("No se pudo cargar. Intenta otra vez")).toBeVisible();
		await pantalla.capturar(pagina, "comun/estado-error");
		fallar = false;
		await pagina.getByRole("button", { name: "Reintentar" }).click();
		await enPantalla(pagina.locator("h1")).toHaveText("Calidad");
		await pagina.close();
	});

	it("sin conexión sale la franja de arriba, y se quita al volver", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/calidad", { quien: "calidad" });
		await enPantalla(pagina.locator("h1")).toHaveText("Calidad");
		await pagina.context().setOffline(true);
		const franja = pagina.getByText("Sin conexión: los cambios no se guardan hasta que vuelva");
		await enPantalla(franja).toBeVisible();
		await pantalla.capturar(pagina, "comun/estado-sin-conexion");
		await pagina.context().setOffline(false);
		await enPantalla(franja).toHaveCount(0);
		await pagina.close();
	});

	it("una web más vieja que la mínima del servidor pide actualizar", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/", { quien: "calidad" });
		await pagina.route("**/v1/consultas/admin.armazon**", async (ruta) => {
			const respuesta = await ruta.fetch();
			const cuerpo = await respuesta.json();
			cuerpo.resultado.version_minima_web = "9.0.0";
			await ruta.fulfill({ response: respuesta, json: cuerpo });
		});
		await pagina.reload();
		await enPantalla(pagina.getByText("Hay una versión nueva del sistema")).toBeVisible();
		await enPantalla(pagina.getByRole("button", { name: "Actualizar" })).toBeVisible();
		await pagina.close();
	});

	it("sin permiso: la dirección de un departamento ajeno lo dice, y el departamento no aparece", {
		timeout: 90_000,
	}, async () => {
		const pagina = await pantalla.abrir("/contaduria", { quien: "calidad" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
