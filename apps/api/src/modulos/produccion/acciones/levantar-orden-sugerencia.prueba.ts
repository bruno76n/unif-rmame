/**
 * Prueba de `produccion.levantar_orden_sugerencia`: levantar las sugerencias de una prenda y una ubicación las deja
 * levantadas con su orden y su lote, con cada talla redondeada al múltiplo; dos a la vez no levantan la misma.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { type PrendaDelTaller, prendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Levantar una sugerencia la deja levantada con su orden y su lote; dos a la vez no levantan la misma", () => {
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

	/** Bodega sugiere fabricar unas tallas de una prenda para una ubicación. */
	async function sugerir(prenda: PrendaDelTaller, ubicacionId: string | undefined, piezas: Record<string, number>) {
		const respuesta = await mandarAccion(
			servidor,
			"inventario.sugerir_fabricar",
			{
				datos: {
					renglones: Object.entries(piezas).map(([talla, cuantas]) => ({
						variante_id: prenda.variantes[talla],
						ubicacion_id: ubicacionId,
						piezas: cuantas,
					})),
				},
			},
			"bodega",
		);
		return z.object({ sugerencia_ids: z.array(z.uuid()) }).parse(respuesta.cuerpo.resultado).sugerencia_ids;
	}

	/** Producción levanta unas sugerencias. */
	function levantar(ids: string[]) {
		return mandarAccion(
			servidor,
			"produccion.levantar_orden_sugerencia",
			{ datos: { sugerencia_ids: ids } },
			"produccion",
		);
	}

	it("para una tienda: orden `reabasto`, su lote para la tienda con cada talla redondeada al múltiplo, y las sugerencias levantadas", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const ids = [
			...(await sugerir(prenda, ubicacion.T1, { "4": 9, "6": 2 })),
			...(await sugerir(prenda, ubicacion.T1, { "4": 4 })),
		];
		const respuesta = await levantar(ids);
		const salida = z
			.object({
				orden_produccion_id: z.uuid(),
				folio: z.string(),
				lote_id: z.uuid(),
				lote_folio: z.string(),
				mensaje: z.string(),
			})
			.parse(respuesta.cuerpo.resultado);
		expect(salida.mensaje).toBe(
			`${salida.folio} levantada: ${salida.lote_folio}, 20 piezas por cortar. Falta la receta: no se corta hasta que Patronaje la capture`,
		);
		const { rows: orden } = await servidor.base.dueno.query(
			`SELECT o.motivo, d.codigo, l.destino, l.estado FROM ordenes_produccion o JOIN lotes l ON l.orden_produccion_id = o.id
			 JOIN ubicaciones d ON d.id = o.ubicacion_destino_id WHERE o.id = $1`,
			[salida.orden_produccion_id],
		);
		expect(orden).toEqual([{ motivo: "reabasto", codigo: "T1", destino: "tienda", estado: "por_cortar" }]);
		// 9 + 4 = 13 de la talla 4 son 15; 2 de la talla 6 son 5.
		const { rows: tallas } = await servidor.base.dueno.query(
			"SELECT variante_id, piezas_planeadas FROM lote_tallas WHERE lote_id = $1 ORDER BY piezas_planeadas DESC",
			[salida.lote_id],
		);
		expect(tallas).toEqual([
			{ variante_id: prenda.variantes["4"], piezas_planeadas: 15 },
			{ variante_id: prenda.variantes["6"], piezas_planeadas: 5 },
		]);
		const { rows: sugerencias } = await servidor.base.dueno.query(
			"SELECT DISTINCT estado, orden_produccion_id, lote_id FROM sugerencias_reabasto WHERE id = ANY($1::uuid[])",
			[ids],
		);
		expect(sugerencias).toEqual([
			{ estado: "levantada", orden_produccion_id: salida.orden_produccion_id, lote_id: salida.lote_id },
		]);
		expect((await levantar(ids)).cuerpo).toMatchObject({
			codigo: "sugerencia_ya_decidida",
			mensaje: `Esa sugerencia ya se levantó: ${salida.folio}.`,
		});
	});

	it("para Bodega: orden de temporada; sugerencias de dos ubicaciones no se mezclan; Bodega no levanta", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const deBodega = await sugerir(prenda, ubicacion.BOD, { "8": 5 });
		const deTienda = await sugerir(prenda, ubicacion.T2, { "8": 5 });
		expect((await levantar([...deBodega, ...deTienda])).cuerpo).toMatchObject({
			codigo: "sugerencias_mezcladas",
			campos: { sugerencia_ids: "Las sugerencias deben ser de una prenda y una ubicación." },
		});
		expect(
			(
				await mandarAccion(
					servidor,
					"produccion.levantar_orden_sugerencia",
					{ datos: { sugerencia_ids: deBodega } },
					"bodega",
				)
			).estado,
		).toBe(403);
		const respuesta = await levantar(deBodega);
		const { orden_produccion_id } = z.object({ orden_produccion_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT motivo FROM ordenes_produccion WHERE id = $1", [
			orden_produccion_id,
		]);
		expect(rows).toEqual([{ motivo: "temporada" }]);
	});

	it("dos «Levantar orden» de la misma sugerencia a la vez: se levanta una sola vez, con una sola orden", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const ids = await sugerir(prenda, ubicacion.T1, { "6": 5 });
		const respuestas = await Promise.all([levantar(ids), levantar(ids)]);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM lotes l JOIN lote_tallas t ON t.lote_id = l.id WHERE t.variante_id = $1",
			[prenda.variantes["6"]],
		);
		expect(rows).toEqual([{ n: 1 }]);
	});
});
