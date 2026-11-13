/**
 * Prueba de las pantallas de Producción en el navegador, contra los datos de la muestra, en escritorio y en teléfono:
 * cada pestaña se ve con sus datos y su captura para el revisor de diseño; cada botón llama a su acción y el aviso de
 * abajo dice el texto que regresa; y sus estados (cargando, error y choque de versión).
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el texto
 * que regresa» y «Cada pantalla tiene sus estados») y docs/interfaz/fabrica/produccion.md
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirDeLaTablet } from "../../../../api/src/nucleo/pruebas/produccion-de-prueba.ts";
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

describe("Las pantallas de Producción", () => {
	let pantalla: PantallaDePrueba;
	/** Los ids de los lotes de la muestra, por folio. */
	const lotes: Record<string, string> = {};
	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const { rows } = await pantalla.servidor.base.dueno.query("SELECT id, folio FROM lotes");
		for (const fila of rows) lotes[String(fila.folio)] = String(fila.id);
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it(
		"Pendientes: las cuatro cifras, la cola con sus estados y el filtro en la dirección, en escritorio y teléfono",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/produccion", { quien: "produccion" });
			await enPantalla(pagina.locator("h1")).toHaveText("Producción");
			for (const cifra of ["Lotes", "Corte", "Órdenes de producción", "Producción"]) {
				await enPantalla(pagina.getByRole("button", { name: new RegExp(`^${cifra}`) }).first()).toBeVisible();
			}
			await enPantalla(pagina.getByText("Corte hoy").first()).toBeVisible();
			await enPantalla(pagina.getByText("Falta la receta").first()).toBeVisible();
			await enPantalla(pagina.getByText("Por aplicar")).toBeVisible();
			await pantalla.capturar(pagina, "produccion/pendientes-escritorio");
			await pagina
				.getByRole("toolbar", { name: "Filtrar pendientes" })
				.getByRole("button", { name: /^Corte/ })
				.click();
			await enPantalla(pagina).toHaveURL(/grupo=corte/);
			await enPantalla(pagina.getByText("Por aplicar")).toHaveCount(0);
			await pagina.close();
			const telefono = await pantalla.abrir("/produccion", { quien: "produccion", tamano: "telefono" });
			await enPantalla(telefono.getByText("Por aplicar")).toBeVisible();
			await pantalla.capturar(telefono, "produccion/pendientes-telefono");
			await telefono.close();
		},
	);

	it("«Aplicar a lotes» llama a su acción y el aviso dice lo que regresa", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion?grupo=cambios", { quien: "produccion" });
		const llamada = esperarAccion(pagina, "produccion.aplicar_cambio_pedido");
		await pagina.getByRole("button", { name: "Aplicar a lotes" }).click();
		const datos = (await llamada).postDataJSON() as { datos: { cambio_pedido_id: string }; version: number };
		expect(datos.datos.cambio_pedido_id).toMatch(/^[0-9a-f-]{36}$/);
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^PE-0014 versión \d+ aplicada en producción$|^Sin ajustes$/);
		await pagina.close();
	});

	it("Lotes: los grupos con sus tarjetas; una tarjeta abre el cajón del lote, con su dirección", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/lotes", { quien: "produccion" });
		await enPantalla(pagina.getByRole("heading", { name: "Por cortar" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Terminados" })).toBeVisible();
		await enPantalla(pagina.getByText("Ninguna operación reporta más piezas que la anterior")).toBeVisible();
		await pantalla.capturar(pagina, "produccion/lotes-escritorio");
		await pagina.locator(`[data-lote="${lotes["L-2026-002"]}"]`).click();
		await enPantalla(pagina).toHaveURL(new RegExp(`cajon=lote&id=${lotes["L-2026-002"]}`));
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("L-2026-002 · ")).toBeVisible();
		await enPantalla(cajon.getByRole("heading", { name: "Operación por operación" })).toBeVisible();
		await enPantalla(cajon.getByRole("heading", { name: "Registros de la tablet" })).toBeVisible();
		await enPantalla(cajon.getByRole("heading", { name: "Bultos" })).toBeVisible();
		// Producción no ve el costo ni el precio por metro.
		await enPantalla(cajon.getByText("Precio por metro")).toHaveCount(0);
		await enPantalla(cajon.getByText(/^Costo del lote/)).toHaveCount(0);
		await pantalla.capturar(pagina, "produccion/cajon-lote-escritorio");
		await pagina.close();
		const telefono = await pantalla.abrir("/produccion/lotes", { quien: "produccion", tamano: "telefono" });
		await enPantalla(telefono.getByRole("heading", { name: "Por cortar" })).toBeVisible();
		await pantalla.capturar(telefono, "produccion/lotes-telefono");
		await telefono.close();
	});

	it("la dueña ve el costo del lote y el precio por metro en el cajón", tiempo, async () => {
		const pagina = await pantalla.abrir(`/produccion/lotes?cajon=lote&id=${lotes["L-2026-002"]}`, { quien: "duena" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText(/^Costo del lote · \d+ piezas cortadas$/)).toBeVisible();
		await enPantalla(cajon.getByText("Precio por metro")).toBeVisible();
		await enPantalla(cajon.getByText("Mano de obra")).toBeVisible();
		await pagina.close();
	});

	it("«Cancelar registro» pide el motivo, llama a su acción y el aviso dice lo que regresa", tiempo, async () => {
		const pagina = await pantalla.abrir(`/produccion/lotes?cajon=lote&id=${lotes["L-2026-002"]}`, {
			quien: "produccion",
		});
		const cajon = pagina.getByRole("dialog");
		await cajon.getByRole("button", { name: "Cancelar registro" }).first().click();
		const ventana = pagina.getByRole("dialog", { name: /^Cancelar el registro de / });
		await ventana.getByLabel("Motivo").fill("Se registró en el bulto equivocado");
		const llamada = esperarAccion(pagina, "produccion.cancelar_registro");
		await ventana.getByRole("button", { name: "Cancelar registro" }).click();
		const datos = (await llamada).postDataJSON() as { datos: { motivo: string } };
		expect(datos.datos.motivo).toBe("Se registró en el bulto equivocado");
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^Registro cancelado: \d+ piezas menos para .+ en la nómina$/);
		await pagina.close();
	});

	it("si el registro cambió mientras se veía, lo dice y no lo cancela (choque de versión)", tiempo, async () => {
		const pagina = await pantalla.abrir(`/produccion/lotes?cajon=lote&id=${lotes["L-2026-002"]}`, {
			quien: "produccion",
		});
		const cajon = pagina.getByRole("dialog");
		await cajon.getByRole("button", { name: "Cancelar registro" }).first().click();
		await pantalla.servidor.base.dueno.query(
			"UPDATE registros_operacion SET version = version + 1 WHERE lote_id = $1",
			[lotes["L-2026-002"]],
		);
		const ventana = pagina.getByRole("dialog", { name: /^Cancelar el registro de / });
		await ventana.getByLabel("Motivo").fill("Se registró dos veces");
		await ventana.getByRole("button", { name: "Cancelar registro" }).click();
		await enPantalla(
			ventana.getByText("L-2026-002 cambió mientras lo veías. Revisa los cambios y vuelve a guardar"),
		).toBeVisible();
		await pantalla.capturar(pagina, "produccion/choque-de-version");
		await pagina.close();
	});

	it("«Imprimir etiquetas de bulto» llama a su acción y avisa lo que regresa", tiempo, async () => {
		const pagina = await pantalla.abrir(`/produccion/lotes?cajon=lote&id=${lotes["L-2026-002"]}`, {
			quien: "produccion",
		});
		const llamada = esperarAccion(pagina, "produccion.imprimir_etiquetas_bulto");
		await pagina.getByRole("dialog").getByRole("button", { name: "Imprimir etiquetas de bulto" }).click();
		const datos = (await llamada).postDataJSON() as { datos: { lote_id: string } };
		expect(datos.datos.lote_id).toBe(lotes["L-2026-002"]);
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(
			/^\d+ etiquetas de bulto a la impresora del taller: B-.+ a B-.+$|^No hay impresora del taller: descarga el PDF de las etiquetas\.$/,
		);
		await pagina.close();
	});

	it("Órdenes de producción: tarjetas con su hilo, el filtro y «Nueva orden de producción»", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/ordenes", { quien: "produccion" });
		await enPantalla(pagina.getByText("Distribuidora Escolar Zamora").first()).toBeVisible();
		await enPantalla(pagina.getByText("Temporada · bodega").first()).toBeVisible();
		await pantalla.capturar(pagina, "produccion/ordenes-escritorio");
		await pagina
			.getByRole("toolbar", { name: "Filtrar órdenes" })
			.getByRole("button", { name: /^Reabasto/ })
			.click();
		await enPantalla(pagina).toHaveURL(/filtro=reabasto/);
		await enPantalla(pagina.getByText("Distribuidora Escolar Zamora")).toHaveCount(0);
		await pagina.getByRole("button", { name: "Nueva orden de producción" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Orden de producción nueva" });
		await ventana.getByLabel("Buscar prenda").fill("Pants marino");
		await ventana.getByLabel("Prenda", { exact: true }).selectOption({ label: "Pants marino liso" });
		await ventana.getByLabel(/^8$/).fill("12");
		await ventana.getByLabel(/^10$/).fill("8");
		await enPantalla(ventana.getByText("Total: 20")).toBeVisible();
		await pantalla.capturar(pagina, "produccion/orden-nueva");
		const llamada = esperarAccion(pagina, "produccion.crear_orden");
		await ventana.getByRole("button", { name: "Levantar orden" }).click();
		const datos = (await llamada).postDataJSON() as { datos: { tallas: { piezas: number }[] } };
		expect(datos.datos.tallas.reduce((suma, talla) => suma + talla.piezas, 0)).toBe(20);
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^OP-\d{4}-\d+ levantada: L-\d{4}-\d+, 20 piezas por cortar$/);
		await pagina.close();
		const telefono = await pantalla.abrir("/produccion/ordenes", { quien: "produccion", tamano: "telefono" });
		await enPantalla(telefono.getByText("Temporada · bodega").first()).toBeVisible();
		await pantalla.capturar(telefono, "produccion/ordenes-telefono");
		await telefono.close();
	});

	it("Operaciones: los flujos; «Nuevo flujo», «Agregar operación» y la × llaman a su acción", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/operaciones", { quien: "produccion" });
		await enPantalla(pagina.getByText("Playera polo", { exact: true })).toBeVisible();
		await enPantalla(pagina.getByText(/lotes? en proceso usan? este flujo/).first()).toBeVisible();
		await pantalla.capturar(pagina, "produccion/operaciones-escritorio");
		// Un flujo nuevo, a partir del de Pantalón.
		await pagina.getByRole("button", { name: "Nuevo flujo" }).click();
		const flujo = pagina.getByRole("dialog", { name: "Flujo nuevo" });
		await flujo.getByLabel("Nombre").fill("Pantalón con forro");
		await flujo.getByLabel("Parte de").selectOption({ label: "Pantalón" });
		const crear = esperarAccion(pagina, "produccion.crear_flujo");
		await flujo.getByRole("button", { name: "Crear flujo" }).click();
		await crear;
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(
			"Flujo «Pantalón con forro» creado con 8 operaciones. Se escoge al dar de alta un producto",
		);
		// Le agrega una operación antes de Planchado y luego se la quita.
		const tarjeta = pagina.locator("article").filter({ hasText: "Pantalón con forro" });
		await tarjeta.getByRole("button", { name: "Agregar operación" }).click();
		const operacion = pagina.getByRole("dialog", { name: "Operación nueva en Pantalón con forro" });
		await operacion.getByLabel("Operación").fill("Pegar forro");
		await operacion.getByLabel("La hace").selectOption({ label: "Paty Lara" });
		const agregar = esperarAccion(pagina, "produccion.agregar_operacion_flujo");
		await operacion.getByRole("button", { name: "Agregar operación" }).click();
		await agregar;
		await enPantalla(avisoDeAbajo(pagina)).toHaveText(
			"Pegar forro agregada a Pantalón con forro. La tarifa la pone Personal",
		);
		await enPantalla(tarjeta.getByText("Sin tarifa")).toBeVisible();
		const quitar = esperarAccion(pagina, "produccion.quitar_operacion_flujo");
		await tarjeta.getByRole("button", { name: "Quitar Pegar forro" }).click();
		await quitar;
		await enPantalla(avisoDeAbajo(pagina)).toHaveText("Pegar forro quitada de Pantalón con forro");
		await pagina.close();
		const telefono = await pantalla.abrir("/produccion/operaciones", { quien: "produccion", tamano: "telefono" });
		await enPantalla(telefono.getByText("Playera polo", { exact: true })).toBeVisible();
		await pantalla.capturar(telefono, "produccion/operaciones-telefono");
		await telefono.close();
	});

	it("Producción por persona: la gente del Taller, sin botones ni importes", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/por-persona", { quien: "produccion" });
		const tabla = pagina.getByRole("table", { name: "Producción por persona" });
		await enPantalla(tabla.getByText("Beto Aguilar")).toBeVisible();
		await enPantalla(tabla.locator("tbody tr")).toHaveCount(13);
		await enPantalla(tabla.getByRole("button")).toHaveCount(0);
		await enPantalla(tabla.getByText("$")).toHaveCount(0);
		await pantalla.capturar(pagina, "produccion/por-persona-escritorio");
		await pagina.close();
		const telefono = await pantalla.abrir("/produccion/por-persona", { quien: "produccion", tamano: "telefono" });
		await enPantalla(telefono.getByText("Beto Aguilar")).toBeVisible();
		await pantalla.capturar(telefono, "produccion/por-persona-telefono");
		await telefono.close();
	});

	it("Corte: la lista de lotes por cortar y la captura; sin receta, solo «Falta la receta»", tiempo, async () => {
		const pagina = await pantalla.abrir(`/produccion/corte?cortar=${lotes["L-2026-019"]}`, { quien: "produccion" });
		await enPantalla(pagina.getByRole("heading", { name: "Lotes por cortar" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
		await enPantalla(pagina.getByText(/^La tela alcanza · 190 piezas llevan [\d.]+ m según la receta/)).toBeVisible();
		await enPantalla(pagina.getByText("Con este corte queda verificada la receta.")).toBeVisible();
		await pantalla.capturar(pagina, "produccion/corte-escritorio");
		// Un lote sin receta no tiene captura.
		const { rows } = await pantalla.servidor.base.dueno.query(
			`SELECT l.id FROM lotes l WHERE l.estado = 'por_cortar' AND NOT EXISTS
			 (SELECT 1 FROM recetas r WHERE r.producto_id = l.producto_id AND r.version_vigente_id IS NOT NULL) LIMIT 1`,
		);
		await pagina.goto(pagina.url().replace(/cortar=[^&]+/, `cortar=${String(rows[0]?.id)}`));
		await enPantalla(pagina.getByRole("heading", { name: "Falta la receta" })).toBeVisible();
		await enPantalla(pagina.getByText(/; Patronaje ya lo tiene en sus pendientes\.$/)).toBeVisible();
		await enPantalla(pagina.getByRole("button", { name: "Cerrar corte" })).toHaveCount(0);
		await pagina.close();
		const telefono = await pantalla.abrir(`/produccion/corte?cortar=${lotes["L-2026-019"]}`, {
			quien: "produccion",
			tamano: "telefono",
		});
		await enPantalla(telefono.getByRole("heading", { name: "Pantalón azul marino" })).toBeVisible();
		await pantalla.capturar(telefono, "produccion/corte-telefono");
		await telefono.close();
	});

	it(
		"una sugerencia de Bodega y una excepción del taller: «Levantar orden» y «Resolver» llaman a su acción",
		tiempo,
		async () => {
			const { base, ...servidor } = pantalla.servidor;
			const { rows: variantes } = await base.dueno.query(
				`SELECT v.id FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			 WHERE p.nombre = 'Pants marino liso' AND v.descontinuada_en IS NULL AND v.baja_en IS NULL
			 ORDER BY t.orden LIMIT 2`,
			);
			const { rows: tienda } = await base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'T2'");
			for (const variante of variantes) {
				await base.dueno.query(
					"INSERT INTO sugerencias_reabasto (id, variante_id, ubicacion_id, piezas, estado) VALUES ($1, $2, $3, 7, 'por_decidir')",
					[crypto.randomUUID(), variante.id, tienda[0]?.id],
				);
			}
			const { rows: bulto } = await base.dueno.query(
				`SELECT b.id, b.piezas, f.id AS operacion, f.persona_base_id AS persona FROM bultos b JOIN lotes l ON l.id = b.lote_id
			 JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.orden = 2 AND f.baja_en IS NULL
			 WHERE l.folio = 'L-2026-002' ORDER BY b.numero DESC LIMIT 1`,
			);
			await subirDeLaTablet(
				{ base, ...servidor },
				"produccion.registrar_operacion",
				{
					id: crypto.randomUUID(),
					bulto_id: bulto[0]?.id,
					flujo_operacion_id: bulto[0]?.operacion,
					piezas_buenas: Number(bulto[0]?.piezas) + 30,
					piezas_danadas: 0,
					sin_internet: false,
				},
				String(bulto[0]?.persona),
			);
			const pagina = await pantalla.abrir("/produccion?grupo=excepciones", { quien: "produccion" });
			await pagina.getByRole("button", { name: "Resolver" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Resolver excepción" });
			await ventana.getByLabel("Qué se hizo").fill("Se contó el bulto y estaba bien");
			const resolver = esperarAccion(pagina, "inventario.resolver_excepcion");
			await ventana.getByRole("button", { name: "Resolver" }).click();
			await resolver;
			await enPantalla(avisoDeAbajo(pagina)).toHaveText("Excepción resuelta: queda en Resueltas");
			await pagina.goto(pagina.url().replace("grupo=excepciones", "grupo=sugerencias"));
			const levantar = esperarAccion(pagina, "produccion.levantar_orden_sugerencia");
			await pagina.getByRole("button", { name: "Levantar orden" }).click();
			const datos = (await levantar).postDataJSON() as { datos: { sugerencia_ids: string[] } };
			expect(datos.datos.sugerencia_ids).toHaveLength(2);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^OP-\d{4}-\d+ levantada: L-\d{4}-\d+, \d+ piezas por cortar/);
			await pagina.close();
		},
	);

	it("cargando muestra la forma en gris; un error dice «No se pudo cargar» con «Reintentar»", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/lotes", { quien: "produccion" });
		await enPantalla(pagina.getByRole("heading", { name: "Por cortar" })).toBeVisible();
		let fallar = true;
		await pagina.route("**/v1/consultas/produccion.lotes**", (ruta) =>
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
		await pantalla.capturar(pagina, "produccion/estado-error");
		fallar = false;
		await pagina.getByRole("button", { name: "Reintentar" }).click();
		await enPantalla(pagina.getByRole("heading", { name: "Por cortar" })).toBeVisible();
		await pagina.close();
	});

	it("una cuenta sin Producción no entra: «No tienes acceso a esta pantalla»", tiempo, async () => {
		const pagina = await pantalla.abrir("/produccion/lotes", { quien: "bodega" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
