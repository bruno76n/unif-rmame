/**
 * Prueba de la ficha de un proveedor: renombrarlo renombra su tercero, y solo cambia lo que llegó, con un renglón
 * de bitácora por campo.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * Que la condición nueva no cambie la de las órdenes ya enviadas se prueba con las órdenes, en la parte 4.
 */

import { crearSimuladorDeR2 } from "@uniformame/pruebas/simuladores/r2";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearAlmacen, direccionDeR2 } from "../../../nucleo/almacen.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	enviarDePrueba,
	levantarDePrueba,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const cuenta = "cuentaprueba";
const simulador = crearSimuladorDeR2(cuenta);
const red = setupServer(...simulador.manejadores);
const almacen = crearAlmacen({
	direccion: direccionDeR2(cuenta),
	cubo: "uniformame-archivos",
	llaveId: "llave-de-prueba",
	secreto: "secreto-de-prueba",
});

describe("Renombrar un proveedor renombra su tercero; su condición nueva no cambia la de las órdenes ya enviadas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ almacen });
	});
	afterAll(async () => {
		red.close();
		await servidor.cerrar();
	});

	/** Compras guarda la ficha con la versión de ahora. */
	async function guardar(proveedorId: string, cambios: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"compras.guardar_proveedor",
			{
				datos: { proveedor_id: proveedorId, ...cambios },
				version: await versionDe(servidor, "proveedores", proveedorId),
			},
			"compras",
		);
	}

	it("el nombre y el RFC cambian en su tercero; el de otro proveedor es proveedor_repetido; un renglón por campo", async () => {
		const id = await altaDeProveedor(servidor, { nombre: "Hilos Marinos" });
		await altaDeProveedor(servidor, { nombre: "Hilos del Golfo" });
		expect((await guardar(id, { nombre: "HILOS DEL GOLFO" })).cuerpo).toMatchObject({ codigo: "proveedor_repetido" });
		const respuesta = await guardar(id, {
			nombre: "Hilos Marinos del Norte",
			rfc: "hmn010101ab1",
			ciudad: "Monterrey",
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Cambios guardados en Hilos Marinos del Norte" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT t.nombre, t.rfc, p.ciudad FROM proveedores p JOIN terceros t ON t.id = p.tercero_id WHERE p.id = $1",
			[id],
		);
		expect(rows).toEqual([{ nombre: "Hilos Marinos del Norte", rfc: "HMN010101AB1", ciudad: "Monterrey" }]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1",
			[id],
		);
		expect(bitacora.map((renglon) => renglon.descripcion).sort()).toEqual(
			[
				"Hilos Marinos del Norte: RFC — → HMN010101AB1",
				"Hilos Marinos del Norte: ciudad León → Monterrey",
				"Hilos Marinos del Norte: nombre Hilos Marinos → Hilos Marinos del Norte",
				"Proveedor nuevo: Hilos Marinos, León",
			].sort(),
		);
	});

	it("lo que dice que tarda tiene su mensaje; lo mismo que ya tenía es sin_cambios; la versión vieja da 409", async () => {
		const id = await altaDeProveedor(servidor, { nombre: "Botones Reyes" });
		const vieja = await versionDe(servidor, "proveedores", id);
		expect((await guardar(id, { dias_dice_tardar: 14 })).cuerpo.resultado).toMatchObject({
			mensaje: "Botones Reyes: ahora dice que tarda 14 días",
		});
		expect((await guardar(id, { dias_dice_tardar: 14, telefono: "477 555 0100" })).cuerpo).toMatchObject({
			codigo: "sin_cambios",
			mensaje: "Sin cambios",
		});
		expect((await guardar(id, { dias_dice_tardar: 120 })).cuerpo).toMatchObject({
			campos: { dias_dice_tardar: "Entre 1 y 90 días" },
		});
		expect(
			(
				await mandarAccion(
					servidor,
					"compras.guardar_proveedor",
					{ datos: { proveedor_id: id, ciudad: "Celaya" }, version: vieja },
					"compras",
				)
			).estado,
		).toBe(409);
	});

	it("la condición nueva del proveedor no cambia la de la orden ya enviada; el borrador la toma al enviarse", async () => {
		const id = await altaDeProveedor(servidor, { nombre: "Hilos de Occidente", dias_credito: 15 });
		const material = await altaDeMaterial(servidor, id);
		const linea = { material_id: material, proveedor_id: id, cantidad: 10, precio_centavos: 38 };
		const enviada = await levantarDePrueba(servidor, [linea]);
		expect((await enviarDePrueba(servidor, enviada.id)).estado).toBe(200);
		expect((await guardar(id, { dias_credito: 45 })).estado).toBe(200);
		const borrador = await levantarDePrueba(servidor, [linea]);
		expect((await enviarDePrueba(servidor, borrador.id)).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio, dias_credito FROM ordenes_compra WHERE id IN ($1, $2) ORDER BY folio",
			[enviada.id, borrador.id],
		);
		expect(rows).toEqual([
			{ folio: enviada.folio, dias_credito: 15 },
			{ folio: borrador.folio, dias_credito: 45 },
		]);
	});
});
