/**
 * Prueba de las pantallas de Catálogo en el navegador, con la API de prueba y los datos de la muestra: cada pestaña se
 * ve con sus datos en escritorio y en teléfono (con su captura para el revisor de diseño), los cajones se abren desde la
 * dirección, cada botón llama a su acción y el aviso de abajo dice el texto que regresa, y una cuenta sin Catálogo no
 * entra. Lo que una prueba cambia, la misma prueba lo regresa con la pantalla.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados») y docs/interfaz/fabrica/catalogo.md
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** El tiempo de cada caso: abre la web y espera a la API. */
const tiempo = { timeout: 120_000 };

describe("Las pantallas de Catálogo: pestañas, cajones, botones y avisos", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla({ conArchivos: true });
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/** El id de un producto por su nombre (el primero). */
	async function idDe(nombre: string): Promise<string> {
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id FROM productos WHERE nombre = $1 LIMIT 1", [
			nombre,
		]);
		return String(rows[0]?.id);
	}

	/** Espera el aviso de abajo con su texto. */
	async function aviso(pagina: Page, texto: string | RegExp) {
		await enPantalla(pagina.getByText(texto).first()).toBeVisible({ timeout: 15_000 });
	}

	it(
		"Pendientes: las cuatro cifras y el panel con los modelos sin precio y las etiquetas; «Imprimir» lleva a Etiquetas",
		tiempo,
		async () => {
			for (const tamano of ["escritorio", "telefono"] as const) {
				const pagina = await pantalla.abrir("/catalogo", { quien: "catalogo", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Catálogo");
				await enPantalla(pagina.getByRole("tab", { name: /Pendientes/ })).toBeVisible();
				for (const cifra of ["Productos", "Listas de precios", "Etiquetas", "Bitácora"]) {
					await enPantalla(pagina.getByRole("button", { name: new RegExp(`^${cifra}`) }).first()).toBeVisible();
				}
				const tabla = pagina.getByRole("table", { name: "Pendientes" });
				await enPantalla(tabla.getByText("Modelo sin precio").first()).toBeVisible();
				await enPantalla(tabla.getByText("Por imprimir").first()).toBeVisible();
				await pantalla.capturar(pagina, `catalogo/pendientes-${tamano}`);
				if (tamano === "escritorio") {
					await tabla.getByRole("button", { name: "Imprimir" }).first().click();
					await enPantalla(pagina.getByRole("tab", { name: "Etiquetas", selected: true })).toBeVisible();
					await enPantalla(pagina.getByRole("table", { name: /Variantes de/ })).toBeVisible();
				}
				await pagina.close();
			}
		},
	);

	it("Productos: por sección, con los filtros en la dirección y el vacío con «Quitar filtros»", tiempo, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			const pagina = await pantalla.abrir("/catalogo/productos", { quien: "catalogo", tamano });
			await enPantalla(pagina.getByRole("heading", { name: "Playeras" })).toBeVisible();
			await enPantalla(pagina.getByText("Playera polo blanca lisa").first()).toBeVisible();
			await pantalla.capturar(pagina, `catalogo/productos-${tamano}`);
			await pagina.close();
		}
		const pagina = await pantalla.abrir("/catalogo/productos?vista=galeria", { quien: "catalogo" });
		await enPantalla(pagina.getByText("Playera polo blanca lisa").first()).toBeVisible();
		await pantalla.capturar(pagina, "catalogo/productos-galeria");
		await pagina.goto(pagina.url().replace("?vista=galeria", "?buscar=zzzz-nada"));
		await enPantalla(pagina.getByText("Ningún producto cumple esos filtros.")).toBeVisible();
		await pagina.getByRole("button", { name: "Quitar filtros" }).click();
		await enPantalla(pagina.getByText("Playera polo blanca lisa").first()).toBeVisible();
		await pagina.close();
	});

	it("Listas de precios, Etiquetas, Escuelas y tallas y Bitácora se ven con sus datos", tiempo, async () => {
		const pestanas = [
			{ ruta: "listas-de-precios", ve: "La que cobran las dos tiendas en el mostrador." },
			{ ruta: "etiquetas", ve: "Variantes nuevas sin etiqueta" },
			{ ruta: "escuelas-y-tallas", ve: "Grupos de tallas" },
			{ ruta: "bitacora", ve: "Producto nuevo con" },
		];
		for (const { ruta, ve } of pestanas) {
			for (const tamano of ["escritorio", "telefono"] as const) {
				const pagina = await pantalla.abrir(`/catalogo/${ruta}`, { quien: "catalogo", tamano });
				await enPantalla(pagina.getByText(ve).first()).toBeVisible();
				if (ruta === "etiquetas") {
					// Abre ya con un producto en «Por variante», como la muestra: sin texto que explique la pantalla.
					await enPantalla(pagina.getByText(/^Así queda la etiqueta de la talla /)).toBeVisible();
					await enPantalla(pagina.getByText("Escoge un producto para ver sus variantes.")).toHaveCount(0);
				}
				await pantalla.capturar(pagina, `catalogo/${ruta}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it(
		"la ficha se abre con `?cajon=producto&id=`: «Aplicar cambios» cambia el precio y el aviso dice el texto de la acción",
		tiempo,
		async () => {
			const id = await idDe("Calcetas blancas (par)");
			const pagina = await pantalla.abrir(`/catalogo/productos?cajon=producto&id=${id}`, { quien: "catalogo" });
			const cajon = pagina.getByRole("dialog", { name: "Calcetas blancas (par)" });
			await enPantalla(cajon.getByRole("table", { name: "Tallas, códigos y precios" })).toBeVisible();
			// El pie lleva «Listo» en negro (tinta #17181C) a la derecha; ninguna casilla dice «en En línea».
			await enPantalla(cajon.getByRole("button", { name: "Listo" })).toHaveCSS("background-color", "rgb(23, 24, 28)");
			await enPantalla(cajon.getByLabel(/ en En /)).toHaveCount(0);
			await pantalla.capturar(pagina, "catalogo/ficha-escritorio");
			const base = cajon.getByLabel("Precio base · Mostrador");
			await base.fill("45");
			await enPantalla(cajon.getByText("1 cambio por aplicar")).toBeVisible();
			await enPantalla(cajon.getByText("Precio de Mostrador: $40 a $45")).toBeVisible();
			// Con cambios sin aplicar, «Cerrar» no sale.
			await cajon.getByRole("button", { name: "Cerrar" }).click();
			await aviso(pagina, "Tienes cambios sin aplicar. Aplícalos o descártalos antes de cerrar");
			await cajon.getByRole("button", { name: "Aplicar cambios" }).click();
			await aviso(pagina, /^1 cambio aplicado a Calcetas blancas \(par\)/);
			// Lo regresa a como estaba, ya con el precio nuevo en la ficha.
			await enPantalla(cajon.getByText("1 cambio por aplicar")).toHaveCount(0);
			await enPantalla(cajon.getByText("Precio de Mostrador: $40 → $45 +13%")).toBeVisible();
			await enPantalla(base).toHaveValue("45");
			await base.fill("40");
			await cajon.getByRole("button", { name: "Aplicar cambios" }).click();
			await aviso(pagina, /^1 cambio aplicado a Calcetas blancas \(par\)/);
			await pagina.close();
		},
	);

	it(
		"«Subir foto» sube el archivo al almacén y la guarda en el momento; la ficha la enseña con «Cambiar foto»",
		tiempo,
		async () => {
			const { rows } = await pantalla.servidor.base.dueno.query(
				"SELECT id, nombre FROM productos WHERE foto_archivo_id IS NULL AND baja_en IS NULL ORDER BY nombre LIMIT 1",
			);
			const producto = { id: String(rows[0]?.id), nombre: String(rows[0]?.nombre) };
			const pagina = await pantalla.abrir(`/catalogo/productos?cajon=producto&id=${producto.id}`, {
				quien: "catalogo",
			});
			const cajon = pagina.getByRole("dialog", { name: producto.nombre });
			await enPantalla(cajon.getByText("Sin foto")).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Subir foto" })).toBeVisible();
			const guardada = pagina.waitForResponse((suya) =>
				suya.url().includes("/v1/acciones/catalogo.subir_foto_producto"),
			);
			await cajon.locator('input[type="file"]').setInputFiles({
				name: "polo.png",
				mimeType: "image/png",
				buffer: Buffer.from("una foto de prueba"),
			});
			const respuesta = await guardada;
			expect(respuesta.status(), await respuesta.text()).toBe(200);
			await aviso(pagina, /^Foto guardada/);
			await enPantalla(cajon.getByRole("img", { name: `Foto de ${producto.nombre}` })).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Cambiar foto" })).toBeVisible();
			await pagina.close();
			// Deja el producto como estaba: sin foto.
			await pantalla.servidor.base.dueno.query("UPDATE productos SET foto_archivo_id = NULL WHERE id = $1", [
				producto.id,
			]);
		},
	);

	it("la ficha en el teléfono, y descontinuar y reactivar una talla con su aviso", tiempo, async () => {
		const id = await idDe("Pantalón azul marino");
		const pagina = await pantalla.abrir(`/catalogo?cajon=producto&id=${id}`, { quien: "catalogo", tamano: "telefono" });
		const cajon = pagina.getByRole("dialog", { name: "Pantalón azul marino" });
		await enPantalla(cajon.getByRole("table", { name: "Tallas, códigos y precios" })).toBeVisible();
		await pantalla.capturar(pagina, "catalogo/ficha-telefono");
		await cajon.getByRole("button", { name: "Descontinuar talla" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: /^Descontinuar la talla/ });
		await ventana.getByLabel("Motivo").fill("Ya no se fabrica esta talla");
		await ventana.getByRole("button", { name: "Descontinuar" }).click();
		await aviso(pagina, /^Talla \d+ descontinuada: se vende hasta acabarla/);
		await cajon.getByRole("button", { name: "Reactivar talla" }).click();
		await aviso(pagina, /^Talla \d+ vuelve a fabricarse/);
		await pagina.close();
	});

	it("descontinuar un producto con motivo y reactivarlo, con sus avisos", tiempo, async () => {
		const id = await idDe("Calcetas blancas (par)");
		const pagina = await pantalla.abrir(`/catalogo/productos?cajon=producto&id=${id}`, { quien: "catalogo" });
		const cajon = pagina.getByRole("dialog", { name: "Calcetas blancas (par)" });
		await cajon.getByRole("button", { name: "Descontinuar con motivo" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Descontinuar Calcetas blancas (par)" });
		await ventana.getByLabel("Motivo").fill("Prueba de la pantalla");
		await ventana.getByRole("button", { name: "Descontinuar" }).click();
		await aviso(pagina, "Calcetas blancas (par) descontinuado. Su historial y sus códigos se conservan");
		await cajon.getByRole("button", { name: "Reactivar producto" }).click();
		await aviso(pagina, "Calcetas blancas (par) vuelve a estar activo");
		await pagina.close();
	});

	it("«Agregar escuela» y «Dar de baja», con sus avisos", tiempo, async () => {
		const pagina = await pantalla.abrir("/catalogo/escuelas-y-tallas", { quien: "catalogo" });
		await pagina.getByRole("button", { name: "Agregar escuela" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: "Agregar escuela" });
		await ventana.getByLabel("Nombre").fill("Colegio de la Prueba de Pantalla");
		await ventana.getByLabel("Municipio").fill("Zamora");
		await ventana.getByRole("button", { name: "Agregar escuela" }).click();
		await aviso(pagina, "Colegio de la Prueba de Pantalla ya está en el catálogo. Ahora puedes crearle modelos");
		const renglon = pagina.getByRole("listitem").filter({ hasText: "Colegio de la Prueba de Pantalla" });
		await renglon.getByRole("button", { name: "Dar de baja" }).click();
		const baja = pagina.getByRole("dialog", { name: "Dar de baja Colegio de la Prueba de Pantalla" });
		await baja.getByLabel("Motivo").fill("Escuela de prueba");
		await baja.getByRole("button", { name: "Dar de baja" }).click();
		await aviso(pagina, "Colegio de la Prueba de Pantalla dada de baja. Sus modelos y su historial se conservan");
		await pagina.close();
	});

	it(
		"«Nuevo producto» desde la barra crea el producto, abre su ficha y se descontinúa para dejar el catálogo igual",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/catalogo/productos", { quien: "catalogo" });
			// La acción principal de la barra va en negro, como en todos los departamentos.
			const nuevo = pagina.getByRole("button", { name: "Nuevo producto" }).first();
			await enPantalla(nuevo).toHaveCSS("background-color", "rgb(23, 24, 28)");
			await nuevo.click();
			const cajon = pagina.getByRole("dialog", { name: "¿Qué prenda es?" });
			await enPantalla(cajon.getByText(/^Nuevo producto \d{6}/)).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Crear producto" })).toHaveCSS(
				"background-color",
				"rgb(23, 24, 28)",
			);
			await pantalla.capturar(pagina, "catalogo/nuevo-producto-escritorio");
			await cajon.getByLabel("Nombre de la prenda").fill("Moño de prueba de pantalla");
			const alta = pagina.getByRole("dialog", { name: "Moño de prueba de pantalla" });
			await alta.getByLabel("Sección").selectOption({ label: "Accesorios y servicios" });
			await alta.getByRole("checkbox", { name: "Talla única" }).click();
			await alta.getByLabel("Precio para Mostrador").fill("35");
			await alta.getByRole("button", { name: "Crear producto" }).click();
			await aviso(pagina, /^Moño de prueba de pantalla creado con 1 variantes?, códigos \d{6} a \d{6}/);
			const ficha = pagina.getByRole("dialog", { name: "Moño de prueba de pantalla" });
			await enPantalla(ficha.getByRole("table", { name: "Tallas, códigos y precios" })).toBeVisible();
			await ficha.getByRole("button", { name: "Descontinuar con motivo" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Descontinuar Moño de prueba de pantalla" });
			await ventana.getByLabel("Motivo").fill("Producto de prueba");
			await ventana.getByRole("button", { name: "Descontinuar" }).click();
			await aviso(pagina, "Moño de prueba de pantalla descontinuado. Su historial y sus códigos se conservan");
			await pagina.close();
		},
	);

	it("una cuenta sin Catálogo no entra: «No tienes acceso a esta pantalla»", tiempo, async () => {
		const pagina = await pantalla.abrir("/catalogo/productos", { quien: "bodega" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
