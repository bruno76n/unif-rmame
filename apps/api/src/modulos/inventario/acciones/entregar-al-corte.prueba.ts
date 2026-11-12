/**
 * Prueba de los rollos sugeridos y de `inventario.entregar_al_corte`: el lote nuevo aparta sus rollos con la regla de
 * las partidas; entregar pasa al Taller los rollos de cada tela de la receta y, en la primera entrega, los avíos;
 * libera lo sugerido que no se usó; un rollo entregado a otro lote no se entrega; sin la receta vigente no entrega.
 * Fase 12 · docs/fases/12-produccion.md (parte 3)
 * Fase 14 · «Un avío entregado sin existencia deja Bodega en negativo con su DF- `material_corte`»
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	type PrendaDelTaller,
	prendaDelTaller,
	prendaParaCortar,
	rolloEnBodega,
} from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Entregar al corte pasa al Taller los rollos de cada tela de la receta y, en la primera entrega, los avíos; libera lo sugerido que no se usó", () => {
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

	/** Producción levanta un lote para Bodega con 20 piezas por talla, que entrega en tantos días (20 si no se dice). */
	async function lote(prenda: PrendaDelTaller, entregaEnDias = 20) {
		const respuesta = await mandarAccion(
			servidor,
			"produccion.crear_orden",
			{
				datos: {
					ubicacion_destino_id: ubicacion.BOD,
					producto_id: prenda.productoId,
					tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 20 })),
					fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: entregaEnDias }).toString(),
				},
			},
			"produccion",
		);
		return z.object({ lote_id: z.uuid(), lote_folio: z.string() }).parse(respuesta.cuerpo.resultado);
	}

	/** Bodega entrega al corte. */
	function entregar(loteId: string, receta: string, rollos: string[]) {
		return mandarAccion(
			servidor,
			"inventario.entregar_al_corte",
			{ datos: { lote_id: loteId, receta_version_id: receta, rollo_ids: rollos } },
			"bodega",
		);
	}

	/** Los apartados vivos de un lote: rollo y estado. */
	function apartados(loteId: string) {
		return consultar(
			"SELECT rollo_id, estado FROM apartados_rollo WHERE lote_id = $1 AND estado IN ('sugerido', 'entregado') ORDER BY rollo_id",
			[loteId],
		);
	}

	it("el lote aparta la primera partida que alcanza sola, del rollo más chico al más grande; entregar los pasa al Taller con los avíos", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const [chico, grande, otra] = [
			await rolloEnBodega(servidor, tela, "40", "P-A"),
			await rolloEnBodega(servidor, tela, "60", "P-A"),
			await rolloEnBodega(servidor, tela, "70", "P-B"),
		];
		const { lote_id, lote_folio } = await lote(prenda);
		// 60 piezas de 1, 1.05 y 1.1 m con desperdicio: más de 63 m y menos de 100. La P-A alcanza sola.
		expect(await apartados(lote_id)).toEqual(
			[chico.id, grande.id].sort().map((rollo_id) => ({ rollo_id, estado: "sugerido" })),
		);
		const respuesta = await entregar(lote_id, prenda.recetaVersionId, [chico.id, grande.id]);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^${lote_folio}: 2 rollos pasan al taller\\. No cuadró .+: queda en diferencias$`),
			),
		});
		expect(await apartados(lote_id)).toEqual(
			[chico.id, grande.id].sort().map((rollo_id) => ({ rollo_id, estado: "entregado" })),
		);
		expect(
			await consultar(
				`SELECT r.folio, r.estado, e.cantidad FROM rollos r JOIN existencias_material e ON e.rollo_id = r.id
				 JOIN ubicaciones u ON u.id = e.ubicacion_id WHERE r.id = ANY($1::uuid[]) AND u.codigo = 'TAL' ORDER BY r.folio`,
				[[chico.id, grande.id]],
			),
		).toEqual(
			[
				{ folio: chico.folio, estado: "entregado", cantidad: "40.000" },
				{ folio: grande.folio, estado: "entregado", cantidad: "60.000" },
			].sort((uno, otro) => uno.folio.localeCompare(otro.folio)),
		);
		// Los avíos van en la primera entrega: el cierre (60 pza) está en el Taller.
		expect(
			await consultar(
				`SELECT e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'TAL' AND e.material_id = $1 AND e.rollo_id IS NULL`,
				[prenda.materiales.cierre],
			),
		).toEqual([{ cantidad: "60.000" }]);
		// Fase 14: Bodega no tenía cierres; se entregaron igual y Bodega queda en −60, con su DF- `material_corte`, a
		// cargo de Bodega, por aclarar, con su lote y su entrega.
		expect(
			await consultar(
				`SELECT e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'BOD' AND e.material_id = $1 AND e.rollo_id IS NULL`,
				[prenda.materiales.cierre],
			),
		).toEqual([{ cantidad: "-60.000" }]);
		expect(
			await consultar(
				`SELECT d.origen, d.cantidad, d.estado, u.codigo AS hueco, c.codigo AS a_cargo, d.lote_id,
					d.entrega_corte_id IS NOT NULL AS con_entrega, d.descripcion
				 FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id JOIN ubicaciones c ON c.id = d.a_cargo_ubicacion_id
				 WHERE d.material_id = $1`,
				[prenda.materiales.cierre],
			),
		).toEqual([
			{
				origen: "material_corte",
				cantidad: "-60.000",
				estado: "por_aclarar",
				hueco: "BOD",
				a_cargo: "BOD",
				lote_id,
				con_entrega: true,
				descripcion: expect.stringMatching(
					new RegExp(`^Se entregaron 60 .+ a ${lote_folio} sin existencia en Bodega$`),
				),
			},
		]);
		// La P-B sigue libre: nadie la sugirió.
		expect(await consultar("SELECT estado FROM apartados_rollo WHERE rollo_id = $1", [otra.id])).toEqual([]);
	});

	it("un rollo entregado a otro lote no se entrega; con otra versión de la receta, no; un lote cortado, tampoco", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const rollo = await rolloEnBodega(servidor, prenda.materiales.gabardina, "100", "P-C");
		const [uno, otro] = [await lote(prenda), await lote(prenda)];
		expect((await entregar(uno.lote_id, prenda.recetaVersionId, [rollo.id])).estado).toBe(200);
		expect((await entregar(otro.lote_id, prenda.recetaVersionId, [rollo.id])).cuerpo).toMatchObject({
			codigo: "rollo_no_disponible",
			mensaje: `${rollo.folio} ya está entregado a ${uno.lote_folio}`,
		});
		expect((await entregar(otro.lote_id, uno.lote_id, [rollo.id])).cuerpo).toMatchObject({ codigo: "receta_cambio" });
		await servidor.base.dueno.query(
			"UPDATE lotes SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Prueba' WHERE id = $1",
			[otro.lote_id],
		);
		expect((await entregar(otro.lote_id, prenda.recetaVersionId, [rollo.id])).cuerpo).toMatchObject({
			codigo: "lote_no_por_cortar",
			mensaje: `${otro.lote_folio} ya se cortó`,
		});
	});

	it("con rollos para un solo lote, se los queda el que se corta antes, aunque haya nacido después", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const rollo = await rolloEnBodega(servidor, prenda.materiales.gabardina, "100", "P-E");
		const despues = await lote(prenda, 20);
		const antes = await lote(prenda, 2);
		expect(await apartados(antes.lote_id)).toEqual([{ rollo_id: rollo.id, estado: "sugerido" }]);
		expect(await apartados(despues.lote_id)).toEqual([]);
	});

	/** Lo que hay del cierre de la receta en el Taller. */
	function cierresEnElTaller(prenda: { materiales: { cierre: string } }) {
		return consultar(
			`SELECT e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE u.codigo = 'TAL' AND e.material_id = $1 AND e.rollo_id IS NULL`,
			[prenda.materiales.cierre],
		);
	}

	it("lo sugerido que no se usó se libera; la tela que falta se entrega después, sin repetir los avíos", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const [chico, grande] = [
			await rolloEnBodega(servidor, tela, "40", "P-F"),
			await rolloEnBodega(servidor, tela, "60", "P-F"),
		];
		const { lote_id } = await lote(prenda);
		expect(await apartados(lote_id)).toHaveLength(2);
		expect((await entregar(lote_id, prenda.recetaVersionId, [grande.id])).estado).toBe(200);
		// El chico ya no queda sugerido: queda libre hasta la siguiente entrega.
		expect(await apartados(lote_id)).toEqual([{ rollo_id: grande.id, estado: "entregado" }]);
		expect(await cierresEnElTaller(prenda)).toEqual([{ cantidad: "60.000" }]);
		// La segunda entrega lleva solo la tela.
		expect((await entregar(lote_id, prenda.recetaVersionId, [chico.id])).estado).toBe(200);
		expect(await apartados(lote_id)).toEqual(
			[chico.id, grande.id].sort().map((rollo_id) => ({ rollo_id, estado: "entregado" })),
		);
		expect(await cierresEnElTaller(prenda)).toEqual([{ cantidad: "60.000" }]);
	});

	it("dos entregas del mismo lote a la vez van una tras otra: los avíos salen una sola vez", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const [uno, dos] = [
			await rolloEnBodega(servidor, tela, "50", "P-G"),
			await rolloEnBodega(servidor, tela, "50", "P-G"),
		];
		const { lote_id } = await lote(prenda);
		const respuestas = await Promise.all([
			entregar(lote_id, prenda.recetaVersionId, [uno.id]),
			entregar(lote_id, prenda.recetaVersionId, [dos.id]),
		]);
		expect(respuestas.map((respuesta) => respuesta.estado)).toEqual([200, 200]);
		expect(await cierresEnElTaller(prenda)).toEqual([{ cantidad: "60.000" }]);
	});

	it("sin receta no entrega", async () => {
		const prenda = await prendaDelTaller(servidor, siembra);
		const { lote_id } = await lote(prenda);
		const rollo = await rolloEnBodega(servidor, (await prendaParaCortar(servidor, siembra)).materiales.gabardina, "10");
		expect((await entregar(lote_id, lote_id, [rollo.id])).cuerpo).toMatchObject({ codigo: "sin_receta" });
	});
});
