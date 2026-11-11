/**
 * Prueba de lo que baja de Producción a la tablet: las operaciones, los flujos y sus operaciones vigentes, nunca una
 * tarifa; la operación que se quita del flujo baja como `quitar`.
 * Fase 12 · docs/fases/12-produccion.md (parte 1)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../nucleo/pruebas/accion-de-prueba.ts";
import { bajarHastaTener, fotoCompleta } from "../../nucleo/pruebas/bajada-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { flujoDePrueba, loteDePrueba } from "../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("A la tablet bajan los lotes en proceso y terminados, sus bultos, sus registros y los flujos, nunca una tarifa ni un costo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el flujo, sus operaciones y el catálogo bajan con lo suyo; la quitada baja como quitar", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 2);
		const [corte, primera, segunda] = flujo.operaciones;
		const { cambios, cursor } = await fotoCompleta(servidor);
		expect(cambios.find((cambio) => cambio.id === flujo.flujoId)).toEqual({
			tabla: "flujos",
			op: "cambio",
			id: flujo.flujoId,
			datos: { nombre: flujo.nombre },
		});
		expect(cambios.find((cambio) => cambio.id === primera?.flujoOperacionId)).toEqual({
			tabla: "flujo_operaciones",
			op: "cambio",
			id: primera?.flujoOperacionId,
			datos: {
				flujo_id: flujo.flujoId,
				operacion_id: primera?.operacionId,
				orden: 2,
				persona_base_id: flujo.personaId,
			},
		});
		expect(cambios.find((cambio) => cambio.id === corte?.operacionId)).toEqual({
			tabla: "operaciones",
			op: "cambio",
			id: corte?.operacionId,
			datos: { nombre: "Corte", es_corte: true },
		});
		expect(JSON.stringify(cambios)).not.toContain("tarifa");
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM flujos WHERE id = $1", [
			flujo.flujoId,
		]);
		await mandarAccion(
			servidor,
			"produccion.quitar_operacion_flujo",
			{ datos: { flujo_operacion_id: primera?.flujoOperacionId }, version: rows[0]?.v },
			"produccion",
		);
		const despues = await bajarHastaTener(servidor, cursor, [
			primera?.flujoOperacionId ?? "",
			segunda?.flujoOperacionId ?? "",
		]);
		expect(despues.cambios.filter((cambio) => cambio.id === primera?.flujoOperacionId).at(-1)).toEqual({
			tabla: "flujo_operaciones",
			op: "quitar",
			id: primera?.flujoOperacionId,
			datos: null,
		});
		expect(despues.cambios.filter((cambio) => cambio.id === segunda?.flujoOperacionId).at(-1)).toMatchObject({
			op: "cambio",
			datos: { orden: 2 },
		});
	});

	it("los lotes en proceso y terminados bajan con sus tallas y «para quién», sin pedido ni costo; al revisarse, se quitan", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno);
		const { rows } = await servidor.base.dueno.query(
			"SELECT p.id AS producto, v.id AS variante FROM productos p JOIN variantes v ON v.producto_id = p.id LIMIT 1",
		);
		const productoId = String(rows[0]?.producto);
		const lote = await loteDePrueba(servidor.base.dueno, productoId);
		const { rows: versiones } = await servidor.base.dueno.query("SELECT id FROM receta_versiones LIMIT 1");
		await servidor.base.dueno.query(
			"INSERT INTO lote_tallas (id, lote_id, variante_id, piezas_planeadas, piezas_cortadas) VALUES ($1, $2, $3, 12, 12)",
			[uuidv7(), lote, rows[0]?.variante],
		);
		await servidor.base.dueno.query(
			"UPDATE lotes SET estado = 'terminado', flujo_id = $2, receta_version_id = $3, cortado_en = now() WHERE id = $1",
			[lote, flujo.flujoId, versiones[0]?.id],
		);
		const { cambios, cursor } = await fotoCompleta(servidor);
		expect(cambios.find((cambio) => cambio.id === lote)).toMatchObject({
			tabla: "lotes",
			op: "cambio",
			datos: {
				producto_id: productoId,
				flujo_id: flujo.flujoId,
				estado: "terminado",
				para_quien: "Temporada · bodega",
			},
		});
		expect(Object.keys(cambios.find((cambio) => cambio.id === lote)?.datos ?? {})).not.toContain("pedido_id");
		const talla = cambios.find((cambio) => cambio.tabla === "lote_tallas" && cambio.datos?.lote_id === lote);
		expect(talla?.datos).toEqual({
			lote_id: lote,
			variante_id: rows[0]?.variante,
			piezas_cortadas: 12,
			piezas_terminadas: 0,
			piezas_merma: 0,
		});
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("produccion.marcar_lote_revisado", { lote_id: lote, revision_id: uuidv7() }),
		);
		const despues = await bajarHastaTener(servidor, cursor, [lote, talla?.id ?? ""]);
		expect(
			despues.cambios.filter((cambio) => [lote, talla?.id].includes(cambio.id)).map((cambio) => cambio.op),
		).toEqual(["quitar", "quitar"]);
	});
});
