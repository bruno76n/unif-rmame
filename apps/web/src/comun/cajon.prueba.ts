/**
 * Prueba del cajón con cambios sin guardar, sobre el «Nuevo pedido» de Ventas a externos: cerrarlo, cambiar de pestaña
 * o salir por el menú pregunta «Tienes cambios sin guardar. ¿Salir sin guardar?»; «Volver» deja todo como estaba y
 * «Salir sin guardar» sí sale.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Un cajón con cambios sin guardar pregunta antes de cerrarse, de
 * cambiar de pestaña o de salir por el menú»), decisión 748
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, it } from "vitest";
import { enPantalla } from "../../../../pruebas/navegador/en-pantalla.ts";
import { levantarPantalla, type PantallaDePrueba } from "./pruebas/pantalla-de-prueba.ts";

/** La pregunta de la guía de textos. */
const pregunta = "Tienes cambios sin guardar. ¿Salir sin guardar?";

describe("Un cajón con cambios sin guardar pregunta antes de cerrarse, de cambiar de pestaña o de salir por el menú", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Abre «Nuevo pedido» como la dueña y escoge un cliente: ya hay un cambio sin guardar. */
	async function conCambios(): Promise<Page> {
		const pagina = await pantalla.abrir("/ventas/pedidos", { quien: "duena" });
		await pagina.getByRole("button", { name: "Nuevo pedido" }).first().click();
		const cajon = pagina.getByRole("dialog");
		await cajon.getByLabel("Cliente").selectOption({ label: "Colegio Morelos" });
		return pagina;
	}

	it("cerrar el cajón pregunta; «Volver» lo deja abierto con lo escrito", { timeout: 90_000 }, async () => {
		const pagina = await conCambios();
		const cajon = pagina.getByRole("dialog").first();
		await cajon.getByRole("button", { name: "Cerrar" }).click();
		await enPantalla(pagina.getByText(pregunta)).toBeVisible();
		await pantalla.capturar(pagina, "comun/cajon-pregunta");
		await pagina.getByRole("button", { name: "Volver" }).click();
		await enPantalla(pagina.getByText(pregunta)).toBeHidden();
		await enPantalla(cajon.getByLabel("Cliente")).toHaveValue(/.+/);
		await pagina.close();
	});

	/** Toca un punto de la pantalla, como la persona: con el cajón abierto, lo de atrás queda bajo su fondo. */
	async function tocarDondeEsta(pagina: Page, selector: string, texto: string): Promise<void> {
		const caja = await pagina.locator(selector, { hasText: texto }).first().boundingBox();
		if (caja === null) throw new Error(`no se ve ${texto}`);
		await pagina.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
	}

	it("tocar otra pestaña pregunta; «Volver» se queda en la pestaña con el cajón", { timeout: 90_000 }, async () => {
		const pagina = await conCambios();
		await tocarDondeEsta(pagina, "[role='tab']", "Notas");
		await enPantalla(pagina.getByText(pregunta)).toBeVisible();
		await pagina.getByRole("button", { name: "Volver" }).click();
		await enPantalla(pagina).toHaveURL(/\/ventas\/pedidos/);
		await enPantalla(pagina.getByRole("dialog").first().getByLabel("Cliente")).toBeVisible();
		await pagina.close();
	});

	it("tocar el menú pregunta; «Salir sin guardar» cierra el cajón y el menú ya lleva a otro departamento", {
		timeout: 90_000,
	}, async () => {
		const pagina = await conCambios();
		await tocarDondeEsta(pagina, "nav[aria-label='Departamentos'] button", "Producción");
		await enPantalla(pagina.getByText(pregunta)).toBeVisible();
		await pagina.getByRole("button", { name: "Salir sin guardar" }).click();
		await enPantalla(pagina.getByRole("dialog")).toHaveCount(0);
		await pagina
			.getByRole("navigation", { name: "Departamentos" })
			.getByRole("button", { name: /Producción/ })
			.click();
		await enPantalla(pagina.locator("h1")).toHaveText("Producción");
		await pagina.close();
	});

	it("salir con «atrás» del navegador pregunta, y «Volver» se queda", { timeout: 90_000 }, async () => {
		const pagina = await conCambios();
		const antes = pagina.url();
		await pagina.goBack();
		await enPantalla(pagina.getByText(pregunta)).toBeVisible();
		await pagina.getByRole("button", { name: "Volver" }).click();
		await enPantalla(pagina).toHaveURL(antes);
		await enPantalla(pagina.getByRole("dialog").first().getByLabel("Cliente")).toBeVisible();
		await pagina.close();
	});
});
