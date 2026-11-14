/**
 * Prueba del encabezado de la tablet y de la sesión de la persona, en un Chrome de tablet Android contra la API real:
 * con alguien adentro dice su nombre de pila y «Salir»; la red dice «Conectada» o «Sin internet»; y a los segundos de
 * `personal.tablet_inactividad_seg` sin tocar la pantalla la sesión se cierra sola y regresa a «¿Quién eres?», pero no
 * mientras la persona la sigue tocando.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «La sesión de la persona se cierra sola a
 * los segundos del parámetro») y docs/interfaz/tablet.md («El encabezado»)
 */

import { expect as enPantalla } from "@playwright/test";
import { afterAll, beforeAll, describe, it } from "vitest";
import { levantarTablet, personaDeBaseConPin, type TabletDePrueba } from "../pruebas/tablet-de-prueba.ts";

/** Lo que tarda una pantalla en llegar: la foto completa baja al registrar. */
const espera = { timeout: 30_000 };

describe("el encabezado y la sesión de la persona", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
		// Tres segundos sin tocar la pantalla, para no esperar los 90 del valor inicial.
		await prueba.consultar("UPDATE parametros SET valor_entero = 3 WHERE clave = 'personal.tablet_inactividad_seg'");
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("la sesión de la persona se cierra sola a los segundos del parámetro, y no mientras toca la pantalla", async () => {
		const { nombre, pin } = await personaDeBaseConPin(prueba);
		const pila = nombre.split(" ")[0] ?? nombre;
		const { pagina, contexto } = await prueba.abrir("/");
		await pagina.getByLabel("Escribe el código que te dio la dueña").fill(await prueba.codigo(), espera);
		await pagina.getByRole("button", { name: "Registrar" }).click();
		await pagina.getByRole("button", { name: nombre }).click(espera);
		for (const cifra of pin) await pagina.getByRole("button", { name: cifra, exact: true }).click();
		const encabezado = pagina.getByRole("banner");
		await enPantalla(encabezado.getByText(pila, { exact: true })).toBeVisible();
		await enPantalla(encabezado.getByRole("button", { name: "Salir" })).toBeVisible();
		await enPantalla(encabezado.getByText("Conectada")).toBeVisible();
		// Mientras toca la pantalla, sigue adentro.
		for (let vez = 0; vez < 4; vez++) {
			await pagina.waitForTimeout(1000);
			await pagina.mouse.click(5, 300);
		}
		await enPantalla(pagina.getByText("Hoy llevas")).toBeVisible();
		// Sin tocarla, a los tres segundos regresa a «¿Quién eres?» y el encabezado ya no dice quién.
		await enPantalla(pagina.getByRole("heading", { name: "¿Quién eres?" })).toBeVisible({ timeout: 6000 });
		await enPantalla(encabezado.getByRole("button", { name: "Salir" })).toHaveCount(0);
		await contexto.setOffline(true);
		await enPantalla(encabezado.getByText("Sin internet")).toBeVisible(espera);
		await contexto.close();
	});
});
