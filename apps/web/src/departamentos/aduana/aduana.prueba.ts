/**
 * Prueba de las pantallas de Aduana en el navegador, con la API de prueba y los datos de la muestra: cada pestaña en
 * escritorio y en teléfono con su captura; los cajones por su dirección (Recibir del taller a ciegas, Recibir material,
 * Recibir lo que viene en camino y Despachar, con lo que se junta y sin nota); cada botón con su acción y el aviso de
 * abajo con el texto que regresa (recibir del taller, de un proveedor y lo que viene en camino, despachar, recordar,
 * confirmar la entrega en una tienda sin caja, las etiquetas en PDF y devolver al proveedor); y que una cuenta sin
 * Aduana no la abre.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada pantalla de cada departamento se ve como la muestra en
 * escritorio y en teléfono…», «Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el
 * texto que regresa», «Un cajón con cambios sin guardar pregunta antes de cerrarse…» y «Cada pantalla tiene sus
 * estados: … sin permiso …») y docs/interfaz/fabrica/aduana.md
 */

import type { Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enPantalla } from "../../../../../pruebas/navegador/en-pantalla.ts";
import {
	decidirDePrueba,
	ordenParaRecibir,
	recibirDePrueba,
	traspasoEnAduana,
} from "../../../../api/src/nucleo/pruebas/aduana-de-prueba.ts";
import { loteRevisado } from "../../../../api/src/nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../../../api/src/nucleo/pruebas/catalogo-de-prueba.ts";
import { pedidoListoEnAduana } from "../../../../api/src/nucleo/pruebas/inventario-de-prueba.ts";
import { pedidoLineaEnBodega, surtirPedidoLinea } from "../../../../api/src/nucleo/pruebas/linea-de-prueba.ts";
import { levantarPantalla, type PantallaDePrueba } from "../../comun/pruebas/pantalla-de-prueba.ts";

/** Lo que tarda cada caso, con el navegador. */
const tiempo = { timeout: 240_000 };

/** Las pestañas de Aduana con su ruta y algo que se ve en cada una con los datos de la muestra. */
const pestanas = [
	{ ruta: "/aduana", nombre: "anden", seVe: /Por recibir/ },
	{ ruta: "/aduana/recepcion", nombre: "recepcion", seVe: /De proveedores/ },
	{ ruta: "/aduana/en-camino", nombre: "en-camino", seVe: /Nada en camino a aduana|Responde/ },
	{ ruta: "/aduana/despacho", nombre: "despacho", seVe: /por despachar/ },
	{ ruta: "/aduana/inventario", nombre: "inventario", seVe: /Lleva aquí/ },
	{ ruta: "/aduana/transito", nombre: "transito", seVe: /Nada en tránsito|Debe confirmar/ },
	{ ruta: "/aduana/empaque", nombre: "empaque", seVe: /Empacar, pedir la guía/ },
	{ ruta: "/aduana/historial", nombre: "historial", seVe: /Entró/ },
] as const;

/**
 * Aprieta un botón que llama a una acción y revisa que el aviso de abajo diga el mensaje que regresó; espera la
 * respuesta, porque el aviso dura 3 s.
 * @param pagina La página.
 * @param accion El nombre de la acción.
 * @param apretar Lo que la llama.
 * @returns El mensaje y lo que regresó.
 */
async function avisaLoQueRegresa(
	pagina: Page,
	accion: string,
	apretar: () => Promise<void>,
): Promise<{ mensaje: string; resultado: Record<string, unknown> }> {
	const respuesta = pagina.waitForResponse((suya) => suya.url().includes(`/v1/acciones/${accion}`));
	await apretar();
	const cuerpo = (await (await respuesta).json()) as { ok: boolean; resultado?: Record<string, unknown> };
	expect(cuerpo.ok, JSON.stringify(cuerpo)).toBe(true);
	const mensaje = String(cuerpo.resultado?.mensaje ?? "");
	await enPantalla(pagina.locator('[role="status"][aria-live="polite"]', { hasText: mensaje })).toBeVisible();
	return { mensaje, resultado: cuerpo.resultado ?? {} };
}

describe("Las pantallas de Aduana: pestañas, cajones, botones y estados", () => {
	let pantalla: PantallaDePrueba;
	beforeAll(async () => {
		pantalla = await levantarPantalla();
	}, 240_000);
	afterAll(async () => {
		await pantalla?.cerrar();
	});

	// Antes de que los casos pongan sus datos de prueba: el pedido de prueba de un caso deja a Ventas sin su pastilla.
	it("una cuenta sin Aduana que escribe su dirección ve «No tienes acceso a esta pantalla»", tiempo, async () => {
		const pagina = await pantalla.abrir("/aduana/despacho", { quien: "ventas" });
		await enPantalla(pagina.getByText("No tienes acceso a esta pantalla")).toBeVisible({ timeout: 30_000 });
		await pagina.close();
	});

	it("cada pestaña se ve en escritorio y en teléfono, con su captura", tiempo, async () => {
		for (const tamano of ["escritorio", "telefono"] as const) {
			for (const pestana of pestanas) {
				const pagina = await pantalla.abrir(pestana.ruta, { quien: "aduana", tamano });
				await enPantalla(pagina.locator("h1")).toHaveText("Aduana");
				await enPantalla(pagina.getByText(pestana.seVe).first()).toBeVisible({ timeout: 30_000 });
				await enPantalla(pagina.locator("[aria-busy='true']")).toHaveCount(0);
				await pantalla.capturar(pagina, `aduana/${pestana.nombre}-${tamano}`);
				await pagina.close();
			}
		}
	});

	it("el andén: «Recibir» lleva a Recepción y una orden de «Entra» abre Recibir material", tiempo, async () => {
		const pagina = await pantalla.abrir("/aduana", { quien: "aduana" });
		const entra = pagina.getByRole("region", { name: "Entra" });
		await enPantalla(entra.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
		await entra.getByRole("button", { name: /OC-/ }).first().click();
		expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("material");
		await enPantalla(pagina.getByRole("dialog").getByRole("heading", { name: "Recibir material" })).toBeVisible();
		await pagina
			.getByRole("dialog")
			.getByRole("button", { name: /Cerrar/ })
			.first()
			.click();
		await pagina.getByRole("button", { name: "Recibir", exact: true }).first().click();
		await enPantalla(pagina).toHaveURL(/\/aduana\/recepcion/);
		await pagina.close();
	});

	it("Recibir del taller: cuenta a ciegas, marca la talla sin contar y recibe con su acción", tiempo, async () => {
		const lote = await loteRevisado(pantalla.servidor, await siembraDelCatalogo(pantalla.servidor), [5, 3, 0]);
		const pagina = await pantalla.abrir("/aduana/recepcion", { quien: "aduana" });
		await pagina.getByRole("row").filter({ hasText: lote.folio }).getByRole("button", { name: "Recibir" }).click();
		expect(new URL(pagina.url()).searchParams.get("cajon")).toBe("taller");
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText(`Del taller · ${lote.folio}`)).toBeVisible();
		await enPantalla(cajon.getByText("Va a Bodega")).toBeVisible();
		// A ciegas: no dice cuántas aprobó Calidad.
		await enPantalla(cajon.getByText(/aprob/i)).toHaveCount(0);
		await cajon.getByLabel("Talla 4").fill("5");
		await cajon.getByRole("button", { name: "Recibir en aduana" }).click();
		await enPantalla(cajon.getByText("Cuenta esta talla, aunque sea 0")).toBeVisible();
		await pantalla.capturar(pagina, "aduana/cajon-recibir-taller");
		await cajon.getByLabel("Talla 6").fill("3");
		const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.recibir_del_taller", () =>
			cajon.getByRole("button", { name: "Recibir en aduana" }).click(),
		);
		expect(mensaje).toBe(`${lote.folio} en aduana: 8 piezas para Bodega`);
		await pagina.close();
	});

	it("Recibir material: los rollos con sus metros y su partida, y la acción de recibir", tiempo, async () => {
		const orden = await ordenParaRecibir(pantalla.servidor, 100);
		const pagina = await pantalla.abrir(`/aduana/recepcion?cajon=material&id=${orden.id}`, { quien: "aduana" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText(/Faltaban 100 m · llegan 0 m en 1 rollo/)).toBeVisible({ timeout: 30_000 });
		await cajon.getByLabel("Metros del rollo 1").fill("60,5");
		await cajon.getByLabel("Partida del rollo 1").fill("P-77");
		await cajon.getByRole("button", { name: "Otro rollo" }).click();
		await cajon.getByLabel("Metros del rollo 2").fill("39.5");
		await cajon.getByLabel("Partida del rollo 2").fill("P-78");
		await enPantalla(cajon.getByText("Llegan 2 partidas distintas")).toBeVisible();
		await enPantalla(cajon.getByText(/llegan 100 m en 2 rollos/)).toBeVisible();
		await pantalla.capturar(pagina, "aduana/cajon-recibir-material");
		const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.recibir_de_proveedor", () =>
			cajon.getByRole("button", { name: "Recibir en aduana" }).click(),
		);
		expect(mensaje).toMatch(new RegExp(`^${orden.folio} recibida: queda en aduana hasta que bodega la confirme`));
		await pagina.close();
	});

	it(
		"Recibir lo que viene en camino: «Llegó con diferencias» dice cómo cuadra y «Recibir lo contado» llama a su acción",
		tiempo,
		async () => {
			const surtido = await surtirPedidoLinea(pantalla.servidor, (await pedidoLineaEnBodega(pantalla.servidor, 1)).id);
			const pagina = await pantalla.abrir("/aduana/en-camino", { quien: "aduana" });
			const fila = pagina.getByRole("row").filter({ hasText: "Pedido en línea" }).first();
			await fila.getByRole("button", { name: "Recibir" }).click();
			expect(new URL(pagina.url()).searchParams.get("id")).toBe(surtido.traspasoId);
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText(/ · De Bodega$/)).toBeVisible();
			await cajon.getByRole("button", { name: "Llegó con diferencias" }).click();
			await cajon.getByRole("textbox", { name: /^Llegaron de / }).fill("0");
			await enPantalla(cajon.getByText("Faltan 1")).toBeVisible();
			await pantalla.capturar(pagina, "aduana/cajon-recibir-en-camino");
			await cajon.getByRole("textbox", { name: /^Llegaron de / }).fill("1");
			await enPantalla(cajon.getByText("Cuadra")).toBeVisible();
			const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.recibir_en_aduana", () =>
				cajon.getByRole("button", { name: "Recibir lo contado" }).click(),
			);
			expect(mensaje).toMatch(/^(W-\S+ completo: listo para empacar|A-\S+ recibido en aduana)/);
			await pagina.close();
		},
	);

	it(
		"Despachar: junta lo del mismo destino, sale con su acción y abre En tránsito con el despacho resaltado",
		tiempo,
		async () => {
			const uno = await traspasoEnAduana(pantalla.servidor, "T1");
			const otro = await traspasoEnAduana(pantalla.servidor, "T1");
			const pagina = await pantalla.abrir(`/aduana/despacho?cajon=despachar&id=${uno.id}`, { quien: "aduana" });
			const cajon = pagina.getByRole("dialog");
			await enPantalla(cajon.getByText(`${uno.folio} · A Tienda 1`)).toBeVisible({ timeout: 30_000 });
			await enPantalla(cajon.getByText("Juntar en el mismo despacho")).toBeVisible();
			await enPantalla(cajon.getByRole("checkbox", { name: new RegExp(`^${otro.folio} `) })).toBeChecked();
			await enPantalla(cajon.getByText("Queda en camino hasta que Tienda 1 confirme que lo recibió.")).toBeVisible();
			await pantalla.capturar(pagina, "aduana/cajon-despachar");
			const { mensaje, resultado } = await avisaLoQueRegresa(pagina, "inventario.despachar", () =>
				cajon.getByRole("button", { name: "Despachar a Tienda 1" }).click(),
			);
			expect(mensaje).toMatch(/^D-\S+ sale a Tienda 1\. Queda en tránsito hasta que lo confirmen$/);
			await enPantalla(pagina).toHaveURL(new RegExp(`/aduana/transito\\?resaltar=${String(resultado.despacho_id)}`));
			// En tránsito: la tienda no tiene caja; Aduana confirma con la firma de su encargada.
			const fila = pagina.getByRole("row").filter({ hasText: String(resultado.folio) });
			await enPantalla(fila.getByText("Recién despachado", { exact: false })).toBeVisible();
			await fila.getByRole("button", { name: "Confirmar entrega" }).click();
			const ventana = pagina.getByRole("dialog", { name: "Confirmar entrega en Tienda 1" });
			await ventana.getByLabel("Recibió").fill("Rosa Pérez");
			await pantalla.capturar(pagina, "aduana/ventana-confirmar-tienda");
			const confirmada = await avisaLoQueRegresa(pagina, "inventario.entregar_a_tienda_sin_caja", () =>
				ventana.getByRole("button", { name: "Confirmar entrega" }).click(),
			);
			expect(confirmada.mensaje).toBe(`${String(resultado.folio)} entregado en Tienda 1: 16 piezas`);
			await pagina.close();
		},
	);

	it("En tránsito: «Recordar» un despacho a Bodega llama a su acción", tiempo, async () => {
		const aBodega = await traspasoEnAduana(pantalla.servidor, "BOD");
		const pagina = await pantalla.abrir(`/aduana/despacho?cajon=despachar&id=${aBodega.id}`, { quien: "aduana" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Juntar en el mismo despacho")).toBeVisible({ timeout: 30_000 });
		for (const casilla of await cajon.getByRole("checkbox").all()) await casilla.uncheck();
		const { resultado } = await avisaLoQueRegresa(pagina, "inventario.despachar", () =>
			cajon.getByRole("button", { name: "Despachar a Bodega" }).click(),
		);
		const fila = pagina.getByRole("row").filter({ hasText: String(resultado.folio) });
		const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.recordar_despacho", () =>
			fila.getByRole("button", { name: "Recordar" }).click(),
		);
		expect(mensaje).toBe("Recordatorio enviado a Bodega. Solo quien recibe puede confirmar");
		await pagina.close();
	});

	it("lo de un cliente sin nota no sale: el candado, la tabla por talla y sin botón de despachar", tiempo, async () => {
		const { lote } = await pedidoListoEnAduana(pantalla.servidor, 4);
		const pagina = await pantalla.abrir(`/aduana/despacho?cajon=despachar&id=${lote.traspasoId}`, { quien: "aduana" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(
			cajon.getByText("Sin nota de entrega no sale. La arma Ventas con lo que recibe el cliente."),
		).toBeVisible({ timeout: 30_000 });
		await enPantalla(cajon.getByText("esperan nota")).toBeVisible();
		await enPantalla(cajon.getByRole("button", { name: /^Despachar a / })).toHaveCount(0);
		// Aduana no tiene Ventas a externos: no lleva a su pedido.
		await enPantalla(cajon.getByRole("button", { name: /^Ver pedido / })).toHaveCount(0);
		await pantalla.capturar(pagina, "aduana/cajon-despachar-sin-nota");
		await pagina.close();
	});

	it("las etiquetas de los rollos de un proveedor salen en PDF con su acción", tiempo, async () => {
		const orden = await ordenParaRecibir(pantalla.servidor, 100);
		const recibida = await recibirDePrueba(pantalla.servidor, orden, [{ metros: "100", partida: "P-5" }]);
		const traspaso = String((recibida.cuerpo.resultado as { traspaso_id: string }).traspaso_id);
		const pagina = await pantalla.abrir(`/aduana/inventario?cajon=despachar&id=${traspaso}`, { quien: "aduana" });
		const cajon = pagina.getByRole("dialog");
		await enPantalla(cajon.getByText("Etiquetas por imprimir")).toBeVisible({ timeout: 30_000 });
		const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.marcar_etiquetas_impresas", () =>
			cajon.getByRole("button", { name: "PDF" }).click(),
		);
		expect(mensaje).toMatch(/^Etiquetas de A-\S+ en PDF$/);
		await enPantalla(cajon.getByText(/^Impresas el /)).toBeVisible();
		await pagina.close();
	});

	it("Inventario en aduana: «Devolver al proveedor» escoge los rollos y llama a su acción", tiempo, async () => {
		const orden = await ordenParaRecibir(pantalla.servidor, 100);
		await recibirDePrueba(pantalla.servidor, orden, [
			{ metros: "60", partida: "P-1" },
			{ metros: "60", partida: "P-1" },
		]);
		const { rows } = await pantalla.servidor.base.dueno.query(
			"SELECT id FROM autorizaciones WHERE tipo = 'recepcion_de_mas' ORDER BY creado_en DESC LIMIT 1",
		);
		await decidirDePrueba(pantalla.servidor, String(rows[0]?.id), {
			decision: "rechazar",
			motivo: "Solo pedimos cien metros",
		});
		const pagina = await pantalla.abrir("/aduana/inventario", { quien: "aduana" });
		const fila = pagina.getByRole("row").filter({ hasText: `${orden.folio} · lo de más que rechazó Dirección` });
		await fila.getByRole("button", { name: "Devolver al proveedor" }).click();
		const ventana = pagina.getByRole("dialog", { name: /^Devolver a / });
		await enPantalla(ventana.getByText(new RegExp(`^20 m de Gabardina de prueba .* de ${orden.folio}$`))).toBeVisible();
		await ventana.getByRole("checkbox").first().check();
		await pantalla.capturar(pagina, "aduana/ventana-devolver");
		const { mensaje } = await avisaLoQueRegresa(pagina, "inventario.devolver_a_proveedor", () =>
			ventana.getByRole("button", { name: "Devolver al proveedor" }).click(),
		);
		expect(mensaje).toMatch(/^60 m de Gabardina de prueba .* regresan a /);
		await pagina.close();
	});
});
