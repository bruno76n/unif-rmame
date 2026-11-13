/**
 * Prueba de las pantallas de Tienda en línea en el navegador, con la API de prueba y la muestra (más unos W- que manda
 * el sitio): cada pestaña y el cajón se ven como la muestra (con sus capturas en escritorio y en teléfono), «Cancelar
 * pedido» llama a su acción y el aviso de abajo dice el texto que regresa, un choque de versión lo avisa en el cajón, y
 * una cuenta sin Tienda en línea no entra.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa» y «Cada pantalla tiene sus estados: … choque de versión»)
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import { meterPiezas, ubicacionesPorCodigo } from "../../../../api/src/nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaEnBodega,
	prendaEnLinea,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../../api/src/nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Cuánto espera cada caso: abre el navegador y lee la API. */
const espera = { timeout: 120_000 };

describe("Las pantallas de Tienda en línea: pestañas, cajón, botones y avisos", () => {
	let pantalla: PantallaDePrueba;
	/** Los W- de la prueba: uno pagado hace días, uno por surtir, uno esperando prendas, uno listo y uno cancelado. */
	const w = { viejo: "", porSurtir: "", esperando: "", listo: "", cancelado: "" };
	const folios = { viejo: "", porSurtir: "", esperando: "", listo: "", cancelado: "" };

	beforeAll(async () => {
		pantalla = await levantarPantalla();
		const { servidor } = pantalla;
		// Uno pagado hace tres días, ya en rojo.
		const [variante = ""] = await prendaEnLinea(servidor);
		const { BOD = "" } = await ubicacionesPorCodigo(servidor);
		await meterPiezas(servidor, BOD, variante, 1);
		const viejo = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }], {
			pago: { pagado_en: new Date(Date.now() - 3 * 86_400_000).toISOString() },
		});
		const llego = await comoElSitio(servidor, "linea.recibir_pedido", viejo);
		w.viejo = viejo.id;
		folios.viejo = String(llego.cuerpo.resultado.folio);
		for (const clave of ["porSurtir", "esperando", "listo", "cancelado"] as const) {
			const pedido = await pedidoLineaEnBodega(servidor, 2);
			w[clave] = pedido.id;
			folios[clave] = pedido.folio;
		}
		await surtirPedidoLinea(servidor, w.esperando);
		const { traspasoId } = await surtirPedidoLinea(servidor, w.listo);
		await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		await cancelar(w.cancelado, "La clienta pidió cancelar");
	}, 240_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	/**
	 * Cancela un W- por la API, como Tienda en línea.
	 * @param id El W-.
	 * @param motivo Por qué.
	 */
	async function cancelar(id: string, motivo: string) {
		const { rows } = await pantalla.servidor.base.dueno.query(
			"SELECT version::int AS v FROM pedidos_linea WHERE id = $1",
			[id],
		);
		return mandarAccion(
			pantalla.servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: id, motivo }, version: rows[0]?.v },
			"linea",
		);
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

	it(
		"Pendientes: los tres indicadores y los W- abiertos, rojos desde los días de pagado; «Ver pedido» abre el cajón",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/linea", { quien: "linea" });
			await enPantalla(pagina.locator("h1")).toHaveText("Tienda en línea");
			for (const cifra of ["Pedidos", "Ventas en línea", "Disponibilidad"]) {
				await enPantalla(pagina.getByRole("button", { name: new RegExp(cifra) }).first()).toBeVisible();
			}
			const tabla = pagina.getByRole("table", { name: "Pendientes" });
			const viejo = tabla.getByRole("row", { name: new RegExp(folios.viejo) });
			await enPantalla(viejo.getByText("Por surtir")).toBeVisible();
			await enPantalla(viejo.getByText(/Bodega la surte/)).toBeVisible();
			await enPantalla(tabla.getByRole("row", { name: new RegExp(folios.listo) })).toContainText(
				"Completo en aduana · listo para empacar",
			);
			await enPantalla(tabla.getByRole("row", { name: new RegExp(folios.cancelado) })).toHaveCount(0);
			// El más viejo va arriba: está en rojo.
			await enPantalla(tabla.getByRole("row").nth(1)).toContainText(folios.viejo);
			// La pestaña cuenta todo lo pendiente, lo mismo que el panel; la pastilla del menú, solo los por surtir.
			const renglones = (await tabla.getByRole("row").count()) - 1;
			await enPantalla(pagina.getByRole("tab", { name: /Pendientes/ })).toHaveText(
				new RegExp(`^Pendientes\\s*${renglones}$`),
			);
			await pantalla.capturar(pagina, "linea/pendientes-escritorio");
			await viejo.getByRole("button", { name: "Ver pedido" }).click();
			await enPantalla(pagina).toHaveURL(new RegExp(`cajon=pedido&id=${w.viejo}`));
			await enPantalla(pagina.getByRole("dialog")).toContainText(folios.viejo);
			await pagina.close();
			const telefono = await pantalla.abrir("/linea", { quien: "linea", tamano: "telefono" });
			await enPantalla(telefono.getByRole("table", { name: "Pendientes" })).toBeVisible();
			await pantalla.capturar(telefono, "linea/pendientes-telefono");
			await telefono.close();
		},
	);

	it(
		"Pedidos: el tablero por etapa con sus tarjetas, el buscador en la dirección y los cerrados abajo",
		espera,
		async () => {
			const pagina = await pantalla.abrir("/linea/pedidos", { quien: "linea" });
			const porSurtir = pagina.getByRole("region", { name: "Por surtir" });
			await enPantalla(porSurtir.getByRole("button", { name: new RegExp(folios.porSurtir) })).toBeVisible();
			await enPantalla(porSurtir.getByText("Sale hoy").first()).toBeVisible();
			await enPantalla(
				pagina
					.getByRole("region", { name: "Esperando prendas" })
					.getByRole("button", { name: new RegExp(folios.esperando) }),
			).toBeVisible();
			await enPantalla(
				pagina
					.getByRole("region", { name: "Listo para empacar" })
					.getByRole("button", { name: new RegExp(folios.listo) }),
			).toBeVisible();
			const cerrados = pagina.getByRole("region", { name: "Cerrados" });
			await enPantalla(cerrados.getByText(/La clienta pidió cancelar/)).toBeVisible();
			await pantalla.capturar(pagina, "linea/pedidos-escritorio");
			await pagina.getByLabel("Buscar pedidos").fill(folios.listo);
			await enPantalla(pagina).toHaveURL(new RegExp(`buscar=${folios.listo}`));
			await enPantalla(porSurtir.getByText("Ninguno")).toBeVisible();
			await pagina.getByLabel("Buscar pedidos").fill("zzzz");
			await enPantalla(pagina.getByText("Ningún pedido con ese folio o cliente")).toBeVisible();
			await pagina.getByLabel("Buscar pedidos").fill("");
			// Un cerrado se abre para consultarlo, sin «Cancelar pedido».
			await cerrados.getByRole("button", { name: new RegExp(folios.cancelado) }).click();
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText(/Cancelado el .+: La clienta pidió cancelar/)).toBeVisible();
			await enPantalla(cajon.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);
			await pagina.close();
			const telefono = await pantalla.abrir("/linea/pedidos", { quien: "linea", tamano: "telefono" });
			await enPantalla(telefono.getByRole("region", { name: "Por surtir" })).toBeVisible();
			await pantalla.capturar(telefono, "linea/pedidos-telefono");
			await telefono.close();
		},
	);

	it("Disponibilidad: la leyenda y una ficha por producto con un cuadro por talla", espera, async () => {
		const pagina = await pantalla.abrir("/linea/disponibilidad", { quien: "linea" });
		for (const texto of ["Sale hoy · hay en bodega", "Sale mañana · está en una tienda", "Agotado"]) {
			await enPantalla(pagina.getByText(texto, { exact: true })).toBeVisible();
		}
		const { rows } = await pantalla.servidor.base.dueno.query(
			"SELECT p.nombre FROM pedidos_linea w JOIN pedido_linea_renglones r ON r.pedido_linea_id = w.id JOIN variantes v ON v.id = r.variante_id JOIN productos p ON p.id = v.producto_id WHERE w.id = $1",
			[w.porSurtir],
		);
		const ficha = pagina.getByRole("article", { name: String(rows[0]?.nombre) });
		await enPantalla(ficha).toBeVisible();
		await enPantalla(ficha.getByTitle(/^(Sale hoy: hay en bodega|Agotado)$/).first()).toBeVisible();
		await pantalla.capturar(pagina, "linea/disponibilidad-escritorio");
		await pagina.close();
		const telefono = await pantalla.abrir("/linea/disponibilidad", { quien: "linea", tamano: "telefono" });
		await enPantalla(telefono.getByText("Sale hoy · hay en bodega", { exact: true })).toBeVisible();
		await pantalla.capturar(telefono, "linea/disponibilidad-telefono");
		await telefono.close();
	});

	it(
		"el cajón del pedido: cifras, datos, prendas con dónde están, totales y camino; «Cancelar pedido» llama a su acción y avisa",
		espera,
		async () => {
			const pagina = await pantalla.abrir(`/linea/pedidos?cajon=pedido&id=${w.esperando}`, { quien: "linea" });
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText("pagó, con envío")).toBeVisible();
			await enPantalla(cajon.getByText("lo que se le prometió")).toBeVisible();
			await enPantalla(cajon.getByText("laura@correo.invalid")).toBeVisible();
			await enPantalla(cajon.getByText("Hidalgo 120, Centro")).toBeVisible();
			await enPantalla(
				cajon.getByRole("table", { name: "Prendas del pedido" }).getByText(/En camino a aduana · A-/),
			).toBeVisible();
			await enPantalla(cajon.getByText("0 de 2 prendas en aduana")).toBeVisible();
			await enPantalla(cajon.getByText("Surtido a aduana")).toBeVisible();
			await enPantalla(cajon.getByText("Historial")).toBeVisible();
			// El pie lleva «Cerrar» a la izquierda, junto a «Cancelar pedido».
			await enPantalla(cajon.getByRole("button", { name: "Cerrar", exact: true })).toHaveCount(2);
			await pantalla.capturar(pagina, "linea/cajon-pedido");
			await cajon.getByRole("button", { name: "Cancelar pedido" }).click();
			const ventana = pagina.getByRole("dialog", { name: `Cancelar ${folios.esperando}` });
			await enPantalla(ventana.getByText(/El reembolso lo hace uniformame.mx con su pasarela/)).toBeVisible();
			await pantalla.capturar(pagina, "linea/ventana-cancelar");
			await ventana.getByLabel("Motivo").fill("La clienta ya no lo quiere");
			const mensaje = await avisaLoQueRegresa(pagina, "linea.cancelar_pedido", () =>
				ventana.getByRole("button", { name: "Cancelar pedido" }).click(),
			);
			expect(mensaje).toBe(`${folios.esperando} cancelado. Lo que ya estaba en aduana regresa a su origen`);
			await enPantalla(cajon.getByText(/Cancelado el .+: La clienta ya no lo quiere/)).toBeVisible();
			await pagina.close();
			const telefono = await pantalla.abrir(`/linea/pedidos?cajon=pedido&id=${w.listo}`, {
				quien: "linea",
				tamano: "telefono",
			});
			await enPantalla(telefono.getByRole("dialog").getByText("2 de 2 prendas en aduana")).toBeVisible();
			await pantalla.capturar(telefono, "linea/cajon-pedido-telefono");
			await telefono.close();
		},
	);

	it("si el W- cambió mientras se veía, cancelar avisa el choque de versión en el cajón", espera, async () => {
		const pagina = await pantalla.abrir(`/linea/pedidos?cajon=pedido&id=${w.porSurtir}`, { quien: "linea" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByRole("button", { name: "Cancelar pedido" })).toBeVisible();
		// Otra persona lo cancela mientras tanto: la versión que tiene la pantalla ya no es la de ahora.
		expect((await cancelar(w.porSurtir, "Lo canceló otra persona")).estado).toBe(200);
		await cajon.getByRole("button", { name: "Cancelar pedido" }).click();
		const ventana = pagina.getByRole("dialog", { name: `Cancelar ${folios.porSurtir}` });
		await ventana.getByLabel("Motivo").fill("La clienta pidió cancelar");
		await ventana.getByRole("button", { name: "Cancelar pedido" }).click();
		await enPantalla(cajon.getByText(`${folios.porSurtir} cambió mientras lo veías`, { exact: false })).toBeVisible();
		await enPantalla(cajon.getByText(/Cancelado el .+: Lo canceló otra persona/)).toBeVisible();
		await pagina.close();
	});

	it("una cuenta sin Tienda en línea no entra: «No tienes acceso a esta pantalla»", espera, async () => {
		const pagina = await pantalla.abrir("/linea/pedidos", { quien: "bodega" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible();
		await pagina.close();
	});
});
