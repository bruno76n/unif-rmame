/**
 * Prueba de `produccion.crear_orden`: una orden nueva nace con su lote por cortar, su fecha de corte y sus tallas; una
 * prenda sin flujo no entra; sin receta entra con su aviso.
 * Fase 12 · docs/fases/12-produccion.md (parte 2)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { prendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa levantar una orden. */
const levantada = z.object({
	orden_produccion_id: z.uuid(),
	folio: z.string(),
	lote_id: z.uuid(),
	lote_folio: z.string(),
	mensaje: z.string(),
});

describe("Una orden nueva nace con su lote por cortar, su fecha de corte y sus tallas; una prenda sin flujo no entra; sin receta entra con su aviso", () => {
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

	/** Producción levanta una orden. */
	function levantar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "produccion.crear_orden", { datos }, "produccion");
	}

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("para Bodega: temporada, su lote por cortar con las tallas que llevan piezas y el corte en 4 días; sin receta, el aviso", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const respuesta = await levantar({
			ubicacion_destino_id: ubicacion.BOD,
			producto_id: prenda.productoId,
			tallas: [
				{ variante_id: prenda.variantes["4"], piezas: 30 },
				{ variante_id: prenda.variantes["6"], piezas: 0 },
				{ variante_id: prenda.variantes["8"], piezas: 20 },
			],
			fecha_entrega: enDias(21),
			motivo: "Plan de regreso a clases",
		});
		const orden = levantada.parse(respuesta.cuerpo.resultado);
		expect(orden.folio).toMatch(/^OP-\d{4}-\d{3}$/);
		expect(orden.mensaje).toBe(
			`${orden.folio} levantada: ${orden.lote_folio}, 50 piezas por cortar. Falta la receta: no se corta hasta que Patronaje la capture`,
		);
		expect(
			await consultar(
				"SELECT motivo, referencia, fecha_entrega::text, estado, creado_por IS NOT NULL AS con_quien FROM ordenes_produccion WHERE id = $1",
				[orden.orden_produccion_id],
			),
		).toEqual([
			{
				motivo: "temporada",
				referencia: "Plan de regreso a clases",
				fecha_entrega: enDias(21),
				estado: "abierta",
				con_quien: true,
			},
		]);
		expect(
			await consultar(
				"SELECT estado, destino, ubicacion_destino_id, fecha_corte::text, flujo_id FROM lotes WHERE id = $1",
				[orden.lote_id],
			),
		).toEqual([
			{
				estado: "por_cortar",
				destino: "temporada",
				ubicacion_destino_id: ubicacion.BOD,
				fecha_corte: enDias(4),
				flujo_id: null,
			},
		]);
		expect(
			await consultar(
				"SELECT variante_id, piezas_planeadas, piezas_cortadas FROM lote_tallas WHERE lote_id = $1 ORDER BY piezas_planeadas",
				[orden.lote_id],
			),
		).toEqual([
			{ variante_id: prenda.variantes["8"], piezas_planeadas: 20, piezas_cortadas: null },
			{ variante_id: prenda.variantes["4"], piezas_planeadas: 30, piezas_cortadas: null },
		]);
		expect(
			await consultar("SELECT descripcion FROM bitacora WHERE accion = 'produccion.crear_orden' AND entidad_id = $1", [
				orden.orden_produccion_id,
			]),
		).toEqual([{ descripcion: `Levantó ${orden.folio} para temporada: ${prenda.nombre}, 50 piezas` }]);
	});

	it("para una tienda: reabasto; si entrega antes del corte propuesto, se corta el día de la entrega", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const orden = levantada.parse(
			(
				await levantar({
					ubicacion_destino_id: ubicacion.T1,
					producto_id: prenda.productoId,
					tallas: [{ variante_id: prenda.variantes["6"], piezas: 12 }],
					fecha_entrega: enDias(2),
				})
			).cuerpo.resultado,
		);
		expect(await consultar("SELECT motivo FROM ordenes_produccion WHERE id = $1", [orden.orden_produccion_id])).toEqual(
			[{ motivo: "reabasto" }],
		);
		expect(await consultar("SELECT destino, fecha_corte::text FROM lotes WHERE id = $1", [orden.lote_id])).toEqual([
			{ destino: "tienda", fecha_corte: enDias(2) },
		]);
	});

	it("lo que no se fabrica, las tallas que no son de la prenda o van todas en 0, la fecha pasada y otro destino no levantan nada", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const otra = await prendaDelTaller(servidor, siembra);
		const sinFlujo = await nuevoProducto(servidor, siembra);
		const base = {
			ubicacion_destino_id: ubicacion.BOD,
			producto_id: prenda.productoId,
			tallas: [{ variante_id: prenda.variantes["4"], piezas: 10 }],
			fecha_entrega: enDias(10),
		};
		const antes = await consultar("SELECT count(*)::int AS n FROM ordenes_produccion", []);
		expect((await levantar({ ...base, producto_id: sinFlujo.producto_id })).cuerpo).toMatchObject({
			codigo: "prenda_no_se_fabrica",
			mensaje: expect.stringMatching(/ no pasa por el taller\.$/),
		});
		expect(
			(await levantar({ ...base, tallas: [{ variante_id: otra.variantes["4"], piezas: 5 }] })).cuerpo,
		).toMatchObject({
			campos: { tallas: `Esa talla no es de ${prenda.nombre}.` },
		});
		expect(
			(await levantar({ ...base, tallas: [{ variante_id: prenda.variantes["4"], piezas: 0 }] })).cuerpo,
		).toMatchObject({
			campos: { tallas: "Pon las piezas por talla." },
		});
		expect((await levantar({ ...base, fecha_entrega: enDias(-1) })).cuerpo).toMatchObject({
			codigo: "fecha_pasada",
			mensaje: "La fecha no puede ser antes de hoy.",
		});
		expect((await levantar({ ...base, ubicacion_destino_id: ubicacion.ADU })).cuerpo).toMatchObject({
			codigo: "destino_no_valido",
		});
		await mandarAccion(
			servidor,
			"catalogo.descontinuar_talla",
			{
				datos: { variante_id: prenda.variantes["4"], motivo: "Ya no se vende" },
				version: await versionDelProducto(servidor, prenda.productoId),
			},
			"catalogo",
		);
		expect((await levantar(base)).cuerpo).toMatchObject({
			codigo: "talla_descontinuada",
			mensaje: "La talla 4 ya no se fabrica.",
		});
		expect(await consultar("SELECT count(*)::int AS n FROM ordenes_produccion", [])).toEqual(antes);
	});
});
