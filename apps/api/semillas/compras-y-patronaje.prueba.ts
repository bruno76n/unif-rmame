/**
 * Prueba de Compras y Patronaje de la muestra: lo cargan las acciones del sistema y queda como la muestra.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";

describe("los datos de la muestra de Patronaje y Compras se cargan con estas mismas acciones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string): Promise<Record<string, unknown>[]> {
		return (await servidor.base.dueno.query(texto)).rows;
	}

	it("los siete proveedores con su tercero, los 24 materiales con su habitual y su primer precio", async () => {
		expect(
			await consultar(
				`SELECT t.nombre, p.dias_credito, p.dias_dice_tardar FROM proveedores p JOIN terceros t ON t.id = p.tercero_id
				 WHERE t.nombre IN ('Textiles Aurora', 'Refacciones Ochoa') ORDER BY t.nombre`,
			),
		).toEqual([
			{ nombre: "Refacciones Ochoa", dias_credito: 0, dias_dice_tardar: 3 },
			{ nombre: "Textiles Aurora", dias_credito: 30, dias_dice_tardar: 12 },
		]);
		expect(
			await consultar(
				`SELECT m.nombre, m.unidad, m.unidad_receta, m.factor_receta, m.minimo, m.consumo_diario_inicial,
				        (SELECT pc.precio_centavos::int FROM precios_compra pc WHERE pc.material_id = m.id AND pc.origen = 'alta') AS costo
				 FROM materiales m WHERE m.nombre IN ('Gabardina azul marino', 'Hilo poliéster blanco') ORDER BY m.nombre`,
			),
		).toEqual([
			{
				nombre: "Gabardina azul marino",
				unidad: "m",
				unidad_receta: null,
				factor_receta: null,
				minimo: "150.000",
				consumo_diario_inicial: "34.000",
				costo: 7_800,
			},
			{
				nombre: "Hilo poliéster blanco",
				unidad: "conos",
				unidad_receta: "m",
				factor_receta: "5000.000",
				minimo: "30.000",
				consumo_diario_inicial: "1.100",
				costo: 11_800,
			},
		]);
		expect(await consultar("SELECT count(*)::int AS n FROM materiales")).toEqual([{ n: 24 }]);
	});

	it("las recetas: la tela escala por talla desde la de en medio y los avíos van en su unidad de Patronaje", async () => {
		expect(await consultar("SELECT estado, count(*)::int AS n FROM recetas GROUP BY estado ORDER BY estado")).toEqual([
			{ estado: "sin_receta", n: 5 },
			{ estado: "sin_verificar", n: 23 },
		]);
		// La playera lisa: 0.92 m medidos con 6 % de desperdicio son 0.87 de patrón en la talla 14, y 3.5 cm por talla:
		// la 3 está seis tallas antes y la XXG siete después.
		const tela = await consultar(
			`SELECT t.nombre AS talla, lt.cantidad FROM receta_linea_tallas lt
			 JOIN receta_lineas l ON l.id = lt.receta_linea_id JOIN receta_versiones v ON v.id = l.receta_version_id
			 JOIN recetas r ON r.id = v.receta_id JOIN productos p ON p.id = r.producto_id JOIN tallas t ON t.id = lt.talla_id
			 JOIN grupos_talla g ON g.id = t.grupo_talla_id
			 WHERE p.nombre = 'Playera polo blanca lisa' AND l.papel = 'tela_principal' AND t.nombre IN ('3', '14', 'XXG')
			 ORDER BY g.orden, t.orden`,
		);
		expect(tela).toEqual([
			{ talla: "3", cantidad: "0.660" },
			{ talla: "14", cantidad: "0.870" },
			{ talla: "XXG", cantidad: "1.110" },
		]);
		// El hilo de la playera: 0.004 conos son 20 m.
		expect(
			await consultar(
				`SELECT l.unidad_receta, l.cantidad FROM receta_lineas l JOIN materiales m ON m.id = l.material_id
				 JOIN receta_versiones v ON v.id = l.receta_version_id JOIN recetas r ON r.id = v.receta_id
				 JOIN productos p ON p.id = r.producto_id
				 WHERE p.nombre = 'Playera polo blanca lisa' AND m.nombre = 'Hilo poliéster blanco'`,
			),
		).toEqual([{ unidad_receta: "m", cantidad: "20.000" }]);
	});

	it("los cinco desarrollos en su etapa, el de catálogo ligado a su producto; las órdenes abiertas y el borrador (las que llegaron las recibe la carga de Aduana)", async () => {
		expect(
			await consultar(
				"SELECT d.prenda, d.etapa, p.nombre AS producto FROM desarrollos d LEFT JOIN productos p ON p.id = d.producto_id ORDER BY d.folio",
			),
		).toEqual([
			{ prenda: "Playera polo blanca con escudo", etapa: "en_catalogo", producto: "Playera polo blanca con escudo" },
			{ prenda: "Suéter verde con escudo", etapa: "ficha_tecnica", producto: null },
			{ prenda: "Bata blanca de laboratorio con escudo", etapa: "muestra", producto: null },
			{ prenda: "Chamarra azul cielo con escudo", etapa: "aprobacion", producto: null },
			{ prenda: "Falda short gris con escudo", etapa: "solicitud", producto: null },
		]);
		expect(
			await consultar(
				`SELECT t.nombre AS proveedor, o.estado, o.fecha_prometida::text AS prometida, o.dias_credito,
				        (SELECT count(*)::int FROM orden_compra_lineas l WHERE l.orden_compra_id = o.id) AS lineas
				 FROM ordenes_compra o JOIN proveedores p ON p.id = o.proveedor_id JOIN terceros t ON t.id = p.tercero_id
				 WHERE o.estado IN ('borrador', 'enviada', 'recibida_en_parte') ORDER BY o.folio`,
			),
		).toEqual([
			{ proveedor: "Textiles Aurora", estado: "enviada", prometida: "2026-10-06", dias_credito: 30, lineas: 2 },
			{ proveedor: "Refacciones Ochoa", estado: "enviada", prometida: "2026-10-12", dias_credito: 0, lineas: 2 },
			// La carga de Aduana y Bodega (fase 11) le recibe 300 m.
			{ proveedor: "Telas Jalisco", estado: "recibida_en_parte", prometida: "2026-10-20", dias_credito: 15, lineas: 1 },
			{ proveedor: "Textiles San Marcos", estado: "enviada", prometida: "2026-10-15", dias_credito: 30, lineas: 1 },
			{ proveedor: "Mercería La Central", estado: "enviada", prometida: "2026-10-13", dias_credito: 0, lineas: 2 },
			{
				proveedor: "Cierres Aguilar",
				estado: "borrador",
				prometida: expect.any(String),
				dias_credito: null,
				lineas: 1,
			},
		]);
	});
});
