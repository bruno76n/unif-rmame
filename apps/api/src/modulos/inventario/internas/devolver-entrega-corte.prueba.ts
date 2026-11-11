/**
 * Prueba de lo que regresa del corte y de la entrega devuelta: quitar un lote con tela entregada la devuelve (sus
 * rollos quedan por recibir y sus apartados liberados); lo que regresa se queda en el Taller hasta que Bodega lo recibe;
 * Compras deja de comprometer la tela ya entregada; el desperdicio de la prenda sale de sus cortes.
 * Fase 12 · docs/fases/12-produccion.md (parte 3)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import {
	type PrendaParaCortar,
	prendaParaCortar,
	rolloEnBodega,
} from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Lo que regresa del corte se queda en el Taller hasta que Bodega lo recibe; quitar un lote con tela entregada la devuelve; lo entregado deja de comprometerse", () => {
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

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Corre una interna o una lectura. */
	function enAccion<T>(hacer: Parameters<typeof enAccionDePrueba<T>>[2]) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, hacer);
	}

	/** Un lote para Bodega con 20 piezas por talla. */
	async function loteConTela(prenda: PrendaParaCortar) {
		const respuesta = await mandarAccion(
			servidor,
			"produccion.crear_orden",
			{
				datos: {
					ubicacion_destino_id: ubicacion.BOD,
					producto_id: prenda.productoId,
					tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 20 })),
					fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 20 }).toString(),
				},
			},
			"produccion",
		);
		const { lote_id } = z.object({ lote_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		return lote_id;
	}

	/** Lo comprometido de un material en la cuenta de Compras. */
	async function comprometido(materialId: string) {
		const cuenta = await enAccion((contexto) =>
			contexto.lectura("compras.cuenta_material", { material_ids: [materialId] }),
		);
		return z.record(z.string(), z.object({ comprometido: z.string() })).parse(cuenta)[materialId]?.comprometido;
	}

	it("el lote compromete su tela hasta que se la entregan; quitarlo devuelve la entrega: los rollos quedan por recibir", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const rollo = await rolloEnBodega(servidor, tela, "100");
		const lote = await loteConTela(prenda);
		expect(Number(await comprometido(tela))).toBeGreaterThan(63);
		await mandarAccion(
			servidor,
			"inventario.entregar_al_corte",
			{ datos: { lote_id: lote, receta_version_id: prenda.recetaVersionId, rollo_ids: [rollo.id] } },
			"bodega",
		);
		expect(await comprometido(tela)).toBe("0.000");
		expect(
			await enAccion((contexto) => contexto.interna("inventario.devolver_entrega_corte", { lote_id: lote })),
		).toEqual({
			entregas: 1,
			rollos: 1,
		});
		expect(await consultar("SELECT estado FROM entregas_corte WHERE lote_id = $1", [lote])).toEqual([
			{ estado: "devuelta" },
		]);
		expect(await consultar("SELECT estado FROM rollos WHERE id = $1", [rollo.id])).toEqual([{ estado: "por_recibir" }]);
		expect(
			await consultar(
				"SELECT estado FROM apartados_rollo WHERE rollo_id = $1 AND estado IN ('sugerido', 'entregado')",
				[rollo.id],
			),
		).toEqual([]);
		// Sigue en el Taller hasta que Bodega lo recibe; ya en Bodega, no se recibe otra vez.
		const version = async () =>
			Number((await consultar("SELECT version::int AS v FROM rollos WHERE id = $1", [rollo.id]))[0]?.v);
		const recibir = async () =>
			mandarAccion(
				servidor,
				"inventario.recibir_del_corte",
				{ datos: { rollo_id: rollo.id }, version: await version() },
				"bodega",
			);
		expect((await recibir()).estado).toBe(200);
		expect(
			await consultar(
				`SELECT u.codigo, e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE e.rollo_id = $1 AND e.cantidad <> 0`,
				[rollo.id],
			),
		).toEqual([{ codigo: "BOD", cantidad: "100.000" }]);
		expect((await recibir()).cuerpo).toMatchObject({
			codigo: "no_por_recibir",
			mensaje: `${rollo.folio} ya está en bodega`,
		});
	});

	it("el desperdicio de la prenda sale de sus cortes: con lo que pide la receta es el estimado; con más tela, sube", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const cortador = await nuevaPersona(servidor.base.dueno, "taller");
		const desperdicio = async () =>
			z
				.object({ prendas: z.array(z.object({ desperdicio_pct: z.string(), medido: z.boolean(), lotes: z.number() })) })
				.parse(
					await enAccion((contexto) =>
						contexto.lectura("patronaje.desperdicio_prenda", { producto_id: prenda.productoId }),
					),
				).prendas[0];
		const estimado = await desperdicio();
		expect(estimado).toMatchObject({ medido: false, lotes: 0 });
		const rollo = await rolloEnBodega(servidor, prenda.materiales.gabardina, "100");
		const lote = await loteConTela(prenda);
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM lotes WHERE id = $1", [lote]);
		// Quedaron 10 m de 100: se usaron 90, más que lo que pide la receta (63 m más el 6 %).
		const cerrado = await mandarAccion(
			servidor,
			"produccion.cerrar_corte",
			{
				datos: {
					lote_id: lote,
					receta_version_id: prenda.recetaVersionId,
					telas: [
						{ material_id: prenda.materiales.gabardina, rollos: [{ rollo_id: rollo.id }], metros_quedaron: "10" },
					],
					tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 20 })),
					corto_persona_id: cortador,
				},
				version: rows[0]?.v,
			},
			"produccion",
		);
		expect(cerrado.estado).toBe(200);
		// 90 ÷ 63 − 1 = 42.857 %.
		expect(await desperdicio()).toMatchObject({ medido: true, lotes: 1, desperdicio_pct: "42.857" });
	});
});
