/**
 * Prueba del catálogo de la muestra: lo cargan las acciones del sistema y queda como la muestra.
 * Fase 8 · docs/fases/08-catalogo.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../src/nucleo/base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";
import { cargarCatalogoDeLaMuestra } from "./catalogo.ts";

describe("los datos de la muestra del catálogo se cargan con estas mismas acciones", () => {
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

	it("las seis escuelas, los 32 productos con sus tallas y precios generales, los descontinuados y las bajas", async () => {
		expect(await consultar("SELECT count(*)::int AS n FROM escuelas")).toEqual([{ n: 6 }]);
		expect(await consultar("SELECT count(*)::int AS n FROM productos WHERE nombre <> 'Playera de prueba'")).toEqual([
			{ n: 32 },
		]);
		expect(await consultar("SELECT nombre FROM productos WHERE baja_en IS NOT NULL ORDER BY nombre")).toEqual([
			{ nombre: "Playera polo gris lisa" },
			{ nombre: "Suéter marino liso" },
		]);
		expect(
			await consultar(
				`SELECT p.nombre, t.nombre AS talla FROM variantes v JOIN productos p ON p.id = v.producto_id
				 JOIN tallas t ON t.id = v.talla_id WHERE v.baja_en IS NOT NULL ORDER BY p.nombre`,
			),
		).toEqual([
			{ nombre: "Jumper cuadros", talla: "16" },
			{ nombre: "Pants marino liso", talla: "3" },
		]);
		// La playera lisa: 11 tallas normales y 3 de pedido especial, con su precio de Mostrador de $175.
		expect(
			await consultar(
				`SELECT count(*) FILTER (WHERE NOT v.es_pedido_especial)::int AS normales,
				        count(*) FILTER (WHERE v.es_pedido_especial)::int AS especiales
				 FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE p.nombre = 'Playera polo blanca lisa'`,
			),
		).toEqual([{ normales: 11, especiales: 3 }]);
		expect(
			await consultar(
				`SELECT pr.precio_centavos::int AS precio FROM precios pr JOIN productos p ON p.id = pr.producto_id
				 JOIN listas_precios l ON l.id = pr.lista_id
				 WHERE p.nombre = 'Playera polo blanca lisa' AND l.tipo = 'mostrador' AND pr.variante_id IS NULL
				   AND pr.vigente_hasta IS NULL`,
			),
		).toEqual([{ precio: 17_500 }]);
		// Ningún producto con escuela se vende en línea.
		expect(
			await consultar("SELECT count(*)::int AS n FROM productos WHERE escuela_id IS NOT NULL AND canal_en_linea"),
		).toEqual([{ n: 0 }]);
		// Las etiquetas: las de los dos productos nuevos, por imprimir; las demás normales, impresas.
		expect(
			await consultar(
				`SELECT DISTINCT p.nombre, e.nombre AS escuela FROM variantes v JOIN productos p ON p.id = v.producto_id
				 LEFT JOIN escuelas e ON e.id = p.escuela_id
				 WHERE v.estado_etiqueta = 'por_imprimir' ORDER BY p.nombre`,
			),
		).toEqual([
			{ nombre: "Playera polo blanca con escudo", escuela: "Secundaria Técnica 12" },
			{ nombre: "Suéter verde con escudo", escuela: "Secundaria Técnica 12" },
		]);
	});

	it("todo lo hizo Rosa con las acciones, con su bitácora, y cargarlo otra vez no repite nada", async () => {
		expect(
			await consultar(
				`SELECT DISTINCT accion FROM bitacora WHERE usuario_id = '01936f2e-0000-7000-8000-000000000006'
				 AND accion LIKE 'catalogo.%' ORDER BY accion`,
			),
		).toEqual([
			{ accion: "catalogo.agregar_escuela" },
			{ accion: "catalogo.agregar_talla" },
			// El flujo de cada prenda, que le pone la carga de Producción (fase 12).
			{ accion: "catalogo.aplicar_cambios_producto" },
			{ accion: "catalogo.crear_producto" },
			{ accion: "catalogo.dar_baja_talla" },
			{ accion: "catalogo.descontinuar_productos" },
			{ accion: "catalogo.guardar_tipo_prenda" },
		]);
		expect(
			await consultar(
				"SELECT cerrada_en IS NOT NULL AS cerrada FROM sesiones WHERE id = '01936f2e-0000-7000-8000-0000000000f1'",
			),
		).toEqual([{ cerrada: true }]);
		await cargarCatalogoDeLaMuestra(crearBase(servidor.base.dueno));
		expect(await consultar("SELECT count(*)::int AS n FROM escuelas")).toEqual([{ n: 6 }]);
	});
});
