/**
 * Prueba de las pantallas de Calidad en el navegador, contra los datos de la muestra, en escritorio y en teléfono:
 * cada pestaña se ve con sus datos y su captura para el revisor de diseño; la revisión del lote de la muestra con sus
 * rechazos (y la pregunta antes de salir con rechazos capturados); cada botón llama a su acción y el aviso de abajo dice
 * el texto que regresa; y sus estados (error, choque de versión y sin permiso).
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el texto
 * que regresa», «Un cajón con cambios sin guardar pregunta antes de cerrarse, de cambiar de pestaña o de salir por el
 * menú» y «Cada pantalla tiene sus estados») y docs/interfaz/fabrica/calidad.md
 */

import { expect as enPantalla, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { devolucionEnAduana, loteEnAduana } from "../../../../api/src/modulos/calidad/consultas/de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Lo que tarda cada caso, con el navegador. */
const tiempo = { timeout: 180_000 };

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
	// Con una ventana abierta, lo de afuera queda fuera del árbol de accesibilidad: se busca por su forma.
	return pagina.locator('[role="status"][aria-live="polite"] > span:last-child');
}

describe("Las pantallas de Calidad", () => {
	let pantalla: PantallaDePrueba;
	/** El lote terminado de la muestra. */
	let loteDeLaMuestra = "";
	/** Una consulta con el rol dueño. */
	const consultar = async (texto: string, valores: unknown[] = []) =>
		(await pantalla.servidor.base.dueno.query(texto, valores)).rows;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const [lote] = await consultar("SELECT id FROM lotes WHERE folio = 'L-2026-001'");
		loteDeLaMuestra = String(lote?.id);
	}, 180_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	it(
		"Pendientes: las tres cifras, el lote «Por revisar hoy», «Revisar lote» arriba y el filtro en la dirección, en escritorio y teléfono",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/calidad", { quien: "calidad" });
			await enPantalla(pagina.locator("h1")).toHaveText("Calidad");
			for (const cifra of ["Por revisar", "Defectos", "Reclamos"]) {
				await enPantalla(pagina.getByRole("button", { name: new RegExp(`^${cifra}`) }).first()).toBeVisible();
			}
			await enPantalla(pagina.getByText("L-2026-001 · Pants marino liso")).toBeVisible();
			await enPantalla(pagina.getByText("Por revisar hoy")).toBeVisible();
			await enPantalla(pagina.getByRole("button", { name: "Revisar lote" })).toBeVisible();
			await pantalla.capturar(pagina, "calidad/pendientes-escritorio");
			await pagina
				.getByRole("toolbar", { name: "Filtrar pendientes" })
				.getByRole("button", { name: /^Lotes/ })
				.click();
			await enPantalla(pagina).toHaveURL(/grupo=lotes/);
			await pagina.close();
			const telefono = await pantalla.abrir("/calidad", { quien: "calidad", tamano: "telefono" });
			await enPantalla(telefono.getByText("Por revisar hoy")).toBeVisible();
			await pantalla.capturar(telefono, "calidad/pendientes-telefono");
			await telefono.close();
		},
	);

	it(
		"la revisión del lote: tallas y defectos; con rechazos pregunta antes de salir; «Aprobar {n} y regresar {m}» llama a su acción",
		tiempo,
		async () => {
			const pagina = await pantalla.abrir("/calidad/por-revisar", { quien: "calidad" });
			await enPantalla(pagina.getByText("Pants marino liso")).toBeVisible();
			await pantalla.capturar(pagina, "calidad/por-revisar-escritorio");
			await pagina.getByRole("button", { name: "Revisar", exact: true }).click();
			await enPantalla(pagina).toHaveURL(new RegExp(`lote=${loteDeLaMuestra}`));
			await enPantalla(pagina.getByRole("heading", { name: "Pants marino liso" })).toBeVisible();
			await enPantalla(pagina.getByRole("button", { name: "Aprobar 118" })).toBeVisible();
			// Dos toques en «Costura abierta», en la primera talla.
			const defecto = pagina.getByRole("group", { name: "Rechazar por defecto" });
			await defecto.getByRole("button", { name: "Costura abierta" }).click();
			await defecto.getByRole("button", { name: "Costura abierta" }).click();
			await enPantalla(pagina.getByRole("heading", { name: "Regresan a reproceso" })).toBeVisible();
			await enPantalla(pagina.getByRole("button", { name: "Aprobar 116 y regresar 2" })).toBeVisible();
			await pantalla.capturar(pagina, "calidad/revision-escritorio");
			// Salir con rechazos capturados pregunta antes.
			await pagina.getByRole("button", { name: "Por revisar", exact: true }).first().click();
			const pregunta = pagina.getByRole("dialog", { name: "Tienes cambios sin guardar. ¿Salir sin guardar?" });
			await enPantalla(pregunta).toBeVisible();
			await pregunta.getByRole("button", { name: "Volver" }).click();
			await enPantalla(pagina).toHaveURL(new RegExp(`lote=${loteDeLaMuestra}`));
			// Aprobar: la acción con los rechazos y el aviso que regresa.
			const llamada = esperarAccion(pagina, "calidad.revisar_lote");
			await pagina.getByRole("button", { name: "Aprobar 116 y regresar 2" }).click();
			const datos = (await llamada).postDataJSON() as {
				datos: { lote_id: string; rechazos: { piezas: number; persona_id: string }[] };
			};
			expect(datos.datos.lote_id).toBe(loteDeLaMuestra);
			expect(datos.datos.rechazos).toHaveLength(1);
			expect(datos.datos.rechazos[0]?.piezas).toBe(2);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(
				"L-2026-001: 116 aprobadas pasan a aduana, 2 regresan al taller",
			);
			await enPantalla(pagina).not.toHaveURL(/lote=/);
			await enPantalla(pagina.getByRole("heading", { name: "Revisados hoy" })).toBeVisible();
			await enPantalla(pagina.getByText("Ningún lote espera revisión.")).toBeVisible();
			await enPantalla(pagina.getByRole("button", { name: "Aprobar", exact: true })).toBeDisabled();
			await enPantalla(
				pagina.getByText("Aduana todavía no recibe L-2026-001: el reproceso se aprueba después."),
			).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir("/calidad/por-revisar", { quien: "calidad", tamano: "telefono" });
			await enPantalla(telefono.getByRole("heading", { name: "Revisados hoy" })).toBeVisible();
			await pantalla.capturar(telefono, "calidad/por-revisar-telefono");
			await telefono.close();
		},
	);

	it(
		"con el lote en aduana, «Aprobar» el reproceso llama a su acción y el aviso dice lo que regresa",
		tiempo,
		async () => {
			await loteEnAduana(pantalla.servidor, loteDeLaMuestra);
			const pagina = await pantalla.abrir("/calidad/por-revisar", { quien: "calidad" });
			const llamada = esperarAccion(pagina, "calidad.aprobar_reproceso");
			await pagina.getByRole("button", { name: "Aprobar", exact: true }).click();
			const datos = (await llamada).postDataJSON() as { datos: { reproceso_id: string }; version: number };
			expect(datos.datos.reproceso_id).toMatch(/^[0-9a-f-]{36}$/);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^2 piezas de L-2026-001 aprobadas: pasan a aduana/);
			await enPantalla(pagina.getByText("Aprobado", { exact: true })).toBeVisible();
			await pagina.close();
		},
	);

	it("Defectos: el periodo, las tasas y el catálogo; «Agregar al catálogo» llama a su acción", tiempo, async () => {
		const pagina = await pantalla.abrir("/calidad/defectos", { quien: "calidad" });
		await enPantalla(pagina.getByText("Últimos 30 días")).toBeVisible();
		await enPantalla(pagina.getByText("118 piezas revisadas en 1 lote · 2 rechazadas (1.7%)")).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Por operación" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Por persona" })).toBeVisible();
		await enPantalla(pagina.getByRole("heading", { name: "Catálogo de defectos" })).toBeVisible();
		await pantalla.capturar(pagina, "calidad/defectos-escritorio");
		await pagina.getByRole("button", { name: "Agregar defecto" }).click();
		const ventana = pagina.getByRole("dialog", { name: "Defecto nuevo" });
		await ventana.getByLabel("Defecto").fill("Botón despegado");
		await ventana.getByRole("group", { name: "En qué operaciones pasa" }).getByRole("button").first().click();
		const llamada = esperarAccion(pagina, "calidad.agregar_defecto");
		await ventana.getByRole("button", { name: "Agregar al catálogo" }).click();
		const datos = (await llamada).postDataJSON() as { datos: { nombre: string; operacion_ids: string[] } };
		expect(datos.datos).toMatchObject({ nombre: "Botón despegado" });
		expect(datos.datos.operacion_ids).toHaveLength(1);
		await enPantalla(avisoDeAbajo(pagina)).toHaveText("Botón despegado agregado: ya se puede escoger al revisar");
		await pagina.close();
		const telefono = await pantalla.abrir("/calidad/defectos", { quien: "calidad", tamano: "telefono" });
		await enPantalla(telefono.getByText("Últimos 30 días")).toBeVisible();
		await pantalla.capturar(telefono, "calidad/defectos-telefono");
		await telefono.close();
	});

	it(
		"Reclamos: «Registrar reclamo» y «Marcar resuelto» llaman a su acción; el rastreo, el buscador y el choque de versión",
		tiempo,
		async () => {
			const [cliente] = await consultar(
				"SELECT t.nombre FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE c.baja_en IS NULL ORDER BY t.nombre LIMIT 1",
			);
			// Una talla que Calidad revisó solo en este lote (las pruebas de arriba revisan otros): así la ventana
			// escoge el lote sola, porque es el único revisado con esa talla.
			const [variante] = await consultar(
				`SELECT v.codigo FROM revision_tallas rt JOIN revisiones rv ON rv.id = rt.revision_id
				 JOIN variantes v ON v.id = rt.variante_id WHERE rv.lote_id = $1
				 AND NOT EXISTS (SELECT 1 FROM revision_tallas otra JOIN revisiones rv2 ON rv2.id = otra.revision_id
				   WHERE otra.variante_id = v.id AND rv2.lote_id <> $1)
				 ORDER BY v.codigo LIMIT 1`,
				[loteDeLaMuestra],
			);
			expect(variante, "una talla revisada solo en este lote").toBeDefined();
			const [defecto] = await consultar(
				`SELECT d.nombre FROM defectos d JOIN defecto_operaciones x ON x.defecto_id = d.id AND x.baja_en IS NULL
				 JOIN flujo_operaciones f ON f.operacion_id = x.operacion_id JOIN lotes l ON l.flujo_id = f.flujo_id
				 WHERE l.id = $1 ORDER BY d.creado_en LIMIT 1`,
				[loteDeLaMuestra],
			);
			const pagina = await pantalla.abrir("/calidad/reclamos", { quien: "calidad" });
			await enPantalla(pagina.getByText("Sin reclamos")).toBeVisible();
			await pagina.getByRole("button", { name: "Nuevo reclamo" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Reclamo nuevo" });
			await ventana.getByLabel("Cliente", { exact: true }).fill(String(cliente?.nombre));
			await ventana.getByLabel("Código de la prenda").fill(String(variante?.codigo));
			await enPantalla(ventana.getByLabel("Lote", { exact: true })).toHaveValue(loteDeLaMuestra);
			await ventana.getByLabel("Defecto", { exact: true }).selectOption({ label: String(defecto?.nombre) });
			await enPantalla(ventana.getByLabel("Operación que lo causó")).not.toHaveValue("");
			await ventana.getByLabel("Piezas").fill("2");
			await ventana.getByLabel("Qué dice el cliente").fill("Se abrió la costura al lavarla");
			await pantalla.capturar(pagina, "calidad/reclamo-nuevo");
			const llamada = esperarAccion(pagina, "calidad.registrar_reclamo");
			await ventana.getByRole("button", { name: "Registrar reclamo" }).click();
			const datos = (await llamada).postDataJSON() as { datos: Record<string, unknown> };
			expect(datos.datos).toMatchObject({ lote_id: loteDeLaMuestra, piezas: 2, codigo: String(variante?.codigo) });
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^RC-\d+ registrado\. Del código se llega al lote L-2026-001$/);
			const rastreo = pagina.getByRole("list", { name: "Rastreo" });
			await enPantalla(rastreo.getByText("L-2026-001", { exact: true })).toBeVisible();
			await enPantalla(rastreo.getByText("Partida de tela").first()).toBeVisible();
			await pantalla.capturar(pagina, "calidad/reclamos-escritorio");
			// Si el reclamo cambió mientras se veía, lo dice y no lo resuelve.
			await pagina.getByRole("button", { name: "Marcar resuelto" }).click();
			const resolver = pagina.getByRole("dialog", { name: /^Resolver RC-\d+$/ });
			await consultar("UPDATE reclamos SET version = version + 1");
			await resolver.getByLabel("Cómo se resolvió").fill("Se repusieron las 2 piezas");
			await resolver.getByRole("button", { name: "Marcar resuelto" }).click();
			await enPantalla(resolver.getByText(/^RC-\d+ cambió mientras lo veías\./)).toBeVisible();
			await pantalla.capturar(pagina, "calidad/choque-de-version");
			// Con lo nuevo cargado, otra vez: ahora sí.
			const resuelto = esperarAccion(pagina, "calidad.resolver_reclamo");
			await resolver.getByRole("button", { name: "Marcar resuelto" }).click();
			expect(((await resuelto).postDataJSON() as { datos: { resolucion: string } }).datos.resolucion).toBe(
				"Se repusieron las 2 piezas",
			);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(/^RC-\d+ queda resuelto$/);
			await enPantalla(pagina.getByText(/^Resuelto el \d+ \w+: Se repusieron las 2 piezas$/)).toBeVisible();
			// El buscador.
			await pagina.getByLabel("Código de la prenda, lote o reclamo").fill("zzz");
			await enPantalla(pagina.getByText("No hay ninguna prenda, lote ni reclamo con «zzz»")).toBeVisible();
			await enPantalla(pagina).toHaveURL(/buscar=zzz/);
			await pagina.close();
			const telefono = await pantalla.abrir("/calidad/reclamos", { quien: "calidad", tamano: "telefono" });
			await enPantalla(telefono.getByRole("list", { name: "Rastreo" })).toBeVisible();
			await pantalla.capturar(telefono, "calidad/reclamos-telefono");
			await telefono.close();
		},
	);

	it(
		"una devolución con defecto: «Revisar» abre su ventana y «Guardar decisión» llama a su acción",
		tiempo,
		async () => {
			const [defecto] = await consultar("SELECT id FROM defectos WHERE nombre = 'Costura abierta'");
			const devolucion = await devolucionEnAduana(pantalla.servidor, String(defecto?.id));
			const pagina = await pantalla.abrir("/calidad?grupo=devoluciones", { quien: "calidad" });
			await enPantalla(pagina.getByText(`${devolucion.folio} · ${devolucion.cliente}`)).toBeVisible();
			await pagina.getByRole("button", { name: "Revisar", exact: true }).click();
			await enPantalla(pagina).toHaveURL(new RegExp(`cajon=devolucion&id=${devolucion.traspasoId}`));
			const ventana = pagina.getByRole("dialog", { name: `Revisar devolución ${devolucion.folio}` });
			await enPantalla(ventana.getByText(/3 por decidir/)).toBeVisible();
			await ventana.getByLabel("Sirven").fill("2");
			await ventana.getByLabel("Merma").fill("1");
			await ventana.getByLabel("Con qué tiene").fill("Tela rota");
			await pantalla.capturar(pagina, "calidad/revisar-devolucion");
			const llamada = esperarAccion(pagina, "calidad.revisar_devolucion");
			await ventana.getByRole("button", { name: "Guardar decisión" }).click();
			const datos = (await llamada).postDataJSON() as {
				datos: { renglones: { piezas: number; decision: string; motivo?: string }[] };
			};
			expect(datos.datos.renglones).toEqual([
				expect.objectContaining({ piezas: 2, decision: "sirve" }),
				expect.objectContaining({ piezas: 1, decision: "merma", motivo: "Tela rota" }),
			]);
			await enPantalla(avisoDeAbajo(pagina)).toHaveText(`${devolucion.folio}: 2 a bodega, 1 como merma`);
			await pagina.close();
		},
	);

	it("un error dice «No se pudo cargar» con «Reintentar»", tiempo, async () => {
		const pagina = await pantalla.abrir("/calidad/defectos", { quien: "calidad" });
		await enPantalla(pagina.getByText("Últimos 30 días")).toBeVisible();
		let fallar = true;
		await pagina.route("**/v1/consultas/calidad.defectos**", (ruta) =>
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
		await enPantalla(pagina.getByText("Últimos 30 días")).toBeVisible();
		await pagina.close();
	});

	it("una cuenta sin Calidad no entra: «No tienes acceso a esta pantalla»", tiempo, async () => {
		const pagina = await pantalla.abrir("/calidad/por-revisar", { quien: "ventas" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
