/**
 * Prueba de `produccion.cerrar_corte` y de lo que regresa del corte: cierra con lo que pide la receta o con lo que se
 * escribió que quedó; lo que quedó va a rollo, retazo o merma con la frontera; nacen las piezas cortadas en el Taller y
 * los bultos parejos de hasta 24; lo que regresa se queda en el Taller hasta que Bodega lo recibe.
 * Fase 12 · docs/fases/12-produccion.md (parte 3)
 */

import { aMilesimos, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
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

describe("Cerrar el corte consume lo que pide la receta o lo que se escribió que quedó, manda lo que quedó a rollo, retazo o merma, crea las piezas cortadas y arma los bultos", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let ubicacion: Record<string, string>;
	let cortador: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		ubicacion = await ubicacionesPorCodigo(servidor);
		cortador = await nuevaPersona(servidor.base.dueno, "taller");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un lote para Bodega con sus piezas por talla 4, 6 y 8. */
	async function lote(prenda: PrendaParaCortar, piezas: [number, number, number]) {
		const respuesta = await mandarAccion(
			servidor,
			"produccion.crear_orden",
			{
				datos: {
					ubicacion_destino_id: ubicacion.BOD,
					producto_id: prenda.productoId,
					tallas: ["4", "6", "8"].map((talla, i) => ({ variante_id: prenda.variantes[talla], piezas: piezas[i] })),
					fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 20 }).toString(),
				},
			},
			"produccion",
		);
		return z.object({ lote_id: z.uuid(), lote_folio: z.string() }).parse(respuesta.cuerpo.resultado);
	}

	/** La versión de un lote. */
	async function versionDelLote(loteId: string) {
		return Number((await consultar("SELECT version::int AS v FROM lotes WHERE id = $1", [loteId]))[0]?.v);
	}

	/** Producción cierra el corte. */
	async function cerrar(loteId: string, datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"produccion.cerrar_corte",
			{ datos: { lote_id: loteId, corto_persona_id: cortador, ...datos }, version: await versionDelLote(loteId) },
			"produccion",
		);
	}

	/** Lo que tiene un rollo en cada ubicación. */
	function dondeEsta(rolloId: string) {
		return consultar(
			`SELECT u.codigo, e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE e.rollo_id = $1 AND e.cantidad <> 0 ORDER BY u.codigo`,
			[rolloId],
		);
	}

	it("con lo que pide la receta: consume los rollos, el último regresa como rollo, nacen las piezas en el Taller y los bultos", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const [primero, ultimo] = [
			await rolloEnBodega(servidor, tela, "40", "P-D"),
			await rolloEnBodega(servidor, tela, "60", "P-D"),
		];
		const { lote_id, lote_folio } = await lote(prenda, [30, 20, 10]);
		await mandarAccion(
			servidor,
			"inventario.entregar_al_corte",
			{ datos: { lote_id, receta_version_id: prenda.recetaVersionId, rollo_ids: [primero.id, ultimo.id] } },
			"bodega",
		);
		const respuesta = await cerrar(lote_id, {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: tela, rollos: [{ rollo_id: primero.id }, { rollo_id: ultimo.id }] }],
			tallas: ["4", "6", "8"].map((talla, i) => ({ variante_id: prenda.variantes[talla], piezas: [30, 20, 10][i] })),
		});
		expect(respuesta.estado).toBe(200);
		const resultado = z
			.object({
				bultos: z.array(z.object({ folio: z.string(), piezas: z.number() })),
				mensaje: z.string(),
			})
			.parse(respuesta.cuerpo.resultado);
		// 30 piezas son dos bultos de 15; 20 y 10, uno cada una. B-{año}-{número}-{nn}.
		expect(resultado.bultos.map((bulto) => bulto.piezas)).toEqual([15, 15, 20, 10]);
		expect(resultado.bultos[0]?.folio).toBe(`B-${lote_folio.slice(2)}-01`);
		expect(resultado.mensaje).toBe(`${lote_folio} cortado. La receta de ${prenda.nombre} queda verificada`);
		const [telaDelCorte] = await consultar(
			"SELECT metros_receta, metros_quedaron, destino_sobrante, quedaron_cambiado FROM corte_telas t JOIN cortes c ON c.id = t.corte_id WHERE c.lote_id = $1",
			[lote_id],
		);
		// 30 × 1 + 20 × 1.05 + 10 × 1.1 = 62 m más el desperdicio: el primero completo y lo demás del último.
		const pide = aMilesimos(String(telaDelCorte?.metros_receta));
		expect(pide).toBeGreaterThan(62_000n);
		expect(telaDelCorte).toMatchObject({
			metros_quedaron: deMilesimos(100_000n - pide),
			destino_sobrante: "rollo",
			quedaron_cambiado: false,
		});
		expect(await dondeEsta(primero.id)).toEqual([]);
		expect(await dondeEsta(ultimo.id)).toEqual([{ codigo: "TAL", cantidad: deMilesimos(100_000n - pide) }]);
		expect(
			await consultar("SELECT estado FROM rollos WHERE id = ANY($1::uuid[]) ORDER BY folio", [[primero.id, ultimo.id]]),
		).toEqual([
			{ estado: primero.folio < ultimo.folio ? "agotado" : "por_recibir" },
			{ estado: primero.folio < ultimo.folio ? "por_recibir" : "agotado" },
		]);
		expect(
			await consultar(
				`SELECT sum(e.piezas)::int AS piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'TAL' AND e.variante_id = ANY($1::uuid[])`,
				[Object.values(prenda.variantes)],
			),
		).toEqual([{ piezas: 60 }]);
		expect(await consultar("SELECT estado, flujo_id, receta_version_id FROM lotes WHERE id = $1", [lote_id])).toEqual([
			{ estado: "en_proceso", flujo_id: prenda.flujo.flujoId, receta_version_id: prenda.recetaVersionId },
		]);
		// Lo que regresó del corte se queda en el Taller hasta que Bodega lo recibe.
		const { rows: versiones } = await servidor.base.dueno.query("SELECT version::int AS v FROM rollos WHERE id = $1", [
			ultimo.id,
		]);
		const recibido = await mandarAccion(
			servidor,
			"inventario.recibir_del_corte",
			{ datos: { rollo_id: ultimo.id }, version: versiones[0]?.v },
			"bodega",
		);
		expect(recibido.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(new RegExp(`^${ultimo.folio} recibido en bodega: .+ m de `)),
		});
		expect(await dondeEsta(ultimo.id)).toEqual([{ codigo: "BOD", cantidad: deMilesimos(100_000n - pide) }]);
		expect(await consultar("SELECT estado FROM rollos WHERE id = $1", [ultimo.id])).toEqual([{ estado: "disponible" }]);
	});

	it("lo que se escribió que quedó: abajo de la frontera es retazo, o merma si ya no sirve; un rollo que Bodega no entregó se entrega al cerrar", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const [conRetazo, conMerma] = [
			await rolloEnBodega(servidor, tela, "70"),
			await rolloEnBodega(servidor, tela, "70"),
		];
		const tallas = (piezas: [number, number, number]) =>
			["4", "6", "8"].map((talla, i) => ({ variante_id: prenda.variantes[talla], piezas: piezas[i] }));
		const uno = await lote(prenda, [20, 20, 20]);
		const otro = await lote(prenda, [20, 20, 20]);
		// Sin entregar: el corte toma el rollo de Bodega y lo entrega en el mismo cierre.
		const retazo = await cerrar(uno.lote_id, {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: tela, rollos: [{ rollo_id: conRetazo.id }], metros_quedaron: "5" }],
			tallas: tallas([20, 20, 20]),
		});
		expect(retazo.estado).toBe(200);
		expect(
			await consultar("SELECT folio LIKE 'RZ-%' AS rz, metros, estado FROM retazos WHERE rollo_id = $1", [
				conRetazo.id,
			]),
		).toEqual([{ rz: true, metros: "5.000", estado: "por_recibir" }]);
		expect(await consultar("SELECT estado, es_retazo FROM rollos WHERE id = $1", [conRetazo.id])).toEqual([
			{ estado: "por_recibir", es_retazo: true },
		]);
		expect(await dondeEsta(conRetazo.id)).toEqual([{ codigo: "TAL", cantidad: "5.000" }]);
		const merma = await cerrar(otro.lote_id, {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: tela, rollos: [{ rollo_id: conMerma.id }], metros_quedaron: "5", ya_no_sirve: true }],
			tallas: tallas([20, 20, 20]),
		});
		expect(merma.estado).toBe(200);
		expect(await dondeEsta(conMerma.id)).toEqual([]);
		expect(await consultar("SELECT estado FROM rollos WHERE id = $1", [conMerma.id])).toEqual([{ estado: "agotado" }]);
	});

	it("lo que no deja cerrar: más piezas que las planeadas, ninguna pieza, una tela que no es de la receta, una tela, una talla o un rollo repetidos, un lote ya cortado", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		const rollo = await rolloEnBodega(servidor, tela, "100");
		const { lote_id, lote_folio } = await lote(prenda, [10, 10, 10]);
		const base = {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: tela, rollos: [{ rollo_id: rollo.id }] }],
			tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 10 })),
		};
		expect(
			(await cerrar(lote_id, { ...base, tallas: [{ variante_id: prenda.variantes["4"], piezas: 11 }] })).cuerpo,
		).toMatchObject({
			codigo: "piezas_mas_que_planeado",
			mensaje: "Máximo 10",
		});
		expect(
			(await cerrar(lote_id, { ...base, tallas: [{ variante_id: prenda.variantes["4"], piezas: 0 }] })).cuerpo,
		).toMatchObject({
			codigo: "sin_piezas",
		});
		expect(
			(
				await cerrar(lote_id, {
					...base,
					telas: [{ material_id: prenda.materiales.popelina, rollos: [{ rollo_id: rollo.id }] }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "tela_fuera_de_receta",
		});
		expect(
			(
				await cerrar(lote_id, {
					...base,
					telas: [{ material_id: tela, rollos: [{ rollo_id: rollo.id }, { rollo_id: rollo.id }] }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "rollo_repetido" });
		expect((await cerrar(lote_id, { ...base, telas: [...base.telas, ...base.telas] })).cuerpo).toMatchObject({
			codigo: "tela_repetida",
		});
		expect(
			(await cerrar(lote_id, { ...base, tallas: [...base.tallas, ...base.tallas.slice(0, 1)] })).cuerpo,
		).toMatchObject({ codigo: "talla_repetida" });
		const bien = await cerrar(lote_id, base);
		expect(bien.estado).toBe(200);
		expect((await cerrar(lote_id, base)).cuerpo).toMatchObject({
			codigo: "lote_no_por_cortar",
			mensaje: `${lote_folio} ya está cortado.`,
		});
	});

	it("las etiquetas de bulto: un lote sin cortar no tiene; sin impresora en el Taller, el PDF", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const rollo = await rolloEnBodega(servidor, prenda.materiales.gabardina, "100");
		const { lote_id, lote_folio } = await lote(prenda, [5, 5, 5]);
		const imprimir = () =>
			mandarAccion(servidor, "produccion.imprimir_etiquetas_bulto", { datos: { lote_id } }, "produccion");
		expect((await imprimir()).cuerpo).toMatchObject({
			codigo: "lote_sin_cortar",
			mensaje: `${lote_folio} no tiene bultos: primero se cierra el corte.`,
		});
		await cerrar(lote_id, {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: prenda.materiales.gabardina, rollos: [{ rollo_id: rollo.id }] }],
			tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 5 })),
		});
		expect((await imprimir()).cuerpo).toMatchObject({
			codigo: "sin_impresora_taller",
			mensaje: "No hay impresora del taller: descarga el PDF de las etiquetas.",
		});
		// Con la lista vacía, también todos los del lote.
		const vacia = await mandarAccion(
			servidor,
			"produccion.imprimir_etiquetas_bulto",
			{ datos: { lote_id, bulto_ids: [] } },
			"produccion",
		);
		expect(vacia.cuerpo).toMatchObject({ codigo: "sin_impresora_taller" });
	});

	it("una tela de la receta sin rollos no deja cerrar", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const [receta] = await consultar("SELECT id, version::int AS v FROM recetas WHERE producto_id = $1", [
			prenda.productoId,
		]);
		// La receta lleva también popelina de combinación.
		const tallasDeLaReceta = ["4", "6", "8"].map((talla) => prenda.tallas[talla]);
		const guardada = await mandarAccion(
			servidor,
			"patronaje.guardar_receta",
			{
				datos: {
					producto_id: prenda.productoId,
					medidas: [],
					motivo: "Lleva vista de popelina",
					lineas: [
						{
							papel: "tela_principal",
							material_id: prenda.materiales.gabardina,
							modo: "por_talla",
							unidad_receta: "m",
							tallas: tallasDeLaReceta.map((talla_id) => ({ talla_id, cantidad: "1.000" })),
							orden: 1,
						},
						{
							papel: "combinacion",
							material_id: prenda.materiales.popelina,
							modo: "por_talla",
							unidad_receta: "m",
							tallas: tallasDeLaReceta.map((talla_id) => ({ talla_id, cantidad: "0.200" })),
							orden: 2,
						},
					],
				},
				version: receta?.v,
			},
			"patronaje",
		);
		expect(guardada.cuerpo).toMatchObject({ ok: true });
		const [{ version } = { version: "" }] = await consultar(
			"SELECT version_vigente_id AS version FROM recetas WHERE producto_id = $1",
			[prenda.productoId],
		);
		const rollo = await rolloEnBodega(servidor, prenda.materiales.gabardina, "100");
		const { lote_id } = await lote(prenda, [5, 5, 5]);
		const respuesta = await cerrar(lote_id, {
			receta_version_id: version,
			telas: [{ material_id: prenda.materiales.gabardina, rollos: [{ rollo_id: rollo.id }] }],
			tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 5 })),
		});
		expect(respuesta.cuerpo).toMatchObject({ codigo: "falta_tela" });
	});

	it("lo que falta, el piso del patrón y la mezcla de partidas solo avisan: el corte se cierra", async () => {
		const prenda = await prendaParaCortar(servidor, siembra);
		const tela = prenda.materiales.gabardina;
		// 30 piezas piden más de 31 m; los dos rollos, de dos partidas, tienen 25.
		const [uno, dos] = [
			await rolloEnBodega(servidor, tela, "20", "P-H"),
			await rolloEnBodega(servidor, tela, "5", "P-I"),
		];
		// El que alcanza solo queda sugerido para el lote, aunque se corte con los otros dos.
		await rolloEnBodega(servidor, tela, "100", "P-J");
		const { lote_id } = await lote(prenda, [10, 10, 10]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM apartados_rollo WHERE lote_id = $1 AND estado = 'sugerido'", [
				lote_id,
			]),
		).toEqual([{ n: 1 }]);
		const respuesta = await cerrar(lote_id, {
			receta_version_id: prenda.recetaVersionId,
			telas: [{ material_id: tela, rollos: [{ rollo_id: uno.id }, { rollo_id: dos.id }] }],
			tallas: ["4", "6", "8"].map((talla) => ({ variante_id: prenda.variantes[talla], piezas: 10 })),
		});
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.avisos).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^Faltan .+ m de .+ · 30 piezas llevan .+ m según la receta · los 2 rollos tienen 25 m$/),
				expect.stringMatching(
					/^Con 25 m de .+ no salen 30 piezas según el patrón, que pide .+ m: revisa lo que quedó\.$/,
				),
				"Se mezclan las partidas P-H y P-I: el tono puede variar entre piezas.",
			]),
		);
		// El desperdicio medido cuenta lo que de verdad salió de los rollos, no lo que pedía la receta.
		const leido = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("produccion.cortes_de_prenda", { producto_id: prenda.productoId }),
		);
		expect(leido).toMatchObject({ cortes: [{ lote_id, metros_usados: "25.000" }] });
		// Lo sugerido que el lote ya no usó queda libre al cerrar.
		expect(
			await consultar("SELECT count(*)::int AS n FROM apartados_rollo WHERE lote_id = $1 AND estado = 'sugerido'", [
				lote_id,
			]),
		).toEqual([{ n: 0 }]);
	});
});
