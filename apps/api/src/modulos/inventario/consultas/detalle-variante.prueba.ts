/**
 * Prueba de `inventario.detalle_variante` con los datos de la muestra: las siete ubicaciones en su orden con su mínimo y
 * su etiqueta, las cuentas (total, comprometidas, libres), lo apartado con su documento, las tiendas sin caja a las que
 * se manda con lo libre en Bodega, y que solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { apartarEnBodega, pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	total: number;
	comprometidas: number;
	libres: number;
	ubicaciones: { codigo: string; piezas: number; minimo: number | null }[];
	apartadas: { documento: string; ubicacion: string; piezas: number }[];
	tiendas_sin_caja: { nombre: string }[];
	libres_en_bodega: number;
}

describe("El cajón Variante: dónde está, con su mínimo, lo apartado y lo que se mueve", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("las siete ubicaciones en su orden, Bodega con su mínimo; las cuentas cuadran con lo apartado", async () => {
		const apartado = await apartarEnBodega(servidor);
		try {
			const varianteId = await valorDe(servidor, "SELECT variante_id FROM reservas WHERE id = $1", apartado.reserva);
			const folio = await valorDe(servidor, "SELECT folio FROM pedidos WHERE id = $1", apartado.pedido);
			const detalle = (await pedir(servidor, "inventario.detalle_variante", {
				variante_id: varianteId,
			})) as unknown as Detalle;
			expect(detalle.ubicaciones.map((ubicacion) => ubicacion.codigo)).toEqual([
				"ADU",
				"BOD",
				"T1",
				"T2",
				"TAL",
				"TRA",
				"ECA",
			]);
			expect(detalle.ubicaciones.find((ubicacion) => ubicacion.codigo === "BOD")?.minimo).toBeGreaterThan(0);
			expect(detalle.ubicaciones.find((ubicacion) => ubicacion.codigo === "ADU")?.minimo).toBeNull();
			expect(detalle.total).toBe(detalle.ubicaciones.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0));
			expect(detalle.comprometidas).toBe(2);
			expect(detalle.libres).toBe(detalle.total - 2);
			expect(detalle.apartadas).toEqual([{ documento: folio, ubicacion: "Bodega", piezas: 2 }]);
			expect(detalle.tiendas_sin_caja.map((tienda) => tienda.nombre)).toEqual(["Tienda 1", "Tienda 2"]);
			const enBodega = detalle.ubicaciones.find((ubicacion) => ubicacion.codigo === "BOD")?.piezas ?? 0;
			expect(detalle.libres_en_bodega).toBe(enBodega - 2);
		} finally {
			await apartado.quitar();
		}
	});

	it("una variante que no existe da 404; solo la piden las cuentas con Bodega, sin precios ni costos", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_variante",
			{ variante_id: "01936f2e-0000-7000-8000-00000000dead" },
			"bodega",
		);
		expect(respuesta.estado).toBe(404);
		const varianteId = await valorDe(servidor, "SELECT variante_id FROM existencias ORDER BY id LIMIT 1");
		await soloBodegaYSinPrecios(servidor, "inventario.detalle_variante", { variante_id: varianteId });
	});
});
