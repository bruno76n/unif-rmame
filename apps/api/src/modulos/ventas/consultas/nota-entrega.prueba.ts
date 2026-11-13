/**
 * Prueba de `ventas.nota_entrega` con la muestra: la nota entregada con sus prendas, su pago y su vencimiento; Aduana
 * la ve sin precios, importes ni anticipo; el saldo solo a Contaduría; Bodega no la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega, saldos sin Contaduría…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la respuesta. */
interface Nota {
	folio: string;
	estado: string;
	pago: string;
	cabecera: string;
	pedido: { folio: string };
	prendas: { nombre: string; piezas: number; precio_unitario_centavos?: number }[];
	subtotal_centavos?: number;
	saldo_centavos?: number;
	recibio: string | null;
	puede: Record<string, boolean>;
}

describe("El cajón de la nota de entrega: con precios para Ventas, sin ellos para Aduana, el saldo solo a Contaduría", () => {
	let servidor: ServidorDePrueba;
	let nota: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		nota = await notaDeLaMuestra(servidor, "NV-0010");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Ventas ve la nota entregada con sus precios y su pago, sin el saldo; puede pedir nota de crédito", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.nota_entrega", { nota_id: nota });
		expect(respuesta.estado, servidor.registro.slice(-3).join("\n")).toBe(200);
		const leida = respuesta.cuerpo.resultado as Nota;
		expect(leida).toMatchObject({
			folio: "NV-0010",
			estado: "entregada",
			pago: "Sin pagar",
			pedido: { folio: "PE-0013" },
			subtotal_centavos: 1_470_000,
		});
		expect(leida.cabecera).toMatch(/^Entregada el /);
		expect(leida.prendas[0]).toMatchObject({ piezas: 70, precio_unitario_centavos: 21_000 });
		expect(leida.saldo_centavos).toBeUndefined();
		expect(respuesta.cuerpo.recortado).toContain("saldo_centavos");
		expect(leida.puede).toMatchObject({ nota_credito: true, cancelar: false, confirmar_entrega: false, pdf: true });
	});

	it("Aduana la ve sin precios, importes ni anticipo, y sin botones de Ventas", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.nota_entrega", { nota_id: nota }, "aduana");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo.resultado)).not.toMatch(/centavos/);
		expect(respuesta.cuerpo.recortado).toEqual(
			expect.arrayContaining(["precio_unitario_centavos", "subtotal_centavos"]),
		);
		expect((respuesta.cuerpo.resultado as Nota).puede).toMatchObject({ nota_credito: false, cancelar: false });
	});

	it("Contaduría ve el saldo; Bodega no la pide", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.nota_entrega", { nota_id: nota }, "contaduria");
		expect((respuesta.cuerpo.resultado as Nota).saldo_centavos).toBe(1_470_000);
		expect((await pedirConsulta(servidor, "ventas.nota_entrega", { nota_id: nota }, "bodega")).estado).toBe(403);
	});
});
