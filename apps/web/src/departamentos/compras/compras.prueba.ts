/**
 * Prueba de las pantallas de Compras en el navegador, con la API de prueba y los datos de la muestra: cada pestaña en
 * escritorio y en teléfono con su captura, los cajones por su dirección, cada botón con su acción y el aviso de abajo
 * con el texto que regresa, el choque de versión, el cajón con cambios que pregunta antes de cerrarse, y que una cuenta
 * sin Compras no la abre.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa», «Cada pantalla tiene sus estados…» y «Un cajón con cambios sin guardar pregunta antes de
 * cerrarse…»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { mandarAccion, pedirConsulta } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Las pestañas de Compras con su ruta y algo que se ve en cada una. */
const pestanas = [
	{ ruta: "/compras", nombre: "pendientes", seVe: "Pendientes" },
	{ ruta: "/compras/por-pedir", nombre: "por-pedir", seVe: "Lo libre alcanza" },
	{ ruta: "/compras/ordenes", nombre: "ordenes", seVe: "Atrasadas" },
	{ ruta: "/compras/materiales", nombre: "materiales", seVe: "Telas" },
	{ ruta: "/compras/proveedores", nombre: "proveedores", seVe: "Plazo: dice y real" },
	{ ruta: "/compras/conciliacion", nombre: "conciliacion", seVe: "Orden, recepción y factura" },
] as const;

/**
 * El aviso de abajo.
 * @param pagina La página.
 */
function aviso(pagina: Page) {
	return pagina.locator("[role='status'][aria-live='polite']");
}

describe("Las pantallas de Compras: pestañas, cajones, botones y estados", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it("cada pestaña se ve en escritorio y en teléfono, con su captura", { timeout: 240_000 }, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			for (const pestana of pestanas) {
				const pagina = await pantalla.abrir(pestana.ruta, { quien: "compras", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Compras");
				await enPantalla(pagina.getByText(pestana.seVe, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
				await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
				if (pestana.nombre === "por-pedir" && tamano === "telefono") {
					// En el teléfono el renglón se apila: su estado y su pedido sugerido caben en la pantalla (390 px).
					const primerEstado = pagina.locator("[role='button'] [data-color]").first();
					await enPantalla(primerEstado).toBeVisible();
					const caja = await primerEstado.boundingBox();
					expect(caja).not.toBeNull();
					expect((caja?.x ?? 0) + (caja?.width ?? 0)).toBeLessThanOrEqual(390);
				}
				if (pestana.nombre === "materiales") {
					// Las dos cifras llevan su unidad: «331 m comprometidos de 700 m».
					const comprometidos = pagina.getByText(/ comprometidos de /);
					await enPantalla(comprometidos.first()).toBeVisible();
					for (const texto of await comprometidos.allTextContents()) {
						expect(texto).toMatch(/^[\d,.]+ [^\d\s]+ comprometidos de [\d,.]+ [^\d\s]+$/);
					}
				}
				await pantalla.capturar(pagina, `compras/${pestana.nombre}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it("Pendientes: la pestaña cuenta todo lo pendiente y «Ver orden» abre el cajón de la orden por su dirección", {
		timeout: 90_000,
	}, async () => {
		const pendientes = await pedirConsulta(pantalla.servidor, "compras.pendientes", {}, "compras");
		const { conteos, renglones, indicadores } = pendientes.cuerpo.resultado as {
			conteos: { todos: number };
			renglones: { tipo: string; referencia: string }[];
			indicadores: { por_pedir: { sin_tiempo: number }; facturas: { sin_conciliar: number } };
		};
		const pagina = await pantalla.abrir("/compras", { quien: "compras" });
		await enPantalla(pagina.getByRole("tab", { name: /Pendientes/ })).toContainText(String(conteos.todos));
		// «Por pedir» va en rojo si hay algo sin tiempo de entrega (#D5443B) y «sin conciliar», en ámbar (#B3690C).
		expect(indicadores.por_pedir.sin_tiempo).toBeGreaterThan(0);
		expect(indicadores.facturas.sin_conciliar).toBeGreaterThan(0);
		const numeroDe = (cifra: RegExp) => pagina.getByRole("button", { name: cifra }).locator("b").first();
		await enPantalla(numeroDe(/^Por pedir/)).toHaveCSS("color", "rgb(213, 68, 59)");
		await enPantalla(numeroDe(/^Conciliación de facturas/)).toHaveCSS("color", "rgb(179, 105, 12)");
		const orden = renglones.find((renglon) => renglon.tipo === "orden");
		if (orden === undefined) throw new Error("la muestra no trae órdenes en Pendientes");
		const fila = pagina.getByRole("row").filter({ hasText: orden.referencia });
		await fila.getByRole("button", { name: "Ver orden" }).click();
		const folio = orden.referencia.split(" · ")[0] ?? "";
		await enPantalla(pagina.getByRole("dialog")).toContainText(folio);
		expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("orden");
		await enPantalla(pagina.getByRole("dialog").locator("[aria-busy='true']")).toHaveCount(0);
		await pantalla.capturar(pagina, "compras/cajon-orden");
		// El mismo enlace abre el mismo cajón en otra página.
		const otra = await pantalla.abrir(`/compras/ordenes${new URL(pagina.url()).search}`, { quien: "compras" });
		await enPantalla(otra.getByRole("dialog")).toContainText(folio);
		await otra.close();
		await pagina.close();
	});

	it("Por pedir: el «por qué» corre la cuenta al escribir; escoger y «Levantar orden» crea el borrador y lo avisa", {
		timeout: 120_000,
	}, async () => {
		const pagina = await pantalla.abrir("/compras/por-pedir", { quien: "compras" });
		await enPantalla(pagina.getByText("Sin tiempo de entrega").first()).toBeVisible({ timeout: 30_000 });
		// El primer material abre su «por qué».
		const primero = pagina.locator("[role='button'][tabindex='0']").first();
		await primero.click();
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("La cuenta")).toBeVisible();
		const cantidad = cajon.getByLabel(/Cantidad por pedir/);
		await enPantalla(cantidad).not.toHaveValue("");
		await pantalla.capturar(pagina, "compras/cajon-por-que");
		await cantidad.fill("7");
		await enPantalla(cajon.getByText(/Se compra de \d+ en \d+ .+\. Prueba con \d+/)).toBeVisible();
		await cantidad.fill("");
		await enPantalla(cajon.getByText("Escribe cuánto pedir")).toBeVisible();
		await cajon.getByRole("button", { name: "Cerrar" }).first().click();
		// Escoger dos materiales y levantar la orden.
		await pagina
			.getByRole("checkbox", { name: /^Escoger (?!Sin tiempo|Pedir|Alcanza)/ })
			.nth(0)
			.click();
		await pagina
			.getByRole("checkbox", { name: /^Escoger (?!Sin tiempo|Pedir|Alcanza)/ })
			.nth(1)
			.click();
		const barra = pagina.getByRole("toolbar", { name: "Selección" });
		await enPantalla(barra).toContainText("2 materiales seleccionados");
		await barra.getByRole("button", { name: "Levantar orden" }).click();
		const levantar = pagina.getByRole("dialog");
		await enPantalla(levantar.getByRole("heading", { name: "Levantar orden" })).toBeVisible();
		await enPantalla(levantar.getByText("Total").first()).toBeVisible();
		await pantalla.capturar(pagina, "compras/cajon-levantar-orden");
		await levantar.getByRole("button", { name: /^Crear (la orden|\d+ órdenes)$/ }).click();
		await enPantalla(aviso(pagina)).toContainText(/quedó en borrador con|órdenes quedaron en borrador/);
		await enPantalla(pagina).toHaveURL(/\/compras\/ordenes\?.*abiertos=borradores/);
		await pagina.close();
	});

	it("la orden en borrador: «Guardar» avisa «Borrador {OC} guardado» y «Descartar borrador» la descarta con su motivo", {
		timeout: 120_000,
	}, async () => {
		const { rows } = await pantalla.servidor.base.dueno.query(
			"SELECT id, folio FROM ordenes_compra WHERE estado = 'borrador' ORDER BY folio LIMIT 1",
		);
		const [{ id, folio }] = rows as [{ id: string; folio: string }];
		const pagina = await pantalla.abrir(`/compras/ordenes?cajon=orden&id=${id}`, { quien: "compras" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon).toContainText(folio);
		await cajon.getByLabel("Promete llegar").fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
		await cajon.getByRole("button", { name: "Guardar", exact: true }).click();
		await enPantalla(aviso(pagina)).toContainText(`Borrador ${folio} guardado`);
		await cajon.getByRole("button", { name: "Descartar borrador" }).click();
		const ventana = pagina.getByRole("dialog", { name: `Descartar ${folio}` });
		await enPantalla(ventana.getByText("Escribe al menos 5 letras.")).toBeVisible();
		await enPantalla(ventana.getByRole("button", { name: "Descartar orden" })).toBeDisabled();
		await ventana.getByLabel("Motivo").fill("Se pidió por error");
		await enPantalla(ventana.getByText("Listo.")).toBeVisible();
		await ventana.getByRole("button", { name: "Descartar orden" }).click();
		await enPantalla(aviso(pagina)).toContainText(`${folio} descartada. Queda en el historial con su motivo`);
		await pagina.close();
	});

	it("el material: con cambios, cerrar pregunta antes; si otro lo cambió mientras, dice el choque de versión", {
		timeout: 120_000,
	}, async () => {
		const { rows } = await pantalla.servidor.base.dueno.query(
			"SELECT id, nombre, version FROM materiales WHERE baja_en IS NULL ORDER BY nombre LIMIT 1",
		);
		const [{ id, nombre, version }] = rows as [{ id: string; nombre: string; version: string }];
		const pagina = await pantalla.abrir(`/compras/materiales?cajon=material&id=${id}`, { quien: "compras" });
		const cajon = pagina.getByRole("dialog", { name: nombre });
		const dias = cajon.getByLabel("Cada pedido cubre (días)");
		await enPantalla(dias).not.toHaveValue("");
		// «Precios · Los últimos {n}», en singular con uno: nunca «Los últimos 1».
		await enPantalla(cajon.getByText(/^Precios( · (El último|Los últimos \d+))?$/)).toBeVisible();
		await enPantalla(cajon.getByText("Precios · Los últimos 1", { exact: true })).toHaveCount(0);
		await dias.fill(String(Number(await dias.inputValue()) + 7));
		await enPantalla(cajon.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
		await cajon.getByRole("button", { name: "Cerrar" }).first().click();
		await enPantalla(pagina.getByText("Tienes cambios sin guardar. ¿Salir sin guardar?")).toBeVisible();
		await pagina.getByRole("button", { name: "Volver" }).click();
		// Otra persona cambia el material mientras se ve.
		const otro = await mandarAccion(
			pantalla.servidor,
			"compras.guardar_material",
			{ datos: { material_id: id, dias_cubre: 50 }, version: Number(version) },
			"compras",
		);
		expect(otro.estado, JSON.stringify(otro.cuerpo)).toBe(200);
		await cajon.getByRole("button", { name: "Guardar cambios" }).click();
		await enPantalla(
			cajon.getByText(`${nombre} cambió mientras lo veías. Revisa los cambios y vuelve a guardar`),
		).toBeVisible();
		await pantalla.capturar(pagina, "compras/cajon-material-choque");
		await pagina.close();
	});

	it("«Nuevo proveedor» llama su acción y avisa «{nombre} ya está en Proveedores»", { timeout: 90_000 }, async () => {
		const pagina = await pantalla.abrir("/compras/proveedores", { quien: "compras" });
		await pagina.getByRole("button", { name: "Nuevo proveedor" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Nuevo proveedor" });
		await ventana.getByRole("button", { name: "Agregar proveedor" }).click();
		await enPantalla(ventana.getByText("Escribe el nombre del proveedor")).toBeVisible();
		await ventana.getByLabel("Nombre").fill("Botones del Bajío");
		await ventana.getByLabel("Ciudad").fill("León, Gto.");
		await ventana.getByLabel("Teléfono").fill("477 555 0199");
		await ventana.getByLabel("Días que dice tardar").fill("6");
		await pantalla.capturar(pagina, "compras/ventana-nuevo-proveedor");
		await ventana.getByRole("button", { name: "Agregar proveedor" }).click();
		await enPantalla(aviso(pagina)).toContainText("Botones del Bajío ya está en Proveedores");
		await enPantalla(pagina.getByRole("row").filter({ hasText: "Botones del Bajío" })).toBeVisible();
		await pagina.close();
	});

	it("los cajones del proveedor y del «por qué» se ven en el teléfono", { timeout: 90_000 }, async () => {
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id FROM proveedores ORDER BY id LIMIT 1");
		const pagina = await pantalla.abrir(`/compras/proveedores?cajon=proveedor&id=${String(rows[0]?.id)}`, {
			quien: "compras",
			tamano: "telefono",
		});
		await enPantalla(pagina.getByRole("dialog").getByText("Últimas entregas · Días que tardó cada una")).toBeVisible();
		await pantalla.capturar(pagina, "compras/cajon-proveedor-telefono");
		await pagina.close();
	});

	it("sin Compras, la dirección lleva a «No tienes acceso a esta pantalla»", { timeout: 60_000 }, async () => {
		const pagina = await pantalla.abrir("/compras/materiales", { quien: "aduana" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
