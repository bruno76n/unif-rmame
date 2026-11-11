/**
 * Prueba de dar de baja una talla: con motivo, una sola vez, con su código retirado para siempre.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3; los candados de lotes y pedidos llegan con su módulo)
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 3: los candados de
 * existencia y reservas)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearContexto } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { llamarInterna, meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "../../inventario/dominio/escribir-movimiento.ts";

describe("dar de baja una talla retira su código para siempre y sube la versión del producto", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("con motivo la da de baja con su bitácora; otra vez, talla_dada_de_baja; sin motivo, 400", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [, seis] = producto.variantes;
		const baja = async (motivo: string) =>
			mandarAccion(
				servidor,
				"catalogo.dar_baja_talla",
				{
					datos: { variante_id: seis?.variante_id, motivo },
					version: await versionDelProducto(servidor, producto.producto_id),
				},
				"catalogo",
			);
		expect((await baja("No")).cuerpo).toMatchObject({ campos: { motivo: "Escribe al menos 5 letras." } });
		const dada = await baja("No se vende la 6");
		expect(dada.cuerpo).toMatchObject({
			resultado: { mensaje: `Talla 6 dada de baja. El código ${seis?.codigo} no se vuelve a usar` },
		});
		expect((await baja("Otra vez")).cuerpo).toMatchObject({ codigo: "talla_dada_de_baja" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.dar_baja_talla' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(rows).toEqual([{ descripcion: `Talla 6, código ${seis?.codigo}. No se vende la 6` }]);
		// Reactivarla tampoco la regresa.
		const reactivar = await mandarAccion(
			servidor,
			"catalogo.reactivar_talla",
			{ datos: { variante_id: seis?.variante_id }, version: await versionDelProducto(servidor, producto.producto_id) },
			"catalogo",
		);
		expect(reactivar.cuerpo).toMatchObject({
			codigo: "talla_dada_de_baja",
			mensaje: "La talla 6 está dada de baja: agrégala otra vez y lleva código nuevo.",
		});
	});

	/** Da de baja la talla 6 de un producto. */
	async function darDeBaja(productoId: string, varianteId: string) {
		return mandarAccion(
			servidor,
			"catalogo.dar_baja_talla",
			{
				datos: { variante_id: varianteId, motivo: "Ya no se vende" },
				version: await versionDelProducto(servidor, productoId),
			},
			"catalogo",
		);
	}

	it("Una talla con existencia o con reservas no se da de baja", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const producto = await nuevoProducto(servidor, siembra);
		const [cuatro, seis] = producto.variantes;
		// En Tránsito y en negativo en la Tienda 1: las dos retienen.
		await meterPiezas(servidor, ubicacion.BOD ?? "", seis?.variante_id ?? "", 3);
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			escribirMovimiento(contexto, {
				tipo: "venta_tienda",
				documento: { tipo: "venta_tienda", id: uuidv7() },
				renglones: [{ origen: ubicacion.T1 ?? "", destino: null, varianteId: seis?.variante_id ?? "", piezas: 2 }],
				clave: uuidv7(),
			}),
		);
		expect((await darDeBaja(producto.producto_id, seis?.variante_id ?? "")).cuerpo).toMatchObject({
			codigo: "talla_con_existencia",
			mensaje: "Todavía hay 5 piezas de la talla 6 en Bodega, Tienda 1. Descontinúala: se vende hasta acabarla.",
		});
		// Sin existencia pero apartada para un pedido en línea.
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: uuidv7(),
			renglones: [{ variante_id: cuatro?.variante_id, piezas: 2 }],
		});
		expect((await darDeBaja(producto.producto_id, cuatro?.variante_id ?? "")).cuerpo).toMatchObject({
			codigo: "talla_con_reservas",
			mensaje: "La talla 4 tiene 2 piezas apartadas (pedido en línea). Espera a que se entreguen o se liberen.",
		});
	});

	it("ningún movimiento se cruza con la baja: la baja espera al movimiento que está escribiendo y luego ve su existencia", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const producto = await nuevoProducto(servidor, siembra);
		const [, , ocho] = producto.variantes;
		let soltar: () => void = () => undefined;
		const espera = new Promise<void>((resolver) => {
			soltar = resolver;
		});
		let escrito: () => void = () => undefined;
		const yaEscribio = new Promise<void>((resolver) => {
			escrito = resolver;
		});
		// Un movimiento que escribe y se queda abierto hasta que se le suelte.
		const movimiento = crearBase(servidor.base.app).transaction(async (transaccion) => {
			const { contexto } = crearContexto(
				servidor.modulos,
				transaccion,
				{ tipo: "sistema", trabajo: "prueba" },
				"prueba.movimiento",
				Temporal.Now.instant(),
				undefined,
			);
			await escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: [{ origen: null, destino: ubicacion.BOD ?? "", varianteId: ocho?.variante_id ?? "", piezas: 1 }],
				clave: uuidv7(),
			});
			escrito();
			await espera;
		});
		await yaEscribio;
		let termino = false;
		const baja = darDeBaja(producto.producto_id, ocho?.variante_id ?? "").finally(() => {
			termino = true;
		});
		await new Promise((resolver) => setTimeout(resolver, 300));
		expect(termino).toBe(false);
		soltar();
		await movimiento;
		expect((await baja).cuerpo).toMatchObject({ codigo: "talla_con_existencia" });
	});
});
