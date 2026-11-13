/**
 * Prueba de las pantallas de Bodega en el navegador, con la API de prueba y los datos de la muestra: cada pestaña en
 * escritorio y en teléfono con su captura; los cajones por su dirección (Variante, Entrega al corte, el conteo nuevo);
 * cada botón con su acción y el aviso de abajo con el texto que regresa (recibir del corte, entregar al corte, mandar a
 * una tienda sin caja, a producción, guardar un conteo y resolver una excepción); que la cuenta de Bodega no decide
 * ajustes; y que una cuenta sin Bodega no la abre.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados: … sin permiso …»)
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 240_000 };

/** Las pestañas de Bodega con su ruta y algo que se ve en cada una. */
const pestanas = [
	{ ruta: "/bodega", nombre: "pendientes", seVe: "Existencia total" },
	{ ruta: "/bodega/existencias", nombre: "existencias", seVe: "Copiar para Excel" },
	{ ruta: "/bodega/materiales", nombre: "materiales", seVe: "Entregas de material al corte" },
	{ ruta: "/bodega/reabasto", nombre: "reabasto", seVe: "Fabricación" },
	{ ruta: "/bodega/diferencias", nombre: "diferencias", seVe: "Sin diferencias abiertas" },
	{ ruta: "/bodega/conteos", nombre: "conteos", seVe: "Ajustes en autorización" },
	{ ruta: "/bodega/excepciones", nombre: "excepciones", seVe: "Sin excepciones por resolver" },
] as const;

describe("Las pantallas de Bodega: pestañas, cajones, botones y estados", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 240_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** Un valor de la base de prueba. */
	async function valorDe(consulta: string, ...parametros: string[]): Promise<string> {
		const { rows } = await pantalla.servidor.base.dueno.query(consulta, parametros);
		return String(Object.values(rows[0] ?? {})[0]);
	}

	/**
	 * Aprieta un botón que llama a una acción y revisa que el aviso de abajo diga el mensaje que regresó.
	 * @param pagina La página.
	 * @param accion El nombre de la acción.
	 * @param apretar Lo que la llama.
	 * @returns El mensaje.
	 */
	async function avisaLoQueRegresa(pagina: Page, accion: string, apretar: () => Promise<void>): Promise<string> {
		const respuesta = pagina.waitForResponse((suya) => suya.url().includes(`/v1/acciones/${accion}`));
		await apretar();
		const cuerpo = (await (await respuesta).json()) as { ok: boolean; resultado?: { mensaje: string } };
		expect(cuerpo.ok, JSON.stringify(cuerpo)).toBe(true);
		const mensaje = cuerpo.resultado?.mensaje ?? "";
		await enPantalla(pagina.locator("[role=status]", { hasText: mensaje })).toBeVisible();
		return mensaje;
	}

	it("cada pestaña se ve en escritorio y en teléfono, con su captura", espera, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			for (const pestana of pestanas) {
				const pagina = await pantalla.abrir(pestana.ruta, { quien: "bodega", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Bodega");
				await enPantalla(pagina.getByText(pestana.seVe, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
				await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
				await pantalla.capturar(pagina, `bodega/${pestana.nombre}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it("Pendientes: «Recibir» un retazo del corte llama a su acción y lo dice abajo", espera, async () => {
		const pagina = await pantalla.abrir("/bodega?grupo=materiales", { quien: "bodega" });
		const fila = pagina
			.getByRole("row")
			.filter({ hasText: /^.*RZ-/ })
			.first();
		await enPantalla(fila.getByText("Por recibir")).toBeVisible({ timeout: 30_000 });
		const mensaje = await avisaLoQueRegresa(pagina, "inventario.recibir_del_corte", () =>
			fila.getByRole("button", { name: "Recibir" }).click(),
		);
		expect(mensaje).toMatch(/^RZ-.* recibido en bodega: .* m de /);
		await pagina.close();
	});

	it(
		"«Entregar tela» abre el cajón Entrega al corte por su dirección, con los sugeridos marcados, y entrega",
		espera,
		async () => {
			const folio = await valorDe(
				`SELECT l.folio FROM apartados_rollo a JOIN lotes l ON l.id = a.lote_id
				WHERE a.estado = 'sugerido' ORDER BY a.fecha_corte, l.folio LIMIT 1`,
			);
			const pagina = await pantalla.abrir("/bodega/materiales", { quien: "bodega" });
			await pagina
				.getByRole("row")
				.filter({ hasText: folio })
				.first()
				.getByRole("button", { name: "Entregar" })
				.click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText(`${folio} · Corte`, { exact: false })).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("entrega");
			await enPantalla(cajon.getByRole("checkbox", { checked: true }).first()).toBeVisible();
			await pantalla.capturar(pagina, "bodega/cajon-entrega-corte");
			const mensaje = await avisaLoQueRegresa(pagina, "inventario.entregar_al_corte", () =>
				cajon.getByRole("button", { name: "Entregar al corte" }).click(),
			);
			expect(mensaje).toContain(`${folio}: `);
			await pagina.close();
		},
	);

	it(
		"Existencias busca «polo 12», la variante abre su cajón y «Mandar a Tienda 1» llama a mover a la tienda",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/bodega/existencias?texto=polo%2012", { quien: "bodega" });
			const fila = pagina.getByRole("row").filter({ hasText: "Talla 12" }).first();
			await enPantalla(fila).toBeVisible({ timeout: 30_000 });
			await fila.click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText("Ubicación")).toBeVisible();
			expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("variante");
			await pantalla.capturar(pagina, "bodega/cajon-variante");
			await cajon.getByRole("button", { name: "Mandar a Tienda 1" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Mandar a Tienda 1" });
			await ventana.getByLabel("Piezas").fill("2");
			const mensaje = await avisaLoQueRegresa(pagina, "inventario.mover_a_tienda", () =>
				ventana.getByRole("button", { name: "Mandar" }).click(),
			);
			expect(mensaje).toMatch(/^Traspaso a Tienda 1: 2 /);
			await pagina.close();
		},
	);

	it(
		"Existencias es una sola matriz: el renglón del producto suma sus columnas y se pliega; las cifras llevan su coma",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/bodega/existencias", { quien: "bodega" });
			const matriz = pagina.getByRole("table", { name: "Existencias" });
			await enPantalla(matriz).toBeVisible({ timeout: 30_000 });
			await enPantalla(pagina.getByRole("table")).toHaveCount(1);
			// La muestra tiene miles de piezas: el resumen las escribe con su separador de miles.
			await enPantalla(pagina.getByText(/ variantes · .* piezas$/)).toHaveText(
				/^[\d,]+ variantes · \d{1,3}(,\d{3})+ piezas$/,
			);
			await pagina.close();
			// Con pocos renglones (sin virtualizar): el primer producto se pliega y sus variantes dejan de verse.
			const buscada = await pantalla.abrir("/bodega/existencias?texto=polo%2012", { quien: "bodega" });
			const suya = buscada.getByRole("table", { name: "Existencias" });
			const plegar = suya.getByRole("button", { name: /^Plegar / }).first();
			await enPantalla(plegar).toBeVisible({ timeout: 30_000 });
			const prenda = (await plegar.getAttribute("aria-label"))?.replace(/^Plegar /, "") ?? "";
			const antes = await suya.getByRole("row").count();
			await plegar.click();
			await enPantalla(suya.getByRole("button", { name: `Abrir ${prenda}` }).first()).toHaveAttribute(
				"aria-expanded",
				"false",
			);
			expect(await suya.getByRole("row").count()).toBeLessThan(antes);
			await buscada.close();
			const pendientes = await pantalla.abrir("/bodega", { quien: "bodega" });
			await enPantalla(pendientes.getByRole("button", { name: /Existencia total/ })).toContainText(/\d{1,3},\d{3}/, {
				timeout: 30_000,
			});
			await pendientes.close();
		},
	);

	it("Reabasto: «A producción» sugiere fabricar lo que falta en Bodega", espera, async () => {
		const pagina = await pantalla.abrir("/bodega/reabasto", { quien: "bodega" });
		const boton = pagina.getByRole("button", { name: "A producción" }).first();
		await enPantalla(boton).toBeVisible({ timeout: 30_000 });
		const mensaje = await avisaLoQueRegresa(pagina, "inventario.sugerir_fabricar", () => boton.click());
		expect(mensaje).toMatch(/^Sugerencia enviada a producción: /);
		await pagina.close();
	});

	it(
		"Conteos y ajustes: Bodega no decide el ajuste; un conteo nuevo es ciego y se guarda con su acción",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/bodega/conteos", { quien: "bodega" });
			await enPantalla(pagina.getByText("Esperando autorización")).toBeVisible({ timeout: 30_000 });
			await enPantalla(pagina.getByRole("button", { name: "Autorizar" })).toHaveCount(0);
			await pagina.getByRole("button", { name: "Nuevo conteo" }).click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByRole("heading", { name: "Nuevo conteo" })).toBeVisible();
			const seccion = await valorDe(
				`SELECT s.nombre FROM secciones s JOIN productos p ON p.seccion_id = s.id
				JOIN variantes v ON v.producto_id = p.id JOIN existencias e ON e.variante_id = v.id ORDER BY s.orden LIMIT 1`,
			);
			await cajon.getByLabel("Sección").selectOption({ label: seccion });
			const contado = cajon.getByRole("textbox", { name: /^Contado de / }).first();
			await enPantalla(contado).toBeVisible();
			await enPantalla(cajon.getByText(/Sistema/)).toHaveCount(0);
			await pantalla.capturar(pagina, "bodega/cajon-conteo");
			await contado.fill("0");
			await cajon.getByLabel("Motivo del ajuste, si algo no cuadra").selectOption({ index: 1 });
			const mensaje = await avisaLoQueRegresa(pagina, "inventario.guardar_conteo", () =>
				cajon.getByRole("button", { name: "Guardar conteo" }).click(),
			);
			expect(mensaje).toMatch(/^(CN-|AJ-)/);
			await pagina.close();
		},
	);

	it("Excepciones: «Resolver» abre su ventana por la dirección y llama a su acción", espera, async () => {
		const excepcion = await valorDe(
			`INSERT INTO excepciones (id, tipo, area, estado, descripcion, detectada_en)
			VALUES (uuidv7(), 'cuadre_proyeccion', 'bodega', 'por_revisar', 'La existencia no era la del libro', now())
			RETURNING id`,
		);
		const pagina = await pantalla.abrir("/bodega/excepciones", { quien: "bodega" });
		await pagina.getByRole("button", { name: "Resolver" }).first().click();
		expect(new URL(pagina.url()).searchParams.get("resolver")).toBe(excepcion);
		const ventana = pagina.getByRole("dialog", { name: "Resolver excepción" });
		await ventana.getByLabel("Motivo").fill("Se corrigió el conteo de la mesa");
		const mensaje = await avisaLoQueRegresa(pagina, "inventario.resolver_excepcion", () =>
			ventana.getByRole("button", { name: "Resolver" }).click(),
		);
		expect(mensaje).toBe("Excepción resuelta: queda en Resueltas");
		await pagina.close();
	});

	it("una cuenta sin Bodega que escribe su dirección ve «No tienes acceso a esta pantalla»", espera, async () => {
		const pagina = await pantalla.abrir("/bodega/existencias", { quien: "ventas" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible({ timeout: 30_000 });
		await pagina.close();
	});
});
