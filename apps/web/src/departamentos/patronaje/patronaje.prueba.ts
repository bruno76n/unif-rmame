/**
 * Prueba de las pantallas de Patronaje en el navegador, contra los datos de la muestra, en escritorio y en teléfono:
 * cada pestaña se ve con sus datos y su captura para el revisor de diseño; cada botón llama a su acción y el aviso de
 * abajo dice el texto que regresa; la página de la receta (sus errores, pegar desde la hoja de cálculo, «Llenar desde
 * una talla» y salir con cambios); y sus estados (error, sin permiso y choque de versión).
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el texto
 * que regresa», «Cada pantalla tiene sus estados» y «Un cajón con cambios sin guardar pregunta antes de cerrarse, de
 * cambiar de pestaña o de salir por el menú») y docs/interfaz/fabrica/patronaje.md
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Lo que tarda cada caso, con el navegador. */
const tiempo = { timeout: 120_000 };

/**
 * Espera la llamada a una acción y regresa lo que mandó.
 * @param pagina La página.
 * @param accion El nombre de la acción.
 */
function esperarAccion(pagina: Page, accion: string) {
	return pagina.waitForRequest((peticion) => peticion.url().includes(`/v1/acciones/${accion}`));
}

/**
 * El texto del aviso de abajo.
 * @param pagina La página.
 */
function avisoDeAbajo(pagina: Page) {
	// Con un cajón o una ventana abiertos, lo de afuera queda fuera del árbol de accesibilidad: se busca por su forma.
	return pagina.locator('[role="status"][aria-live="polite"] > span:last-child');
}

describe("Las pantallas de Patronaje", () => {
	let pantalla: PantallaDePrueba;
	/** Los ids de las prendas de la muestra, por nombre. */
	const prendas: Record<string, string> = {};
	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id, nombre FROM productos ORDER BY nombre");
		for (const fila of rows) prendas[String(fila.nombre)] ??= String(fila.id);
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it(
		"Pendientes: las tres cifras, la cola con sus estados y el filtro en la dirección, en escritorio y teléfono",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/patronaje", { quien: "patronaje" });
			await enPantalla(pagina.locator("h1")).toHaveText("Patronaje");
			for (const cifra of ["Recetas", "Rendimiento", "Desarrollo de producto"]) {
				await enPantalla(pagina.getByRole("button", { name: new RegExp(`^${cifra}`) }).first()).toBeVisible();
			}
			await enPantalla(pagina.getByText("Sin receta · corte próximo").first()).toBeVisible();
			await enPantalla(pagina.getByText("Esperando aprobación del cliente")).toBeVisible();
			await pantalla.capturar(pagina, "patronaje/pendientes-escritorio");
			await pagina
				.getByRole("toolbar", { name: "Filtrar pendientes" })
				.getByRole("button", { name: /^Muestras/ })
				.click();
			await enPantalla(pagina).toHaveURL(/grupo=muestra/);
			await enPantalla(pagina.getByText("Sin receta · corte próximo")).toHaveCount(0);
			// «Ver desarrollo» abre su cajón por su dirección.
			await pagina.getByRole("button", { name: "Ver desarrollo" }).click();
			await enPantalla(pagina).toHaveURL(/\/patronaje\/desarrollo\?cajon=desarrollo&id=/);
			await enPantalla(pagina.getByRole("dialog").getByText(/^DS-004 · /)).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir("/patronaje", { quien: "patronaje", tamano: "telefono" });
			await enPantalla(telefono.getByText("Sin receta · corte próximo").first()).toBeVisible();
			await pantalla.capturar(telefono, "patronaje/pendientes-telefono");
			await telefono.close();
		},
	);

	it("«Capturar receta» de un pendiente y la acción principal llevan a la página de la receta", tiempo, async () => {
		const pagina = await pantalla.abrir("/patronaje?grupo=recetas", { quien: "patronaje" });
		await pagina.getByRole("button", { name: "Capturar receta" }).nth(1).click();
		await enPantalla(pagina).toHaveURL(/\/patronaje\/recetas\?cajon=receta&id=/);
		await enPantalla(pagina.getByRole("button", { name: "Guardar receta" })).toBeVisible();
		// La acción principal: la ventana para escoger la prenda.
		await pagina.getByRole("button", { name: "Capturar receta" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: "Capturar receta" });
		const prenda = ventana.getByLabel("Prenda");
		const opcion = await prenda
			.locator("option", { hasText: "· Pantalón azul marino ·" })
			.first()
			.getAttribute("value");
		await prenda.selectOption(opcion ?? "");
		await ventana.getByRole("button", { name: "Abrir receta" }).click();
		await enPantalla(pagina).toHaveURL(new RegExp(`cajon=receta&id=${prendas["Pantalón azul marino"]}`));
		await enPantalla(pagina.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
		await pagina.close();
	});

	it("Recetas: los tres grupos, la búsqueda en la dirección, y un renglón abre su receta", tiempo, async () => {
		const pagina = await pantalla.abrir("/patronaje/recetas", { quien: "patronaje" });
		await enPantalla(pagina.getByRole("heading", { name: "Sin receta" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Capturada sin verificar" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Verificada contra corte" })).toBeVisible();
		// Verificada empieza plegada.
		await enPantalla(pagina.getByRole("button", { name: "Abrir Verificada contra corte" })).toBeVisible();
		await pantalla.capturar(pagina, "patronaje/recetas-escritorio");
		await pagina.getByLabel("Buscar").fill("pants");
		await enPantalla(pagina).toHaveURL(/buscar=pants/);
		await enPantalla(pagina.getByText("Pants marino liso")).toBeVisible();
		await pagina.getByLabel("Buscar").fill("ninguna prenda se llama así");
		await enPantalla(pagina.getByText("Ninguna prenda cumple esa búsqueda.")).toBeVisible();
		await pagina.getByLabel("Buscar").fill("");
		await pagina.getByText("Bata blanca de laboratorio con escudo").click();
		await enPantalla(pagina).toHaveURL(
			new RegExp(`cajon=receta&id=${prendas["Bata blanca de laboratorio con escudo"]}`),
		);
		await pagina.close();
		const telefono = await pantalla.abrir("/patronaje/recetas", { quien: "patronaje", tamano: "telefono" });
		await enPantalla(telefono.getByRole("heading", { name: "Sin receta" })).toBeVisible();
		await pantalla.capturar(telefono, "patronaje/recetas-telefono");
		await telefono.close();
	});

	it(
		"la receta con versión: lo que lleva el corte, cambiar pregunta antes de salir, el motivo y «Guardar como versión 2»",
		tiempo,
		async () => {
			const productoId = prendas["Pantalón azul marino"];
			const pagina = await pantalla.abrir(`/patronaje/recetas?cajon=receta&id=${productoId}`, { quien: "patronaje" });
			await enPantalla(pagina.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
			await enPantalla(pagina.getByText("Versión 1 vigente")).toBeVisible();
			await enPantalla(pagina.getByText(/^Con esta receta, el corte L-\d{4}-\d+ de \d+ piezas lleva$/)).toBeVisible();
			await enPantalla(pagina.getByText("Para cortar")).toBeVisible();
			await enPantalla(pagina.getByText("con 6% de desperdicio, estimado")).toBeVisible();
			await pantalla.capturar(pagina, "patronaje/receta-escritorio");
			// Se escribe con la coma, que se vuelve punto, y la cajita conserva el foco mientras se escribe.
			const primera = pagina.getByLabel(/ en metros, talla /).first();
			await primera.fill("");
			await primera.pressSequentially("1,25");
			await enPantalla(primera).toHaveValue("1.25");
			await enPantalla(pagina.getByRole("button", { name: "Guardar como versión 2" })).toBeVisible();
			// Cambiar de pestaña con cambios pregunta antes.
			await pagina.getByRole("tab", { name: /^Pendientes/ }).click();
			const pregunta = pagina.getByRole("dialog", { name: "Tienes cambios sin guardar. ¿Salir sin guardar?" });
			await enPantalla(pregunta).toBeVisible();
			await pregunta.getByRole("button", { name: "Volver" }).click();
			await enPantalla(pagina).toHaveURL(/cajon=receta/);
			// Sin motivo no se guarda: la barra y el aviso lo dicen.
			await pagina.getByRole("button", { name: "Guardar como versión 2" }).click();
			await enPantalla(avisoDeAbajo(pagina)).toHaveText("Escribe el motivo del cambio");
			await enPantalla(pagina.getByRole("alert").filter({ hasText: "Escribe el motivo del cambio" })).toBeVisible();
			await pagina.getByLabel("Motivo del cambio").fill("Más largo en la talla chica");
			const llamada = esperarAccion(pagina, "patronaje.guardar_receta");
			await pagina.getByRole("button", { name: "Guardar como versión 2" }).click();
			const datos = (await llamada).postDataJSON() as { datos: { motivo: string; lineas: unknown[] } };
			expect(datos.datos.motivo).toBe("Más largo en la talla chica");
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(
				"Versión 2 guardada. Los lotes ya cortados conservan la versión 1",
			);
			await enPantalla(pagina.getByText("Versión 2 vigente")).toBeVisible();
			// La versión vieja se ve tal como era.
			await pagina.getByRole("button", { name: "Versión 1" }).click();
			await enPantalla(pagina).toHaveURL(/version=1/);
			await enPantalla(pagina.getByRole("button", { name: "Ver la versión vigente" })).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir(`/patronaje/recetas?cajon=receta&id=${productoId}`, {
				quien: "patronaje",
				tamano: "telefono",
			});
			await enPantalla(telefono.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
			await pantalla.capturar(telefono, "patronaje/receta-telefono");
			await telefono.close();
		},
	);

	it(
		"la receta nueva: lo vacío en rojo con «y {n} más», llenar desde una talla, pegar de la hoja y «Guardar receta»",
		tiempo,
		async () => {
			const productoId = prendas["Bata blanca de laboratorio con escudo"];
			const pagina = await pantalla.abrir(`/patronaje/recetas?cajon=receta&id=${productoId}`, { quien: "patronaje" });
			await enPantalla(pagina.getByText("Receta nueva")).toBeVisible();
			await enPantalla(pagina.getByText("Todavía no hay versión")).toBeVisible();
			await pagina.getByRole("button", { name: "Guardar receta" }).click();
			await enPantalla(
				pagina.getByRole("alert").filter({ hasText: /: faltan \d+ tallas, en metros y \d+ más$/ }),
			).toBeVisible();
			await enPantalla(pagina.locator('input[aria-invalid="true"]').first()).toBeVisible();
			// Llenar la tela desde la talla de en medio.
			await pagina.getByRole("button", { name: "Llenar desde una talla" }).first().click();
			const llenar = pagina.getByRole("dialog", { name: /^Llenar / });
			await llenar.getByLabel(/^Cantidad en esa talla/).fill("1.2");
			await llenar.getByLabel(/^Cuánto sube por talla/).fill("0.05");
			await llenar.getByRole("button", { name: /^Llenar \d+ tallas$/ }).click();
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^.+: \d+ tallas llenas$/);
			await enPantalla(pagina.locator('input[aria-label*=" en metros, talla "][aria-invalid="true"]')).toHaveCount(0);
			// Pegar desde la hoja de cálculo reparte por tallas.
			const primera = pagina.getByLabel(/ en metros, talla /).first();
			await primera.evaluate((cajita, texto) => {
				const datos = new DataTransfer();
				datos.setData("text", texto);
				cajita.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }));
			}, "1,10\t1.15");
			await enPantalla(avisoDeAbajo(pagina)).toHaveText("Valores pegados desde la hoja de cálculo");
			await enPantalla(primera).toHaveValue("1.10");
			await enPantalla(pagina.getByLabel(/ en metros, talla /).nth(1)).toHaveValue("1.15");
			await pagina.getByLabel("Etiqueta tejida de talla, piezas por prenda").fill("1");
			const llamada = esperarAccion(pagina, "patronaje.guardar_receta");
			await pagina.getByRole("button", { name: "Guardar receta" }).click();
			const datos = (await llamada).postDataJSON() as { datos: { lineas: { papel: string }[]; motivo?: string } };
			expect(datos.datos.lineas.map((linea) => linea.papel)).toEqual(["tela_principal", "avio"]);
			expect(datos.datos.motivo).toBeUndefined();
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(
				"Receta guardada como versión 1. Compras ya puede proyectar su tela",
			);
			await enPantalla(pagina.getByText("Versión 1 vigente")).toBeVisible();
			await pagina.close();
		},
	);

	it("Rendimiento: los grupos; una prenda medida abre su cajón por talla y «Abrir receta»", tiempo, async () => {
		const pagina = await pantalla.abrir("/patronaje/rendimiento", { quien: "patronaje" });
		await enPantalla(
			pagina.getByRole("heading", { name: "Tela por pieza: patrón contra lo que se gasta en el tendido" }),
		).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Sin medir en corte" })).toBeVisible();
		await pantalla.capturar(pagina, "patronaje/rendimiento-escritorio");
		await pagina.getByText("Pants marino liso").click();
		await enPantalla(pagina).toHaveURL(new RegExp(`cajon=rendimiento&id=${prendas["Pants marino liso"]}`));
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText(/^Rendimiento · /)).toBeVisible();
		await enPantalla(cajon.getByText("se gasta en el tendido")).toBeVisible();
		await enPantalla(cajon.getByText("Con 1 lote el dato todavía es flojo.")).toBeVisible();
		await enPantalla(cajon.getByRole("heading", { name: "Por talla" })).toBeVisible();
		await pantalla.capturar(pagina, "patronaje/cajon-rendimiento-escritorio");
		await cajon.getByRole("button", { name: "Abrir receta" }).click();
		await enPantalla(pagina).toHaveURL(new RegExp(`cajon=receta&id=${prendas["Pants marino liso"]}`));
		await enPantalla(pagina.getByRole("heading", { name: "Patrón contra corte, por talla" })).toBeVisible();
		await pagina.close();
		const telefono = await pantalla.abrir("/patronaje/rendimiento", { quien: "patronaje", tamano: "telefono" });
		await enPantalla(telefono.getByRole("heading", { name: "Sin medir en corte" })).toBeVisible();
		await pantalla.capturar(telefono, "patronaje/rendimiento-telefono");
		await telefono.close();
	});

	it(
		"Desarrollo: «Nueva solicitud», «Empezar muestra» y «Descartar» llaman su acción y avisan lo que regresan",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/patronaje/desarrollo", { quien: "patronaje" });
			for (const columna of ["Solicitud", "Muestra", "Aprobación", "Ficha técnica", "En catálogo"]) {
				await enPantalla(pagina.getByRole("heading", { name: columna, exact: true })).toBeVisible();
			}
			await pantalla.capturar(pagina, "patronaje/desarrollo-escritorio");
			await pagina.getByRole("button", { name: "Nueva solicitud" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Nueva solicitud de diseño" });
			await ventana.getByRole("button", { name: "Registrar solicitud" }).click();
			await enPantalla(ventana.getByText("Escribe qué prenda piden")).toBeVisible();
			await ventana.getByLabel("Prenda").fill("Mandil liso azul");
			await ventana.getByLabel("Tela").selectOption({ label: "Gabardina azul marino" });
			await ventana.getByLabel("Tallas").fill("CH a G");
			const registro = esperarAccion(pagina, "patronaje.registrar_solicitud");
			await ventana.getByRole("button", { name: "Registrar solicitud" }).click();
			const solicitud = (await registro).postDataJSON() as { datos: { escuela_id: string | null; prenda: string } };
			expect(solicitud.datos).toMatchObject({ escuela_id: null, prenda: "Mandil liso azul" });
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^DS-\d+ registrada en Solicitud$/);
			await enPantalla(pagina).toHaveURL(/marcado=/);
			await pagina.getByRole("button", { name: /Mandil liso azul/ }).click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText(/^DS-\d+ · Básico o general$/)).toBeVisible();
			await pantalla.capturar(pagina, "patronaje/cajon-desarrollo-escritorio");
			const empezar = esperarAccion(pagina, "patronaje.empezar_muestra");
			await cajon.getByRole("button", { name: "Empezar muestra" }).click();
			expect(((await empezar).postDataJSON() as { version: number }).version).toBeGreaterThan(0);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^DS-\d+: muestra$/);
			await enPantalla(cajon.getByRole("button", { name: "Muestra lista para aprobar" })).toBeVisible();
			await cajon.getByRole("button", { name: "Descartar con motivo" }).click();
			const descartar = pagina.getByRole("dialog", { name: "Descartar Mandil liso azul" });
			await descartar.getByLabel("Motivo").fill("El cliente ya no lo quiere");
			await descartar.getByRole("button", { name: "Descartar" }).click();
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^DS-\d+ descartada. Queda en el historial con su motivo$/);
			await pagina.keyboard.press("Escape");
			await enPantalla(pagina.getByRole("heading", { name: "Descartados" })).toBeVisible();
			await enPantalla(pagina.getByText("El cliente ya no lo quiere")).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir("/patronaje/desarrollo", { quien: "patronaje", tamano: "telefono" });
			await enPantalla(telefono.getByRole("heading", { name: "Solicitud", exact: true })).toBeVisible();
			await pantalla.capturar(telefono, "patronaje/desarrollo-telefono");
			await telefono.close();
		},
	);

	it("si el desarrollo cambió mientras se veía, lo dice y no avanza (choque de versión)", tiempo, async () => {
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id FROM desarrollos WHERE folio = 'DS-005'");
		const pagina = await pantalla.abrir(`/patronaje/desarrollo?cajon=desarrollo&id=${rows[0]?.id}`, {
			quien: "patronaje",
		});
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByRole("button", { name: "Empezar muestra" })).toBeVisible();
		await pantalla.servidor.base.dueno.query("UPDATE desarrollos SET version = version + 1 WHERE folio = 'DS-005'");
		await cajon.getByRole("button", { name: "Empezar muestra" }).click();
		await enPantalla(cajon.getByText("DS-005 cambió mientras lo veías")).toBeVisible();
		const { rows: despues } = await pantalla.servidor.base.dueno.query(
			"SELECT etapa FROM desarrollos WHERE folio = 'DS-005'",
		);
		expect(despues[0]?.etapa).toBe("solicitud");
		await pagina.close();
	});

	it("un error dice «No se pudo cargar» con «Reintentar»; una cuenta sin Patronaje no entra", tiempo, async () => {
		const pagina = await pantalla.abrir("/patronaje/recetas", { quien: "patronaje" });
		await enPantalla(pagina.getByRole("heading", { name: "Sin receta" })).toBeVisible();
		let fallar = true;
		await pagina.route("**/v1/consultas/patronaje.recetas**", (ruta) =>
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
		await pantalla.capturar(pagina, "patronaje/estado-error");
		fallar = false;
		await pagina.getByRole("button", { name: "Reintentar" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "Sin receta" })).toBeVisible();
		await pagina.close();
		const ajena = await pantalla.abrir("/patronaje/recetas", { quien: "ventas" });
		await enPantalla(ajena.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await ajena.close();
	});
});
