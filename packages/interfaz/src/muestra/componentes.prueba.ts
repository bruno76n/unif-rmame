/**
 * Prueba del sistema de diseño: el catálogo en Chromium, en escritorio (1440 × 900) y en teléfono (390 × 844). Cada
 * componente tiene las medidas y los colores de docs/interfaz/DISENO.md; el armazón es un panel que no se desplaza
 * como página (solo su contenido); en el teléfono el menú se esconde y el cajón ocupa la pantalla; el cajón con cambios pregunta antes de cerrarse. Guarda las capturas en `.revision/capturas/` para
 * el revisor de diseño.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada componente del sistema de diseño tiene las medidas, los
 * colores y los estados de la muestra, también en tema y en teléfono»)
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, expect as enPantalla, type Page } from "@playwright/test";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { colorDelEstado, esEstadoConocido } from "../estados/colores.ts";
import { estadosDeMuestra } from "./catalogo.tsx";

/** Esta carpeta y la de las capturas. */
const aqui = dirname(fileURLToPath(import.meta.url));
const capturas = join(aqui, "..", "..", "..", "..", ".revision", "capturas", "componentes");

/** Lo que mide un elemento en pantalla, con sus estilos. */
async function medir(pagina: Page, selector: string) {
	return pagina
		.locator(selector)
		.first()
		.evaluate((elemento) => {
			const caja = elemento.getBoundingClientRect();
			const estilo = getComputedStyle(elemento);
			return {
				x: caja.x,
				ancho: caja.width,
				alto: caja.height,
				fondo: estilo.backgroundColor,
				color: estilo.color,
				radio: estilo.borderTopLeftRadius,
				peso: estilo.fontWeight,
			};
		});
}

describe("Cada componente del sistema de diseño tiene las medidas, los colores y los estados de la muestra", () => {
	let servidor: ViteDevServer;
	let navegador: Browser;
	let direccion: string;
	beforeAll(async () => {
		mkdirSync(capturas, { recursive: true });
		servidor = await createServer({
			root: aqui,
			configFile: false,
			logLevel: "silent",
			plugins: [react(), tailwindcss()],
			server: { host: "127.0.0.1", port: 0 },
		});
		await servidor.listen();
		direccion = servidor.resolvedUrls?.local[0] ?? "";
		const ejecutable = process.env.CHROMIUM_EJECUTABLE;
		navegador = await chromium.launch(ejecutable === undefined ? {} : { executablePath: ejecutable });
	}, 120_000);
	afterAll(async () => {
		await navegador?.close();
		await servidor?.close();
	});

	/** Abre el catálogo con un tamaño de pantalla. */
	async function abrir(ancho: number, alto: number, busqueda = "") {
		const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
		await pagina.goto(`${direccion}${busqueda}`);
		await pagina.locator("h1", { hasText: "Bodega" }).waitFor();
		return pagina;
	}

	it("escritorio: el armazón, los botones, los estados, los campos y la tabla con sus medidas y colores", {
		timeout: 60_000,
	}, async () => {
		const pagina = await abrir(1440, 900);
		// El menú de 244 px y la barra de 64 px.
		expect((await medir(pagina, "nav[aria-label='Departamentos']")).ancho).toBe(244);
		expect((await medir(pagina, "header")).alto).toBe(64);
		// El departamento activo, en el color de la marca.
		expect((await medir(pagina, "nav[aria-label='Departamentos'] [aria-current='page']")).fondo).toBe(
			"rgb(251, 234, 242)",
		);
		// El botón principal: negro, de 44 px, redondeado de 10; el chico, de 34.
		const principal = await medir(pagina, "[data-prueba='boton-principal']");
		expect(principal).toMatchObject({
			alto: 44,
			fondo: "rgb(23, 24, 28)",
			color: "rgb(255, 255, 255)",
			radio: "10px",
			peso: "700",
		});
		expect((await medir(pagina, "[data-prueba='boton-chico']")).alto).toBe(34);
		// Los estados: cuadro sólido de 136 × 30 como mínimo, radio de 6, texto blanco en negritas, del color de la guía.
		const colores: Record<string, string> = {
			Vencido: "rgb(213, 68, 59)",
			"Por imprimir": "rgb(233, 160, 63)",
			"En tiempo": "rgb(75, 123, 229)",
			Alcanza: "rgb(63, 175, 110)",
			Borrador: "rgb(163, 169, 180)",
			"Listo en aduana": "rgb(139, 106, 214)",
			"Entrega parcial": "rgb(53, 167, 161)",
		};
		for (const [texto, fondo] of Object.entries(colores)) {
			const estado = await medir(pagina, `[data-prueba='estados'] [data-color]:has-text("${texto}")`);
			expect(estado, texto).toMatchObject({ alto: 30, fondo, color: "rgb(255, 255, 255)", radio: "6px", peso: "700" });
			expect(estado.ancho, texto).toBeGreaterThanOrEqual(136);
		}
		// El campo de 48 px; con error, su borde y su mensaje en el rojo de los errores.
		expect((await medir(pagina, "[data-prueba='campo']")).alto).toBe(48);
		await enPantalla(pagina.getByRole("alert").filter({ hasText: "Escribe al menos 5 letras." }).first()).toBeVisible();
		expect((await medir(pagina, "[role='alert']:has-text('Escribe al menos 5 letras.')")).color).toBe(
			"rgb(194, 58, 49)",
		);
		// La tabla: encabezado de 48 px en gris suave, renglones de 54; se ordena al tocar el encabezado.
		const encabezado = await medir(pagina, "[data-prueba='tabla'] thead tr");
		expect(encabezado).toMatchObject({ alto: 48, fondo: "rgb(245, 246, 249)" });
		expect((await medir(pagina, "[data-prueba='tabla'] tbody tr")).alto).toBe(54);
		// Las cifras se ordenan primero de mayor a menor; el segundo toque, de menor a mayor.
		const piezas = pagina.locator("[data-prueba='tabla']").getByRole("button", { name: "Piezas" });
		await piezas.click();
		await piezas.click();
		await enPantalla(pagina.locator("[data-prueba='tabla'] th[aria-sort='ascending']")).toContainText("Piezas");
		await enPantalla(pagina.locator("[data-prueba='tabla'] tbody tr").first()).toContainText("PE-0150");
		// El aviso de abajo: oscuro, al centro.
		const aviso = await medir(pagina, "[role='status']:has-text('PE-0150 confirmado')");
		expect(aviso.fondo).toBe("rgb(23, 24, 28)");
		// Es un panel, no una página: la página no se desplaza; el panel de contenido sí, y el menú y la barra no se mueven.
		const pantalla = await pagina.evaluate(() => ({
			documento: document.documentElement.scrollHeight,
			alto: window.innerHeight,
		}));
		expect(pantalla.documento).toBe(pantalla.alto);
		const panel = pagina.locator("[data-panel='contenido']");
		const antes = await medir(pagina, "header");
		await panel.evaluate((elemento) => elemento.scrollTo({ top: 600 }));
		expect(await panel.evaluate((elemento) => elemento.scrollTop)).toBe(600);
		const despues = await medir(pagina, "header");
		expect(despues.x).toBe(antes.x);
		expect((await pagina.locator("header").first().boundingBox())?.y).toBe(0);
		expect((await pagina.locator("nav[aria-label='Departamentos']").boundingBox())?.y).toBe(0);
		await panel.evaluate((elemento) => elemento.scrollTo({ top: 0 }));
		// El menú se desplaza solo: moverlo no mueve el panel.
		const lista = pagina.locator("nav[aria-label='Departamentos'] > div").nth(1);
		await lista.evaluate((elemento) => elemento.scrollTo({ top: 100 }));
		expect(await panel.evaluate((elemento) => elemento.scrollTop)).toBe(0);
		await pagina.screenshot({ path: join(capturas, "escritorio.png") });
		await pagina.close();
	});

	it("teléfono: el menú se esconde y se abre con su botón; nada se desborda de lado", { timeout: 60_000 }, async () => {
		const pagina = await abrir(390, 844);
		const menu = await medir(pagina, "nav[aria-label='Departamentos']");
		expect(menu.x + menu.ancho).toBeLessThanOrEqual(0);
		await pagina.getByRole("button", { name: "Abrir el menú" }).click();
		await expect.poll(async () => (await medir(pagina, "nav[aria-label='Departamentos']")).x).toBe(0);
		await pagina.screenshot({ path: join(capturas, "telefono-menu.png") });
		await pagina.locator("nav[aria-label='Departamentos']").getByRole("button", { name: "Cerrar el menú" }).click();
		const pagina390 = await pagina.evaluate(() => ({
			ancho: document.documentElement.scrollWidth,
			alto: document.documentElement.scrollHeight,
			visible: window.innerHeight,
		}));
		// Nada se desborda de lado, y en el teléfono también se desplaza el panel, no la página.
		expect(pagina390.ancho).toBeLessThanOrEqual(390);
		expect(pagina390.alto).toBe(pagina390.visible);
		await pagina.screenshot({ path: join(capturas, "telefono.png") });
		await pagina.close();
	});

	it("el cajón mide 620 px, en el teléfono ocupa la pantalla y con cambios pregunta antes de cerrarse", {
		timeout: 60_000,
	}, async () => {
		const pagina = await abrir(1440, 900, "?abrir=cajon");
		const cajon = pagina.getByRole("dialog", { name: "Pedido PE-0145" });
		await enPantalla(cajon).toBeVisible();
		expect((await cajon.boundingBox())?.width).toBe(620);
		await pagina.screenshot({ path: join(capturas, "cajon.png") });
		await pagina.keyboard.press("Escape");
		await enPantalla(
			pagina.getByRole("dialog", { name: "Tienes cambios sin guardar. ¿Salir sin guardar?" }),
		).toBeVisible();
		await pagina.getByRole("button", { name: "Volver" }).click();
		await enPantalla(cajon).toBeVisible();
		await pagina.close();
		const telefono = await abrir(390, 844, "?abrir=cajon");
		expect((await telefono.getByRole("dialog", { name: "Pedido PE-0145" }).boundingBox())?.width).toBe(390);
		await telefono.screenshot({ path: join(capturas, "cajon-telefono.png") });
		await telefono.close();
	});

	it("la ventana mide 470 px, con «Volver» a la izquierda y la acción a la derecha", { timeout: 60_000 }, async () => {
		const pagina = await abrir(1440, 900, "?abrir=ventana");
		const ventana = pagina.getByRole("dialog", { name: "Rechazar" });
		await enPantalla(ventana).toBeVisible();
		expect((await ventana.boundingBox())?.width).toBe(470);
		const volver = await ventana.getByRole("button", { name: "Volver" }).boundingBox();
		const accion = await ventana.getByRole("button", { name: "Rechazar" }).boundingBox();
		expect(volver?.x ?? 0).toBeLessThan(accion?.x ?? 0);
		expect((await medir(pagina, "[role='dialog'] input")).alto).toBe(44);
		await pagina.screenshot({ path: join(capturas, "ventana.png") });
		await pagina.close();
	});

	it("cada estado de la muestra está en la guía de textos, con su color", () => {
		for (const estado of estadosDeMuestra) expect(esEstadoConocido(estado), estado).toBe(true);
		expect(colorDelEstado("Por surtir · sale hoy")).toBe("rojo");
		expect(colorDelEstado("Por surtir")).toBe("azul");
		expect(colorDelEstado("Atrasado 3 días")).toBe("rojo");
		expect(colorDelEstado("Vence en 2 días")).toBe("ambar");
		expect(colorDelEstado("Esperando a Tienda 2")).toBe("gris");
		expect(colorDelEstado("Atorado en Costados")).toBe("rojo");
		expect(esEstadoConocido("Algo que no está")).toBe(false);
	});
});
