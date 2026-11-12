/**
 * Prueba de lo que Ventas, Calidad y Aduana le hacen a los lotes: cancelar el pedido pasa sus lotes a temporada;
 * cambiar su entrega cambia la de sus órdenes y lotes; revisado y en aduana avanzan la etapa; y los candados de los
 * lotes sin terminar (la baja de una talla, el cambio de un flujo).
 * Fase 12 · docs/fases/12-produccion.md (parte 2)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	guardarRecetaDePrueba,
	materialesDeReceta,
	recetaDeEjemplo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { type PrendaDelTaller, prendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba, versionVigenteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Cancelar el pedido pasa sus lotes a temporada; su entrega cambia con el pedido; las etapas avanzan; un lote sin terminar detiene la baja de su talla y el cambio de su flujo", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Hoy, en México, más unos días. */
	const enDias = (dias: number) => Temporal.Now.plainDateISO("America/Mexico_City").add({ days: dias }).toString();

	/** Corre una interna o una lectura de Producción. */
	function interna(nombre: string, datos: unknown) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna(nombre, datos),
		);
	}

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Manda a producción un pedido de una prenda y regresa su lote. */
	async function loteDePedido(prenda: PrendaDelTaller, pedido: string) {
		const mandado = z.object({ lotes: z.array(z.object({ lote_id: z.uuid() })) }).parse(
			await interna("produccion.mandar_a_produccion", {
				pedido_id: pedido,
				pedido_version_id: await versionVigenteDePrueba(servidor, pedido),
				fecha_entrega: enDias(15),
				renglones: [{ variante_id: prenda.variantes["4"], piezas: 20 }],
			}),
		);
		return mandado.lotes[0]?.lote_id ?? "";
	}

	/** Un lote que ya se cortó, con la receta de su prenda, en la etapa que se diga. */
	async function loteCortado(prenda: PrendaDelTaller, estado: string) {
		const lote = await loteDePedido(prenda, await pedidoDePrueba(servidor));
		const { rows } = await servidor.base.dueno.query("SELECT id FROM recetas WHERE producto_id = $1", [
			prenda.productoId,
		]);
		const conReceta = { productoId: prenda.productoId, recetaId: String(rows[0]?.id), tallas: {} };
		const tallas = await consultar(
			"SELECT t.nombre, v.talla_id FROM variantes v JOIN tallas t ON t.id = v.talla_id WHERE v.producto_id = $1",
			[prenda.productoId],
		);
		conReceta.tallas = Object.fromEntries(tallas.map((talla) => [talla.nombre, talla.talla_id]));
		await guardarRecetaDePrueba(servidor, conReceta, recetaDeEjemplo(conReceta, await materialesDeReceta(servidor)));
		await servidor.base.dueno.query(
			`UPDATE lotes SET estado = $2, flujo_id = $3, cortado_en = now(),
				receta_version_id = (SELECT version_vigente_id FROM recetas WHERE producto_id = $4)
			 WHERE id = $1`,
			[lote, estado, prenda.flujo.flujoId, prenda.productoId],
		);
		await servidor.base.dueno.query("UPDATE lote_tallas SET piezas_cortadas = piezas_planeadas WHERE lote_id = $1", [
			lote,
		]);
		return lote;
	}

	it("cancelar el pedido: sus lotes van a temporada en Bodega y conservan su pedido y su orden; otra vez no cambia nada", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const pedido = await pedidoDePrueba(servidor);
		const lote = await loteDePedido(prenda, pedido);
		expect(await interna("produccion.pasar_pedido_a_temporada", { pedido_id: pedido })).toEqual({ lotes: 1 });
		expect(
			await consultar(
				"SELECT destino, pedido_id, ubicacion_destino_id, paso_a_temporada_en IS NOT NULL AS paso FROM lotes WHERE id = $1",
				[lote],
			),
		).toEqual([{ destino: "temporada", pedido_id: pedido, ubicacion_destino_id: ubicacion.BOD, paso: true }]);
		expect(
			await consultar(
				"SELECT o.motivo, o.pedido_id FROM ordenes_produccion o JOIN lotes l ON l.orden_produccion_id = o.id WHERE l.id = $1",
				[lote],
			),
		).toEqual([{ motivo: "cliente_externo", pedido_id: pedido }]);
		// Otra vez no cambia nada.
		expect(await interna("produccion.pasar_pedido_a_temporada", { pedido_id: pedido })).toEqual({ lotes: 0 });
	});

	it("cambiar la entrega del pedido cambia la de su orden y sus lotes, no su corte", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const pedido = await pedidoDePrueba(servidor);
		const lote = await loteDePedido(prenda, pedido);
		const [antes] = await consultar("SELECT fecha_corte::text FROM lotes WHERE id = $1", [lote]);
		expect(
			await interna("produccion.cambiar_fecha_entrega_pedido", { pedido_id: pedido, fecha_entrega: enDias(30) }),
		).toEqual({
			lotes: 1,
		});
		expect(
			await consultar(
				`SELECT l.fecha_entrega::text AS lote, o.fecha_entrega::text AS orden, l.fecha_corte::text AS corte
				 FROM lotes l JOIN ordenes_produccion o ON o.id = l.orden_produccion_id WHERE l.id = $1`,
				[lote],
			),
		).toEqual([{ lote: enDias(30), orden: enDias(30), corte: antes?.fecha_corte }]);
	});

	it("revisado y en aduana avanzan en orden; fuera de orden es un error del programa", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const lote = await loteCortado(prenda, "terminado");
		await expect(
			interna("produccion.marcar_lote_en_aduana", { lote_id: lote, recepcion_id: uuidv7() }),
		).rejects.toThrow(/no está revisado/);
		expect(await interna("produccion.marcar_lote_revisado", { lote_id: lote, revision_id: uuidv7() })).toMatchObject({
			folio: expect.any(String),
		});
		await interna("produccion.marcar_lote_en_aduana", { lote_id: lote, recepcion_id: uuidv7() });
		expect(
			await consultar(
				"SELECT estado, revisado_en IS NOT NULL AS revisado, en_aduana_en IS NOT NULL AS en_aduana FROM lotes WHERE id = $1",
				[lote],
			),
		).toEqual([{ estado: "en_aduana", revisado: true, en_aduana: true }]);
	});

	it("una talla en un lote sin terminar no se da de baja; con un lote en proceso, su flujo no cambia", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const lote = await loteCortado(prenda, "en_proceso");
		const [{ folio } = { folio: "" }] = await consultar("SELECT folio FROM lotes WHERE id = $1", [lote]);
		const baja = await mandarAccion(
			servidor,
			"catalogo.dar_baja_talla",
			{
				datos: { variante_id: prenda.variantes["4"], motivo: "Ya no se hace" },
				version: await versionDelProducto(servidor, prenda.productoId),
			},
			"catalogo",
		);
		expect(baja.cuerpo).toMatchObject({
			codigo: "talla_con_lotes",
			mensaje: `La talla 4 está en lotes sin terminar: ${folio}.`,
		});
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM flujos WHERE id = $1", [
			prenda.flujo.flujoId,
		]);
		const cambio = await mandarAccion(
			servidor,
			"produccion.quitar_operacion_flujo",
			{ datos: { flujo_operacion_id: prenda.flujo.operaciones[1]?.flujoOperacionId }, version: rows[0]?.v },
			"produccion",
		);
		expect(cambio.cuerpo).toMatchObject({
			codigo: "flujo_con_lotes",
			mensaje: "1 lotes en proceso usan este flujo: cámbialo cuando terminen o haz un flujo nuevo",
		});
	});
});
