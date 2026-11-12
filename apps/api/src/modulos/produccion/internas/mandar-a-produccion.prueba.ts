/**
 * Prueba de `produccion.mandar_a_produccion` y de lo que un pedido tiene en producción: mandar un pedido suma piezas
 * al lote por cortar de esa prenda o abre una orden con un lote por prenda.
 * Fase 12 · docs/fases/12-produccion.md (parte 2)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { prendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba, versionVigenteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Mandar un pedido suma piezas al lote por cortar sin tela de esa prenda o abre una orden con un lote por prenda", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Hoy, en México, más unos días. */
	const enDias = (dias: number) => Temporal.Now.plainDateISO("America/Mexico_City").add({ days: dias }).toString();

	/** Corre una interna o una lectura de Producción como Ventas. */
	function comoVentas<T>(hacer: Parameters<typeof enAccionDePrueba<T>>[2]) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, hacer, {
			...(quienesDePrueba.ventas === undefined ? {} : { quien: quienesDePrueba.ventas }),
		});
	}

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("la primera vez, una orden cliente_externo con un lote por prenda; después, las piezas se suman al lote por cortar", async () => {
		const [polo, pantalon] = [await prendaDelTaller(servidor, siembra), await prendaDelTaller(servidor, siembra)];
		const pedido = await pedidoDePrueba(servidor);
		const suVersion = await versionVigenteDePrueba(servidor, pedido);
		const primera = await comoVentas((contexto) =>
			contexto.interna("produccion.mandar_a_produccion", {
				pedido_id: pedido,
				pedido_version_id: suVersion,
				fecha_entrega: enDias(20),
				renglones: [
					{ variante_id: polo.variantes["4"], piezas: 40 },
					{ variante_id: polo.variantes["6"], piezas: 30 },
					{ variante_id: pantalon.variantes["8"], piezas: 25 },
				],
			}),
		);
		expect(primera).toMatchObject({
			orden_produccion_id: expect.any(String),
			lotes: [{ nuevo: true }, { nuevo: true }],
			avisos: [
				expect.stringMatching(/: Falta la receta: no se corta hasta que Patronaje la capture$/),
				expect.stringMatching(/: Falta la receta/),
			],
		});
		expect(
			await consultar(
				`SELECT o.motivo, o.pedido_id, count(l.*)::int AS lotes, min(l.fecha_corte)::text AS corte, min(l.destino) AS destino
				 FROM ordenes_produccion o JOIN lotes l ON l.orden_produccion_id = o.id WHERE o.pedido_id = $1 GROUP BY o.id`,
				[pedido],
			),
		).toEqual([{ motivo: "cliente_externo", pedido_id: pedido, lotes: 2, corte: enDias(2), destino: "pedido" }]);
		// Ventas agrega piezas del polo y una talla nueva: se suman a su lote por cortar, sin otra orden.
		const segunda = await comoVentas((contexto) =>
			contexto.interna("produccion.mandar_a_produccion", {
				pedido_id: pedido,
				pedido_version_id: suVersion,
				fecha_entrega: enDias(20),
				renglones: [
					{ variante_id: polo.variantes["4"], piezas: 5 },
					{ variante_id: polo.variantes["8"], piezas: 10 },
				],
			}),
		);
		expect(segunda).toMatchObject({ lotes: [{ nuevo: false }] });
		expect(segunda).not.toHaveProperty("orden_produccion_id");
		expect(await consultar("SELECT count(*)::int AS n FROM ordenes_produccion WHERE pedido_id = $1", [pedido])).toEqual(
			[{ n: 1 }],
		);
		const enProduccion = await comoVentas((contexto) =>
			contexto.lectura("produccion.piezas_en_produccion", { pedido_id: pedido }),
		);
		expect(enProduccion).toEqual({
			variantes: expect.arrayContaining([
				{ variante_id: polo.variantes["4"], piezas: 45 },
				{ variante_id: polo.variantes["6"], piezas: 30 },
				{ variante_id: polo.variantes["8"], piezas: 10 },
				{ variante_id: pantalon.variantes["8"], piezas: 25 },
			]),
		});
		const porCortar = await comoVentas((contexto) => contexto.lectura("produccion.lotes_por_cortar", {}));
		expect(porCortar).toMatchObject({
			lotes: expect.arrayContaining([
				expect.objectContaining({ producto_id: polo.productoId, pedido_id: pedido, tiene_receta: false }),
			]),
		});
	});

	it("una prenda que no se fabrica no entra, y el pedido no deja nada", async () => {
		const polo = await prendaDelTaller(servidor, siembra);
		await servidor.base.dueno.query("UPDATE productos SET flujo_id = NULL WHERE id = $1", [polo.productoId]);
		const pedido = await pedidoDePrueba(servidor);
		const suVersion = await versionVigenteDePrueba(servidor, pedido);
		await expect(
			comoVentas((contexto) =>
				contexto.interna("produccion.mandar_a_produccion", {
					pedido_id: pedido,
					pedido_version_id: suVersion,
					fecha_entrega: enDias(10),
					renglones: [{ variante_id: polo.variantes["4"], piezas: 4 }],
				}),
			),
		).rejects.toMatchObject({ codigo: "prenda_no_se_fabrica" });
		expect(await consultar("SELECT id FROM ordenes_produccion WHERE pedido_id = $1", [pedido])).toEqual([]);
	});
});
