/**
 * Prueba de `compras.registrar_precios_nota`: la nota cambia el precio vigente de la línea, deja su renglón «según
 * la nota» y no toca una línea con el mismo precio.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	levantarDePrueba,
	ordenEnEstado,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La nota cambia el precio vigente de la línea, deja su renglón «según la nota» y no toca una línea con el mismo precio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama la interna como lo haría Contaduría al capturar la nota. */
	function nota(ordenId: string, lineas: { orden_compra_linea_id: string; precio_centavos: number }[]) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("compras.registrar_precios_nota", { orden_compra_id: ordenId, lineas }),
		);
	}

	/** Una orden de dos materiales, el botón a 38 y el cierre a 600, y sus líneas por material. */
	async function ordenDeDos() {
		const proveedor = await altaDeProveedor(servidor);
		const otra = proveedor.slice(-6);
		const boton = await altaDeMaterial(servidor, proveedor, { nombre: `Botón blanco ${otra}`, costo_centavos: 38 });
		const cierre = await altaDeMaterial(servidor, proveedor, { nombre: `Cierre 14 cm ${otra}`, costo_centavos: 600 });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: boton, proveedor_id: proveedor, cantidad: 500, precio_centavos: 38 },
			{ material_id: cierre, proveedor_id: proveedor, cantidad: 200, precio_centavos: 600 },
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT material_id, id FROM orden_compra_lineas WHERE orden_compra_id = $1",
			[orden.id],
		);
		const linea = (material: string) => String(rows.find((fila) => fila.material_id === material)?.id);
		return { ...orden, proveedor, boton, cierre, lineaBoton: linea(boton), lineaCierre: linea(cierre) };
	}

	it("la línea con otro precio toma el de la nota, con su renglón en el historial y el último precio del par; la del mismo precio no cambia", async () => {
		const orden = await ordenDeDos();
		await ordenEnEstado(servidor, orden.id, "enviada");
		const [botonAntes, cierreAntes] = [
			await versionDe(servidor, "materiales", orden.boton),
			await versionDe(servidor, "materiales", orden.cierre),
		];
		const { rows: antes } = await servidor.base.dueno.query("SELECT version FROM ordenes_compra WHERE id = $1", [
			orden.id,
		]);
		expect(
			await nota(orden.id, [
				{ orden_compra_linea_id: orden.lineaBoton, precio_centavos: 38 },
				{ orden_compra_linea_id: orden.lineaCierre, precio_centavos: 650 },
			]),
		).toEqual({ lineas: [{ orden_compra_linea_id: orden.lineaCierre, antes: 600, nuevo: 650 }] });
		const { rows: lineas } = await servidor.base.dueno.query(
			"SELECT id, precio_orden_centavos::int AS orden, precio_nota_centavos::int AS nota, precio_nota_por IS NOT NULL AS con_quien FROM orden_compra_lineas WHERE orden_compra_id = $1 ORDER BY precio_orden_centavos",
			[orden.id],
		);
		expect(lineas).toEqual([
			{ id: orden.lineaBoton, orden: 38, nota: null, con_quien: false },
			{ id: orden.lineaCierre, orden: 600, nota: 650, con_quien: true },
		]);
		const { rows: historial } = await servidor.base.dueno.query(
			"SELECT material_id, origen, orden_compra_linea_id, precio_anterior_centavos::int AS anterior FROM precios_compra WHERE orden_compra_id = $1",
			[orden.id],
		);
		expect(historial).toEqual([
			{ material_id: orden.cierre, origen: "nota", orden_compra_linea_id: orden.lineaCierre, anterior: 600 },
		]);
		const { rows: par } = await servidor.base.dueno.query(
			"SELECT ultimo_precio_centavos::int AS precio FROM material_proveedores WHERE material_id = $1 AND proveedor_id = $2",
			[orden.cierre, orden.proveedor],
		);
		expect(par).toEqual([{ precio: 650 }]);
		// El último precio es parte del material: el cierre sube su versión; el botón, que no cambió, no.
		expect(await versionDe(servidor, "materiales", orden.cierre)).toBeGreaterThan(cierreAntes);
		expect(await versionDe(servidor, "materiales", orden.boton)).toBe(botonAntes);
		const { rows: despues } = await servidor.base.dueno.query("SELECT version FROM ordenes_compra WHERE id = $1", [
			orden.id,
		]);
		expect(BigInt(despues[0]?.version)).toBeGreaterThan(BigInt(antes[0]?.version));
		// La misma nota otra vez ya no cambia nada: 650 es el vigente.
		expect(await nota(orden.id, [{ orden_compra_linea_id: orden.lineaCierre, precio_centavos: 650 }])).toEqual({
			lineas: [],
		});
	});

	it("una orden en borrador o cancelada no tiene nota que capturar", async () => {
		const orden = await ordenDeDos();
		const pedido = [{ orden_compra_linea_id: orden.lineaCierre, precio_centavos: 650 }];
		await expect(nota(orden.id, pedido)).rejects.toMatchObject({
			codigo: "orden_no_enviada",
			message: `${orden.folio} no se ha enviado: no tiene nota que capturar.`,
		});
		await ordenEnEstado(servidor, orden.id, "cancelada");
		await expect(nota(orden.id, pedido)).rejects.toMatchObject({ codigo: "orden_no_enviada" });
	});
});
