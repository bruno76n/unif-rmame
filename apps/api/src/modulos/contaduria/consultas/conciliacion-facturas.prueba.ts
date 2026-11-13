/**
 * Prueba de `contaduria.conciliacion_facturas` con la muestra: las facturas de proveedor con su estado (sin las
 * detenidas sin autorización), las órdenes recibidas que esperan factura al final, los filtros, y solo Contaduría la
 * pide (Aduana nunca ve importes de facturas).
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la cuenta
 * no debe ver: precios a Aduana y Bodega…») y docs/interfaz/fabrica/contaduria.md («Facturas de proveedor»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const conciliacion = z.object({
	renglones: z.array(
		z.object({
			factura_proveedor_id: z.string().nullable(),
			folio: z.string().nullable(),
			estado: z.object({ texto: z.string() }),
			cancelable: z.boolean(),
		}),
	),
});

describe("Facturas de proveedor", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("salen las facturas que no están detenidas, con su estado, y al final las órdenes que esperan factura", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.conciliacion_facturas", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const { renglones } = conciliacion.parse(pedida.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT folio, estado FROM facturas_proveedor");
		const noDetenidas = rows.filter((fila: { estado: string }) => fila.estado !== "detenida");
		const conFactura = renglones.filter((renglon) => renglon.factura_proveedor_id !== null);
		expect(conFactura.map((renglon) => renglon.folio).sort()).toEqual(
			noDetenidas.map((fila: { folio: string }) => fila.folio).sort(),
		);
		expect(
			conFactura.every((renglon) => renglon.estado.texto === "Lista para pagar" || renglon.estado.texto === "Pagada"),
		).toBe(true);
		// Una conciliada sin pagos se puede cancelar.
		expect(conFactura.some((renglon) => renglon.cancelable)).toBe(true);
		const primeraSinFactura = renglones.findIndex((renglon) => renglon.factura_proveedor_id === null);
		if (primeraSinFactura !== -1) {
			expect(renglones.slice(primeraSinFactura).every((renglon) => renglon.estado.texto === "Esperando factura")).toBe(
				true,
			);
		}
	});

	it("el filtro por estado deja solo las de ese estado", async () => {
		const { renglones } = conciliacion.parse(
			(await pedirConsulta(servidor, "contaduria.conciliacion_facturas", { estado: "cancelada" }, "contaduria")).cuerpo
				.resultado,
		);
		expect(renglones).toEqual([]);
	});

	it("solo Contaduría la pide: Aduana y Bodega reciben 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.conciliacion_facturas", {}, "aduana")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "contaduria.conciliacion_facturas", {}, "bodega")).estado).toBe(403);
	});
});
