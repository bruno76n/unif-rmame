/**
 * Prueba de `contaduria.capturar_factura_opciones` con la muestra: con la orden puesta (como la abre Compras), su
 * proveedor y sus órdenes facturables con lo recibido y su precio; sin órdenes en borrador ni canceladas; y solo
 * Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la cuenta
 * no debe ver: precios a Aduana y Bodega…») y docs/interfaz/fabrica/contaduria.md («Capturar nota o factura»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const opciones = z.object({
	proveedores: z.array(z.object({ id: z.string(), nombre: z.string() })),
	proveedor_id: z.string().nullable(),
	umbral_cambio_precio_pct: z.number(),
	ordenes: z.array(
		z.object({
			orden_compra_id: z.string(),
			estado: z.string(),
			lineas: z.array(z.object({ material: z.string(), precio_centavos: z.number() })),
		}),
	),
});

describe("Las opciones de Capturar nota o factura", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("con la orden puesta trae su proveedor y sus órdenes facturables, con sus líneas y su precio", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, proveedor_id FROM ordenes_compra WHERE estado IN ('enviada', 'recibida') ORDER BY folio LIMIT 1",
		);
		const orden = z.object({ id: z.string(), proveedor_id: z.string() }).parse(rows[0]);
		const pedida = await pedirConsulta(
			servidor,
			"contaduria.capturar_factura_opciones",
			{ orden_compra_id: orden.id },
			"contaduria",
		);
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = opciones.parse(pedida.cuerpo.resultado);
		expect(datos.proveedor_id).toBe(orden.proveedor_id);
		expect(datos.umbral_cambio_precio_pct).toBe(15);
		expect(datos.ordenes.map((una) => una.orden_compra_id)).toContain(orden.id);
		expect(datos.ordenes.every((una) => !["borrador", "cancelada"].includes(una.estado))).toBe(true);
		expect(datos.ordenes.flatMap((una) => una.lineas).length).toBeGreaterThan(0);
		expect(datos.proveedores.length).toBeGreaterThan(1);
	});

	it("solo Contaduría las pide: Aduana recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.capturar_factura_opciones", {}, "aduana")).estado).toBe(403);
	});
});
