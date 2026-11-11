/**
 * Prueba del alta de un proveedor: nace con su tercero, o se liga al de un cliente con el mismo nombre; con el de
 * otro proveedor, sin importar acentos ni mayúsculas, es `proveedor_repetido`.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeProveedor } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un proveedor nuevo con el nombre de un cliente se liga a su tercero en lugar de crear otro; con el de otro proveedor, sin importar acentos ni mayúsculas, es proveedor_repetido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras da de alta un proveedor. */
	function crear(datos: Record<string, unknown>, quien = "compras") {
		return mandarAccion(
			servidor,
			"compras.crear_proveedor",
			{
				datos: { ciudad: "León", telefono: "(477) 555-0100", dias_credito: 30, dias_dice_tardar: 12, ...datos },
			},
			quien,
		);
	}

	it("nace con su tercero, sus 10 dígitos y su bitácora; el mismo nombre con otros acentos o mayúsculas es proveedor_repetido", async () => {
		const respuesta = await crear({
			nombre: "Textiles Alborada",
			rfc: "tau010101ab1",
			surte: "Gabardinas y popelinas",
		});
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: "Textiles Alborada ya está en Proveedores" },
			avisos: [],
		});
		const id = (respuesta.cuerpo.resultado as { proveedor_id: string }).proveedor_id;
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.telefono, p.dias_credito, p.dias_dice_tardar, t.nombre, t.rfc, t.es_proveedor, t.es_cliente
			 FROM proveedores p JOIN terceros t ON t.id = p.tercero_id WHERE p.id = $1`,
			[id],
		);
		expect(rows).toEqual([
			{
				telefono: "4775550100",
				dias_credito: 30,
				dias_dice_tardar: 12,
				nombre: "Textiles Alborada",
				rfc: "TAU010101AB1",
				es_proveedor: true,
				es_cliente: false,
			},
		]);
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE entidad_id = $1",
			[id],
		);
		expect(bitacora).toEqual([{ descripcion: "Proveedor nuevo: Textiles Alborada, León" }]);
		expect((await crear({ nombre: "TEXTILES  ALBORADÁ" })).cuerpo).toMatchObject({
			codigo: "proveedor_repetido",
			mensaje: "Ya existe un proveedor con ese nombre",
		});
	});

	it("con el nombre de un cliente, se liga a su ficha y avisa; Contaduría ve una sola ficha, cliente y proveedor", async () => {
		await servidor.base.dueno.query(
			"INSERT INTO terceros (id, nombre, nombre_busqueda, es_cliente) VALUES (gen_random_uuid(), 'Uniformes del Valle', 'uniformes del valle', true)",
		);
		const respuesta = await crear({ nombre: "Uniformes del Valle" });
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { mensaje: "Uniformes del Valle ya está en Proveedores" },
			avisos: ["Se ligó a la ficha de Uniformes del Valle que ya existía en Contaduría."],
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT es_cliente, es_proveedor FROM terceros WHERE nombre_busqueda = 'uniformes del valle'",
		);
		expect(rows).toEqual([{ es_cliente: true, es_proveedor: true }]);
	});

	it("lo que dice que tarda va de 1 a `compras.dias_dice_tardar_maximo`; el teléfono lleva 10 dígitos; solo Compras", async () => {
		expect((await crear({ nombre: "Tarda Mucho", dias_dice_tardar: 91 })).cuerpo).toMatchObject({
			campos: { dias_dice_tardar: "Entre 1 y 90 días" },
		});
		expect((await crear({ nombre: "Tarda Nada", dias_dice_tardar: 0 })).cuerpo).toMatchObject({
			campos: { dias_dice_tardar: "Entre 1 y 90 días" },
		});
		expect((await crear({ nombre: "Sin Teléfono", telefono: "555 01" })).cuerpo).toMatchObject({
			campos: { telefono: "Escribe el teléfono a 10 dígitos" },
		});
		expect((await crear({ nombre: "Desde Ventas" }, "ventas")).estado).toBe(403);
		expect(await altaDeProveedor(servidor, { nombre: "Con el máximo", dias_dice_tardar: 90 })).toEqual(
			expect.any(String),
		);
	});
});
