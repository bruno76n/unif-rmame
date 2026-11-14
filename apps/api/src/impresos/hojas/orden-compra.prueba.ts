/**
 * Prueba de la hoja de la orden de compra: lleva lo que dice su archivo (el proveedor con su teléfono, la condición, la
 * tabla Material · Cantidad · Precio · Importe con su total, «Precios sin IVA», dónde se entrega y quién la levantó) y
 * solo la sacan Compras y Contaduría. Que el PDF guardado al enviarla no cambie lo prueba
 * `modulos/compras/acciones/marcar-orden-enviada.prueba.ts`.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada hoja lleva lo que dice su
 * archivo…») y docs/impresos/hojas.md («La orden de compra»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, levantarDePrueba } from "../../nucleo/pruebas/compras-de-prueba.ts";
import { leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("la hoja de la orden de compra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada hoja lleva lo que dice su archivo: la orden de compra, que solo sacan Compras y Contaduría", async () => {
		const proveedor = await altaDeProveedor(servidor, { nombre: "Botones del Bajío", dias_credito: 15 });
		const material = await altaDeMaterial(servidor, proveedor, { nombre: "Botón blanco 4 hoyos" });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: proveedor, cantidad: 12, precio_centavos: 4_550 },
		]);
		const pedir = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/orden_compra/${orden.id}?formato=pdf`,
				headers: encabezadosDeLaWeb(quien),
			});
		for (const quien of ["compras", "contaduria"]) {
			const respuesta = await pedir(quien);
			expect(respuesta.statusCode, respuesta.body).toBe(200);
			const texto = leerPdf(respuesta.rawPayload)
				.flatMap((pagina) => pagina.textos)
				.join(" ")
				.replace(/\s+/g, " ");
			for (const dice of [
				"Uniformes Alameda",
				"Orden de compra",
				orden.folio,
				"Creada el",
				"Proveedor",
				"Botones del Bajío",
				"Tel. 477 555 0100",
				"Crédito 15 días",
				"Material Cantidad Precio Importe",
				"Botón blanco 4 hoyos",
				"$45.50",
				"$546",
				"Total",
				"Precios sin IVA",
				"Entregar en Aduana: Av. Alameda 100",
				"La levantó",
				"Hoja 1 de 1",
			]) {
				expect(texto, quien).toContain(dice);
			}
		}
		for (const quien of ["ventas", "aduana", "bodega"]) expect((await pedir(quien)).statusCode, quien).toBe(403);
	});
});
