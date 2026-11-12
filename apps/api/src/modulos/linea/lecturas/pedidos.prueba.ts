/**
 * Prueba de las lecturas de los pedidos en línea: los W- abiertos de una variante (el candado `talla_con_pedidos` de
 * Catálogo), cuáles siguen abiertos (el paso 6 del cuadre) y sus folios. Uno cancelado o vencido no está abierto.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Lecturas»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedidoLineaDePrueba, pedidoLineaEnBodega } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { leerDePrueba } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("las lecturas de los W- abiertos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un W- abierto aparece con su variante y como abierto; cancelado o vencido, ya no", async () => {
		const abierto = await pedidoLineaEnBodega(servidor);
		const vencido = await pedidoLineaDePrueba(servidor);
		await servidor.base.dueno.query(
			"UPDATE pedidos_linea SET estado = 'vencido', pago_estado = 'vencido' WHERE id = $1",
			[vencido],
		);
		expect(
			await leerDePrueba(servidor, "linea.pedidos_abiertos_de_variante", { variante_id: abierto.variante }),
		).toEqual({ folios: [abierto.folio] });
		expect(await leerDePrueba(servidor, "linea.pedidos_abiertos", { pedido_linea_ids: [abierto.id, vencido] })).toEqual(
			{ pedido_linea_ids: [abierto.id] },
		);
		expect(await leerDePrueba(servidor, "linea.folios_de_pedidos", { pedido_linea_ids: [abierto.id] })).toEqual({
			folios: { [abierto.id]: abierto.folio },
		});
		await servidor.base.dueno.query(
			"UPDATE pedidos_linea SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Prueba' WHERE id = $1",
			[abierto.id],
		);
		expect(
			await leerDePrueba(servidor, "linea.pedidos_abiertos_de_variante", { variante_id: abierto.variante }),
		).toEqual({ folios: [] });
		expect(
			await llamarInterna(servidor, "linea.pausar_publicaciones_producto", {
				producto_id: abierto.variante,
				motivo: "descontinuado",
			}),
		).toEqual({ pausadas: 0 });
	});
});
