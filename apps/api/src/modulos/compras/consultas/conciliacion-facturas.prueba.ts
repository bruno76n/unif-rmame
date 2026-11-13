/**
 * Prueba de `compras.conciliacion_facturas` con los datos de la muestra: las facturas detenidas con a cargo de quién
 * (Contaduría o Aduana) y por qué, y las órdenes recibidas sin factura «Esperando al proveedor», cada una con sus tres
 * puntos; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un renglón de la conciliación, en lo que se revisa. */
interface Renglon {
	factura: string | null;
	orden: string;
	puntos: Record<"orden" | "recepcion" | "factura", { texto: string; como: string }>;
	que_no_cuadra: string;
	estado: { texto: string; color: string };
}

describe("Conciliación de facturas: orden, recepción y factura", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("las detenidas dicen quién las tiene y por qué; las que no han llegado esperan al proveedor", async () => {
		const respuesta = await pedirConsulta(servidor, "compras.conciliacion_facturas", {}, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { renglones } = respuesta.cuerpo.resultado as { renglones: Renglon[] };
		const { rows } = await servidor.base.dueno.query(
			`SELECT f.folio, f.responsable_detencion AS responsable, f.motivo_detencion AS motivo FROM facturas_proveedor f
			 WHERE f.estado = 'detenida'`,
		);
		for (const factura of rows as { folio: string; responsable: string; motivo: string }[]) {
			const renglon = renglones.find((uno) => uno.factura === factura.folio);
			expect(renglon?.que_no_cuadra, factura.folio).toBe(factura.motivo);
			expect(renglon?.estado.texto).toBe(
				factura.responsable === "aduana" ? "Esperando a Aduana" : "Esperando a Contaduría",
			);
			if (factura.responsable === "aduana")
				expect(renglon?.puntos.recepcion).toEqual({ texto: "Sin recibir", como: "falta" });
			else expect(renglon?.puntos.factura.como).toBe("no_coincide");
		}
		const sinFactura = renglones.filter((renglon) => renglon.factura === null);
		expect(sinFactura.length).toBeGreaterThan(0);
		for (const renglon of sinFactura) {
			expect(renglon.estado).toMatchObject({ texto: "Esperando al proveedor", color: "naranja" });
			expect(renglon.puntos.factura).toEqual({ texto: "No ha llegado", como: "falta" });
			expect(renglon.que_no_cuadra).toMatch(/^Se recibieron .+ el .+ y la factura no ha llegado$/);
		}
		// Una orden con factura no cancelada no espera factura.
		const { rows: facturadas } = await servidor.base.dueno.query(
			`SELECT DISTINCT o.folio FROM ordenes_compra o JOIN factura_proveedor_ordenes fo ON fo.orden_compra_id = o.id
			 JOIN facturas_proveedor f ON f.id = fo.factura_proveedor_id WHERE f.estado <> 'cancelada'`,
		);
		const conFactura = (facturadas as { folio: string }[]).map((fila) => fila.folio);
		expect(sinFactura.some((renglon) => conFactura.includes(renglon.orden))).toBe(false);
	});

	it("solo la piden las cuentas con Compras: Aduana y Bodega nunca reciben importes", async () => {
		for (const quien of ["aduana", "bodega"]) {
			const respuesta = await pedirConsulta(servidor, "compras.conciliacion_facturas", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/\$/);
		}
	});
});
