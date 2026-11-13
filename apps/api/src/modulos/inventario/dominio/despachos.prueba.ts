/**
 * Prueba de «por qué no sale» por despacho: la misma regla para la acción y para el cajón de Aduana.
 * Fase 19 · docs/modulos/inventario/surtido-y-despachos.md (regla 4)
 */

import { describe, expect, it } from "vitest";
import { porQueNoSale, type TraspasoPorDespachar } from "./despachos.ts";

/** Un lote en aduana que sí sale; cada caso le cambia lo suyo. */
const queSale: TraspasoPorDespachar = {
	folio: "A-0101",
	estado: "en_aduana",
	tipo: "lote_cliente",
	destinoExterno: null,
	tienePadre: false,
	tieneNotaDeEntrega: false,
};

describe("Por qué un traspaso no sale por despacho (regla 4)", () => {
	it("un lote en aduana sale", () => {
		expect(porQueNoSale(queSale)).toBeNull();
	});

	it("fuera de aduana, en línea, al proveedor, esperando a Calidad o sin nota, no sale, con su código", () => {
		expect(porQueNoSale({ ...queSale, estado: "en_transito" })?.codigo).toBe("no_esta_en_aduana");
		expect(porQueNoSale({ ...queSale, tipo: "pedido_linea" })?.codigo).toBe("se_empaca");
		expect(porQueNoSale({ ...queSale, destinoExterno: "cliente_linea" })?.codigo).toBe("se_empaca");
		expect(porQueNoSale({ ...queSale, tipo: "devolucion_proveedor" })?.codigo).toBe("es_devolucion_proveedor");
		expect(porQueNoSale({ ...queSale, tipo: "devolucion_defecto", tienePadre: true })?.codigo).toBe("espera_calidad");
		expect(porQueNoSale({ ...queSale, tipo: "devolucion_cliente_externo" })?.codigo).toBe("espera_calidad");
		expect(porQueNoSale({ ...queSale, destinoExterno: "cliente_externo" })?.codigo).toBe("sin_nota");
		expect(
			porQueNoSale({ ...queSale, tipo: "nota_entrega", destinoExterno: "cliente_externo", tieneNotaDeEntrega: false })
				?.codigo,
		).toBe("sin_nota");
	});

	it("lo de un cliente que ya tiene padre (Calidad le dio destino) y una nota con su nota de entrega, salen", () => {
		expect(porQueNoSale({ ...queSale, tipo: "devolucion_cliente_externo", tienePadre: true })).toBeNull();
		expect(
			porQueNoSale({ ...queSale, tipo: "nota_entrega", destinoExterno: "cliente_externo", tieneNotaDeEntrega: true }),
		).toBeNull();
	});
});
