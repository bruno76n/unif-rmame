/**
 * Prueba de las pantallas de Dirección en el navegador, con la API de prueba y la muestra, en escritorio y en teléfono:
 * Pendientes (la barra, el panel y su filtro en la dirección), Autorizaciones (la tarjeta, «Autorizar», la ventana
 * «Rechazar» y el choque de versión), Indicadores (la comparación en la dirección) y Alertas cruzadas («Ver» solo con
 * el departamento). Guarda las capturas de cada pestaña en `.revision/capturas/direccion/`.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados»)
 */

import type { Page } from "@playwright/test";
import { esEstadoConocido } from "@uniformame/interfaz/estados/colores";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { pedirAjusteDePrueba } from "../../comun/pruebas/autorizaciones-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

describe("Las pantallas de Dirección: se ven como la muestra y cada botón llama a su acción", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await pantalla.servidor.base.dueno.query(texto, valores)).rows;
	}

	/**
	 * Abre una ruta como la dueña, con «Confirmar con Google» reciente: decidir una autorización lo pide.
	 * @param ruta La ruta.
	 * @param tamano Escritorio o teléfono.
	 */
	async function abrirComoLaDuena(ruta: string, tamano: "escritorio" | "telefono" = "escritorio"): Promise<Page> {
		const pagina = await pantalla.abrir(ruta, { quien: "duena", tamano });
		await pagina.setExtraHTTPHeaders({ "x-prueba-quien": "duena", "x-prueba-google": new Date().toISOString() });
		await pagina.reload();
		await enPantalla(pagina.locator("h1")).toHaveText("Dirección");
		return pagina;
	}

	it("Pendientes: la barra, el panel con la autorización por autorizar y el filtro en la dirección", {
		timeout: 90_000,
	}, async () => {
		const pagina = await abrirComoLaDuena("/direccion");
		for (const cifra of ["Ventas", "Producción", "Existencias", "Cuentas por cobrar y pagar"]) {
			await enPantalla(pagina.getByRole("button", { name: new RegExp(cifra) }).first()).toBeVisible();
		}
		const panel = pagina.getByRole("table", { name: "Pendientes" });
		await enPantalla(panel.getByText("Ajuste de inventario")).toBeVisible();
		await enPantalla(panel.getByText("Por autorizar", { exact: true })).toBeVisible();
		// Cada estado del panel es uno de la guía de textos.
		for (const estado of await panel.locator("[data-color]").allInnerTexts()) {
			expect(esEstadoConocido(estado.split("\n")[0] ?? ""), estado).toBe(true);
		}
		// La acción principal: «Autorizar», porque hay una por autorizar.
		await enPantalla(pagina.getByRole("button", { name: "Autorizar", exact: true })).toBeVisible();
		await pantalla.capturar(pagina, "direccion/pendientes-escritorio");
		// El filtro va en la dirección.
		await pagina
			.getByRole("toolbar", { name: "Filtrar pendientes" })
			.getByRole("button", { name: /Alertas/ })
			.click();
		await enPantalla(pagina).toHaveURL(/grupo=alertas/);
		await enPantalla(panel.getByText("Ajuste de inventario")).toHaveCount(0);
		await pagina.close();
		const telefono = await abrirComoLaDuena("/direccion", "telefono");
		await enPantalla(telefono.getByText("Ajuste de inventario")).toBeVisible();
		await pantalla.capturar(telefono, "direccion/pendientes-telefono");
		await telefono.close();
	});

	it("«Revisar» abre Autorizaciones, con la tarjeta de lo que se pide y quién lo pidió", {
		timeout: 90_000,
	}, async () => {
		const pagina = await abrirComoLaDuena("/direccion");
		await pagina.getByRole("table", { name: "Pendientes" }).getByRole("button", { name: "Revisar" }).first().click();
		await enPantalla(pagina).toHaveURL(/\/direccion\/autorizaciones/);
		const [esperando] = await consultar(
			"SELECT resumen FROM autorizaciones WHERE estado = 'por_autorizar' ORDER BY creado_en LIMIT 1",
		);
		const tarjeta = pagina.getByRole("article", { name: String(esperando?.resumen) });
		await enPantalla(tarjeta).toBeVisible();
		await enPantalla(tarjeta.getByText(/^Lo pidió /)).toBeVisible();
		await enPantalla(tarjeta.getByRole("button", { name: "Rechazar" })).toBeEnabled();
		await enPantalla(pagina.getByRole("table", { name: "Resueltas" }).getByText("Rechazado")).toBeVisible();
		await pantalla.capturar(pagina, "direccion/autorizaciones-escritorio");
		await pagina.close();
		const telefono = await abrirComoLaDuena("/direccion/autorizaciones", "telefono");
		await enPantalla(telefono.getByRole("article").first()).toBeVisible();
		await pantalla.capturar(telefono, "direccion/autorizaciones-telefono");
		await telefono.close();
	});

	it("«Rechazar» pide el motivo en su ventana y rechaza con él; el aviso dice el texto que regresa la acción", {
		timeout: 90_000,
	}, async () => {
		const ajuste = await pedirAjusteDePrueba(pantalla, 0);
		const pagina = await abrirComoLaDuena("/direccion/autorizaciones");
		await pagina.getByRole("article", { name: ajuste.resumen }).getByRole("button", { name: "Rechazar" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Rechazar" });
		await enPantalla(ventana.getByText(ajuste.resumen)).toBeVisible();
		const motivo = ventana.getByLabel("Motivo");
		await enPantalla(motivo).toBeFocused();
		const rechazar = ventana.getByRole("button", { name: "Rechazar" });
		await enPantalla(rechazar).toBeDisabled();
		await motivo.fill("No");
		await motivo.blur();
		await enPantalla(ventana.getByText("Escribe el motivo: le llega a quien lo pidió")).toBeVisible();
		await pantalla.capturar(pagina, "direccion/ventana-rechazar");
		await motivo.fill("La playera sí estaba en su lugar");
		await rechazar.click();
		await enPantalla(pagina.getByRole("status").getByText(`${ajuste.ajuste} rechazado`)).toBeVisible();
		await enPantalla(pagina.getByRole("article", { name: ajuste.resumen })).toHaveCount(0);
		const [decidida] = await consultar(
			"SELECT estado, motivo_rechazo, decidida_desde_id IS NOT NULL AS desde FROM autorizaciones WHERE id = $1",
			[ajuste.id],
		);
		expect(decidida).toEqual({ estado: "rechazada", motivo_rechazo: "La playera sí estaba en su lugar", desde: true });
		await pagina.close();
	});

	it("si la autorización cambió mientras se veía, lo dice y la vuelve a leer", { timeout: 90_000 }, async () => {
		const ajuste = await pedirAjusteDePrueba(pantalla, 1);
		const pagina = await abrirComoLaDuena("/direccion/autorizaciones");
		const tarjeta = pagina.getByRole("article", { name: ajuste.resumen });
		await enPantalla(tarjeta).toBeVisible();
		// Otro la toca mientras la dueña la ve: su versión sube.
		await consultar("UPDATE autorizaciones SET detalle = 'Otra vista' WHERE id = $1", [ajuste.id]);
		await tarjeta.getByRole("button", { name: "Autorizar" }).click();
		await enPantalla(
			pagina.getByText(`${ajuste.folio} cambió mientras lo veías. Revisa los cambios y vuelve a guardar`),
		).toBeVisible();
		await enPantalla(tarjeta.getByText("Otra vista")).toBeVisible();
		await pantalla.capturar(pagina, "direccion/autorizaciones-choque");
		await pagina.close();
	});

	it("«Autorizar» decide desde Dirección: el aviso, la tarjeta sale a Resueltas y, sin más, «Autorizar» sale de la barra", {
		timeout: 120_000,
	}, async () => {
		const pagina = await abrirComoLaDuena("/direccion/autorizaciones");
		const tarjetas = pagina.getByRole("article");
		await enPantalla(tarjetas.first()).toBeVisible();
		const cuantas = await tarjetas.count();
		expect(cuantas).toBeGreaterThan(0);
		for (let i = 0; i < cuantas; i++) {
			await tarjetas.first().getByRole("button", { name: "Autorizar" }).click();
			await enPantalla(
				pagina.getByRole("status").getByText(/^AJ-\d+ autorizado: se movió la diferencia$/),
			).toBeVisible();
			await enPantalla(tarjetas).toHaveCount(cuantas - i - 1);
		}
		await enPantalla(pagina.getByText("Nada espera tu autorización")).toBeVisible();
		await enPantalla(pagina.getByRole("table", { name: "Resueltas" }).getByText("Autorizado").first()).toBeVisible();
		await enPantalla(pagina.getByRole("button", { name: "Autorizar", exact: true })).toHaveCount(0);
		const [quedan] = await consultar("SELECT count(*)::int AS n FROM autorizaciones WHERE estado = 'por_autorizar'");
		expect(quedan?.n).toBe(0);
		await pagina.close();
	});

	it("Indicadores: los cuatro paneles, y la comparación cambia en la dirección", { timeout: 90_000 }, async () => {
		const pagina = await abrirComoLaDuena("/direccion/indicadores");
		await enPantalla(pagina.getByRole("region", { name: /^Ventas de la semana del / })).toBeVisible();
		for (const panel of [
			"Ventas por semana, las tres vías",
			"Prendas terminadas por día",
			"Existencia por ubicación",
		]) {
			await enPantalla(pagina.getByRole("region", { name: panel })).toBeVisible();
		}
		await enPantalla(pagina.getByText(/Tienda 1: Sin ventas todavía/)).toBeVisible();
		await pantalla.capturar(pagina, "direccion/indicadores-escritorio");
		await pagina.getByRole("toolbar", { name: "Comparar contra" }).getByRole("button", { name: "Hace un mes" }).click();
		await enPantalla(pagina).toHaveURL(/comparar=hace_un_mes/);
		await enPantalla(pagina.getByText("contra hace un mes")).toBeVisible();
		await pagina.close();
		const telefono = await abrirComoLaDuena("/direccion/indicadores", "telefono");
		await enPantalla(telefono.getByRole("region", { name: "Existencia por ubicación" })).toBeVisible();
		await pantalla.capturar(telefono, "direccion/indicadores-telefono");
		await telefono.close();
	});

	it("Alertas cruzadas: cada tarjeta con lo que cruza; «Ver» lleva al otro departamento y no sale sin él", {
		timeout: 90_000,
	}, async () => {
		const pagina = await abrirComoLaDuena("/direccion/alertas");
		const tarjeta = pagina.getByRole("article").first();
		await enPantalla(tarjeta.getByText(/^Cruza: /)).toBeVisible();
		await pantalla.capturar(pagina, "direccion/alertas-escritorio");
		await tarjeta.getByRole("button", { name: "Ver" }).click();
		await enPantalla(pagina).not.toHaveURL(/\/direccion/);
		await pagina.close();
		// Quien solo tiene Dirección ve las tarjetas sin «Ver».
		const soloDireccion = await pantalla.abrir("/direccion/alertas", { quien: "direccion", tamano: "telefono" });
		await enPantalla(soloDireccion.getByRole("article").first()).toBeVisible();
		await enPantalla(soloDireccion.getByRole("button", { name: "Ver" })).toHaveCount(0);
		await pantalla.capturar(soloDireccion, "direccion/alertas-telefono");
		await soloDireccion.close();
	});

	it("si la consulta falla dice «No se pudo cargar. Intenta otra vez», y una cuenta sin Dirección no entra", {
		timeout: 90_000,
	}, async () => {
		const pagina = await abrirComoLaDuena("/direccion/indicadores");
		let fallar = true;
		await pagina.route("**/v1/consultas/direccion.indicadores**", (ruta) =>
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
		fallar = false;
		await pagina.getByRole("button", { name: "Reintentar" }).click();
		await enPantalla(pagina.getByRole("region", { name: "Existencia por ubicación" })).toBeVisible();
		await pagina.close();
		const ventas = await pantalla.abrir("/direccion", { quien: "ventas" });
		await enPantalla(ventas.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await ventas.close();
	});
});
