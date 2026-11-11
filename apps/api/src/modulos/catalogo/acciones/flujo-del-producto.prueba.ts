/**
 * Prueba del flujo de un producto: el alta lleva el que se escoge o, si falta, el de su tipo de prenda; lo que no se
 * fabrica no lleva flujo; cambiarlo deja su renglón de bitácora; un flujo dado de baja no se escoge.
 * Fase 12 · docs/fases/12-produccion.md (parte 1) y docs/modulos/catalogo/productos.md («Lo que llega después»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	altaDesdeCero,
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { flujoDePrueba } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El producto guarda su flujo: el escogido, o el de su tipo de prenda; cambiarlo queda en la bitácora", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El flujo de un producto. */
	async function flujoDe(productoId: string) {
		const { rows } = await servidor.base.dueno.query("SELECT flujo_id FROM productos WHERE id = $1", [productoId]);
		return rows[0]?.flujo_id;
	}

	it("sin escoger, el del tipo de prenda; escogido, ese; dado de baja, no se escoge ni se hereda", async () => {
		const delTipo = await flujoDePrueba(servidor.base.dueno);
		const tipo = await mandarAccion(
			servidor,
			"catalogo.guardar_tipo_prenda",
			{
				datos: {
					nombre: `Polo de prueba ${uuidv7().slice(-6)}`,
					seccion_id: siembra.secciones.Playeras,
					flujo_defecto_id: delTipo.flujoId,
					medidas: [],
				},
			},
			"catalogo",
		);
		expect(tipo.estado).toBe(200);
		const tipoId = z.object({ tipo_prenda_id: z.uuid() }).parse(tipo.cuerpo.resultado).tipo_prenda_id;
		const heredado = await nuevoProducto(servidor, siembra, { tipo_prenda_id: tipoId });
		expect(await flujoDe(heredado.producto_id)).toBe(delTipo.flujoId);
		const otro = await flujoDePrueba(servidor.base.dueno);
		const escogido = await nuevoProducto(servidor, siembra, { tipo_prenda_id: tipoId, flujo_id: otro.flujoId });
		expect(await flujoDe(escogido.producto_id)).toBe(otro.flujoId);
		await servidor.base.dueno.query("UPDATE flujos SET baja_en = now() WHERE id = $1", [delTipo.flujoId]);
		const sinFlujo = await nuevoProducto(servidor, siembra, { tipo_prenda_id: tipoId });
		expect(await flujoDe(sinFlujo.producto_id)).toBeNull();
		const conUnoDeBaja = await mandarAccion(
			servidor,
			"catalogo.crear_producto",
			{ datos: altaDesdeCero(siembra, { flujo_id: delTipo.flujoId }) },
			"catalogo",
		);
		expect(conUnoDeBaja.cuerpo).toMatchObject({ campos: { flujo_id: "Escoge un flujo vigente." } });
	});

	it("cambiar el flujo deja «Flujo: {antes} → {después}»; un servicio no lleva flujo", async () => {
		const [uno, otro] = [await flujoDePrueba(servidor.base.dueno), await flujoDePrueba(servidor.base.dueno)];
		const producto = await nuevoProducto(servidor, siembra, { flujo_id: uno.flujoId });
		const respuesta = await mandarAccion(
			servidor,
			"catalogo.aplicar_cambios_producto",
			{
				datos: { producto_id: producto.producto_id, flujo_id: otro.flujoId },
				version: await versionDelProducto(servidor, producto.producto_id),
			},
			"catalogo",
		);
		expect(respuesta.estado).toBe(200);
		expect(await flujoDe(producto.producto_id)).toBe(otro.flujoId);
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.aplicar_cambios_producto' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(rows).toEqual([{ descripcion: `Flujo: ${uno.nombre} → ${otro.nombre}` }]);
		const servicio = await mandarAccion(
			servidor,
			"catalogo.crear_producto",
			{
				datos: altaDesdeCero(siembra, { es_servicio: true, flujo_id: uno.flujoId }),
			},
			"catalogo",
		);
		expect(servicio.cuerpo).toMatchObject({ campos: { flujo_id: "Lo que no se fabrica no lleva flujo." } });
	});
});
