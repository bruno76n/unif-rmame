/**
 * Prueba de `ventas.editor_pedido` con la muestra: el pedido nuevo con el folio que sigue, la forma de pago del
 * parámetro y los clientes activos con su crédito sin montos; Modificar pedido con la versión que sigue, sus prendas y
 * el mínimo de cada talla; y que solo Ventas lo pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la respuesta. */
interface Editor {
	folio: string;
	modo: string;
	version_siguiente: number | null;
	forma_pago_inicial: string;
	piezas_max_talla: number;
	clientes: { nombre: string; detenido: boolean }[];
	pedido: { cliente_id: string } | null;
	prendas: { se_quita: boolean; tallas: { talla: string; minimo: number; cantidad: number }[] }[];
}

describe("El editor del pedido: nuevo o modificado, con sus clientes, sus prendas y sus mínimos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un pedido nuevo: el folio que sigue, la forma de pago del parámetro y los clientes sin montos", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.editor_pedido");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const editor = respuesta.cuerpo.resultado as Editor;
		expect(editor).toMatchObject({ folio: "PE-0018", modo: "nuevo", forma_pago_inicial: "anticipo", pedido: null });
		expect(editor.piezas_max_talla).toBe(9999);
		expect(editor.clientes).toHaveLength(6);
		expect(editor.clientes.find((cliente) => cliente.nombre === "Uniformes El Bajío")?.detenido).toBe(true);
		expect(JSON.stringify(editor)).not.toMatch(/saldo|_centavos/);
	});

	it("Modificar pedido: la versión que sigue, sus prendas y el mínimo de lo entregado", async () => {
		const pedidoId = await pedidoDeLaMuestra(servidor, "PE-0013");
		const editor = (await pedirConsulta(servidor, "ventas.editor_pedido", { pedido_id: pedidoId })).cuerpo
			.resultado as Editor;
		expect(editor).toMatchObject({ folio: "PE-0013", modo: "confirmado", version_siguiente: 2 });
		const tallas = editor.prendas.flatMap((prenda) => prenda.tallas);
		// La nota entregada llevó 20 de la talla 8: no baja de ahí, y esa prenda ya no se quita.
		expect(tallas.find((talla) => talla.talla === "8" && talla.minimo === 20)).toBeDefined();
		expect(editor.prendas.some((prenda) => !prenda.se_quita)).toBe(true);
		expect(tallas.every((talla) => talla.cantidad >= talla.minimo)).toBe(true);
	});

	it("solo Ventas lo pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.editor_pedido", {}, "contaduria")).estado).toBe(403);
	});
});
