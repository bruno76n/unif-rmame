/**
 * Prueba de `inventario.recibir_del_taller` e `inventario.recibir_reproceso`: un lote se recibe a ciegas, con un A- por
 * destino y sus etiquetas por imprimir, una DF- por talla que no cuadró, sus avíos consumidos y el lote en aduana; la
 * respuesta nunca trae lo aprobado. Un reproceso solo se recibe aprobado y una vez, con el reparto de su lote. Dos
 * recepciones del mismo lote a la vez reciben una sola.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { aprobarReprocesoDePrueba, loteRevisado, loteTerminado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { materialesDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { aclararDePrueba, libroPorUbicacion, salidaDe } from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { LoteCortado } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";

describe("Un lote se recibe a ciegas: un A- por destino, una DF- por talla que no cuadró, sus avíos consumidos y el lote en aduana", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Aduana recibe un lote con lo que contó de las tallas 4 y 6. */
	function recibir(lote: LoteCortado, talla4: number, talla6: number) {
		return mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{
				datos: {
					lote_id: lote.loteId,
					tallas: [
						{ variante_id: lote.prenda.variantes["4"], piezas: talla4 },
						{ variante_id: lote.prenda.variantes["6"], piezas: talla6 },
					],
				},
			},
			"aduana",
		);
	}

	/** Lo que regresó una recepción del taller. */
	function recibida(respuesta: { cuerpo: { resultado?: unknown } }) {
		return z
			.object({ mensaje: z.string(), recepcion_id: z.uuid(), traspaso_ids: z.array(z.uuid()) })
			.strict()
			.parse(respuesta.cuerpo.resultado);
	}

	it("a ciegas: el A- de su destino en aduana, el libro del Taller a Aduana, una DF- por talla, los avíos y el lote en aduana", async () => {
		// Calidad aprobó 3 de la talla 4 (rechazó 2) y 3 de la 6; Aduana cuenta 2 y 3.
		const lote = await loteRevisado(servidor, siembra, [5, 3, 0], 2);
		// Bodega le entregó al lote 4 piezas de un avío: salen del Taller al recibirlo.
		const [avio = ""] = await materialesDePrueba(servidor, 1, "avio");
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const entregaId = uuidv7();
		const movimiento = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			escribirMovimiento(contexto, {
				tipo: "entrega_corte",
				documento: { tipo: "entrega_corte", id: entregaId, folio: lote.folio },
				renglones: [{ origen: ubicacion.BOD ?? "", destino: ubicacion.TAL ?? "", materialId: avio, cantidad: "4" }],
				clave: uuidv7(),
			}),
		);
		await servidor.base.dueno.query(
			`INSERT INTO entregas_corte (id, lote_id, receta_version_id, estado, entregada_en, entregada_por, movimiento_id)
			 SELECT $1, l.id, l.receta_version_id, 'entregada', now(), $3, $4 FROM lotes l WHERE l.id = $2`,
			[entregaId, lote.loteId, cuentaDePrueba("bodega"), movimiento.movimientoId],
		);
		const respuesta = recibir(lote, 2, 3);
		const salida = recibida(await respuesta);
		expect(salida.mensaje).toBe(
			`${lote.folio} en aduana: 5 piezas para Bodega. Faltaron 1 contra lo que aprobó calidad: queda por aclarar a cargo del taller`,
		);
		// La respuesta nunca dice lo aprobado.
		expect(JSON.stringify(await respuesta)).not.toMatch(/aprobad/);
		expect(
			await consultar(
				`SELECT t.tipo, t.estado, o.codigo AS origen, d.codigo AS destino, t.lote_id, t.fecha_salida_esperada IS NOT NULL AS sale,
					t.etiquetas_impresas_en, sum(l.piezas_recibidas_aduana)::int AS piezas
				 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id JOIN ubicaciones o ON o.id = t.origen_ubicacion_id
				 JOIN ubicaciones d ON d.id = t.destino_ubicacion_id WHERE t.id = ANY($1::uuid[])
				 GROUP BY t.id, o.codigo, d.codigo`,
				[salida.traspaso_ids],
			),
		).toEqual([
			{
				tipo: "lote_temporada",
				estado: "en_aduana",
				origen: "TAL",
				destino: "BOD",
				lote_id: lote.loteId,
				sale: true,
				etiquetas_impresas_en: null,
				piezas: 5,
			},
		]);
		const talla4 = lote.prenda.variantes["4"] ?? "";
		const talla6 = lote.prenda.variantes["6"] ?? "";
		// En el Taller quedan las 2 del reproceso y la que faltó contra lo aprobado.
		expect(await libroPorUbicacion(servidor, [talla4])).toEqual([
			{ codigo: "ADU", piezas: 2 },
			{ codigo: "TAL", piezas: 3 },
		]);
		expect(await libroPorUbicacion(servidor, [talla6])).toEqual([{ codigo: "ADU", piezas: 3 }]);
		expect(
			await consultar(
				`SELECT d.origen, d.piezas, d.sistema_decia, d.estado, u.codigo AS hueco, c.codigo AS a_cargo, d.lote_id
				 FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id JOIN ubicaciones c ON c.id = d.a_cargo_ubicacion_id
				 WHERE d.recepcion_id = $1`,
				[salida.recepcion_id],
			),
		).toEqual([
			{
				origen: "recepcion_taller",
				piezas: -1,
				sistema_decia: 3,
				estado: "por_aclarar",
				hueco: "TAL",
				a_cargo: "TAL",
				lote_id: lote.loteId,
			},
		]);
		expect(
			await consultar(
				"SELECT modo, tipo, hubo_diferencia, revision_id IS NOT NULL AS con_revision FROM recepciones WHERE id = $1",
				[salida.recepcion_id],
			),
		).toEqual([{ modo: "ciego", tipo: "aduana_del_taller", hubo_diferencia: true, con_revision: true }]);
		expect(await consultar("SELECT estado FROM lotes WHERE id = $1", [lote.loteId])).toEqual([{ estado: "en_aduana" }]);
		// Los avíos que su entrega pasó al Taller salen con el lote; la tela, no.
		const entregados = await consultar(
			`SELECT l.material_id, sum(l.cantidad)::text AS cantidad FROM entregas_corte e
			 JOIN movimiento_lineas l ON l.movimiento_id = e.movimiento_id
			 WHERE e.lote_id = $1 AND l.rollo_id IS NULL GROUP BY l.material_id ORDER BY l.material_id`,
			[lote.loteId],
		);
		expect(
			await consultar(
				`SELECT l.material_id, sum(l.cantidad)::text AS cantidad FROM movimientos m JOIN movimiento_lineas l ON l.movimiento_id = m.id
				 WHERE m.tipo = 'consumo_avios' AND l.lote_id = $1 GROUP BY l.material_id ORDER BY l.material_id`,
				[lote.loteId],
			),
		).toEqual(entregados);
		expect(entregados).toEqual([{ material_id: avio, cantidad: "4.000" }]);
		// Una sola vez.
		expect((await recibir(lote, 2, 3)).cuerpo).toMatchObject({
			codigo: "lote_ya_recibido",
			mensaje: `${lote.folio} ya se recibió en aduana.`,
		});
	});

	it("lo que no deja recibir: un lote sin revisar, una talla sin contar, una talla que no es del lote; Calidad no recibe", async () => {
		const lote = await loteRevisado(servidor, siembra, [2, 1, 0]);
		const sinTalla = await mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{ datos: { lote_id: lote.loteId, tallas: [{ variante_id: lote.prenda.variantes["4"], piezas: 2 }] } },
			"aduana",
		);
		expect(sinTalla.cuerpo).toMatchObject({ campos: { tallas: "Cuenta esta talla, aunque sea 0" } });
		const ajena = await mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{
				datos: {
					lote_id: lote.loteId,
					tallas: [
						{ variante_id: lote.prenda.variantes["4"], piezas: 2 },
						{ variante_id: lote.prenda.variantes["6"], piezas: 1 },
						{ variante_id: lote.prenda.variantes["8"], piezas: 1 },
					],
				},
			},
			"aduana",
		);
		expect(ajena.cuerpo).toMatchObject({ campos: { tallas: "Cuenta esta talla, aunque sea 0" } });
		expect(
			(
				await mandarAccion(
					servidor,
					"inventario.recibir_del_taller",
					{ datos: { lote_id: lote.loteId, tallas: [{ variante_id: lote.prenda.variantes["4"], piezas: 2 }] } },
					"calidad",
				)
			).estado,
		).toBe(403);
		// Un lote terminado que Calidad todavía no revisa.
		const sinRevisar = await loteTerminado(servidor, siembra, [2, 1, 0]);
		expect((await recibir(sinRevisar, 2, 1)).cuerpo).toMatchObject({
			codigo: "lote_no_revisado",
			mensaje: `${sinRevisar.folio} todavía no lo revisa Calidad.`,
		});
	});

	it("dos recepciones del mismo lote a la vez: entra una, la otra ve que ya se recibió", async () => {
		const lote = await loteRevisado(servidor, siembra, [2, 1, 0]);
		const respuestas = await Promise.all([recibir(lote, 2, 1), recibir(lote, 2, 1)]);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		expect(await libroPorUbicacion(servidor, [lote.prenda.variantes["4"] ?? ""])).toEqual([
			{ codigo: "ADU", piezas: 2 },
		]);
	});

	it("un reproceso solo se recibe aprobado y una vez, con el reparto de su lote; sus etiquetas se imprimen", async () => {
		const lote = await loteRevisado(servidor, siembra, [5, 3, 0], 2);
		const reproceso = lote.reprocesoId ?? "";
		const recibirReproceso = (piezas: number) =>
			mandarAccion(servidor, "inventario.recibir_reproceso", { datos: { reproceso_id: reproceso, piezas } }, "aduana");
		await recibir(lote, 3, 3);
		expect((await recibirReproceso(2)).cuerpo).toMatchObject({ codigo: "reproceso_no_listo" });
		expect((await aprobarReprocesoDePrueba(servidor, reproceso)).estado).toBe(200);
		const respuesta = await recibirReproceso(2);
		const salida = recibida(respuesta);
		expect(salida.mensaje).toBe(`${lote.folio}-R1 en aduana: 2 piezas para Bodega`);
		expect(
			await consultar("SELECT tipo, reproceso_id, lote_id FROM traspasos WHERE id = ANY($1::uuid[])", [
				salida.traspaso_ids,
			]),
		).toEqual([{ tipo: "reproceso", reproceso_id: reproceso, lote_id: lote.loteId }]);
		expect(await libroPorUbicacion(servidor, [lote.prenda.variantes["4"] ?? ""])).toEqual([
			{ codigo: "ADU", piezas: 5 },
		]);
		expect((await recibirReproceso(2)).cuerpo).toMatchObject({
			codigo: "reproceso_ya_recibido",
			mensaje: `${lote.folio}-R1 ya se recibió.`,
		});
		// «Imprimir etiquetas» del A- del reproceso.
		const [traspasoId = ""] = salida.traspaso_ids;
		const impresas = await mandarAccion(
			servidor,
			"inventario.marcar_etiquetas_impresas",
			{ datos: { traspaso_id: traspasoId, destino: "pdf" }, version: await versionDeTraspaso(servidor, traspasoId) },
			"aduana",
		);
		expect(impresas.estado).toBe(200);
		expect(
			await consultar("SELECT etiquetas_impresas_en IS NOT NULL AS impresas FROM traspasos WHERE id = $1", [
				traspasoId,
			]),
		).toEqual([{ impresas: true }]);
	});

	it("lo que el Taller trajo después de la recepción entra a Aduana con el mismo reparto, en un A- nuevo", async () => {
		const lote = await loteRevisado(servidor, siembra, [3, 1, 0]);
		const salida = recibida(await recibir(lote, 2, 1));
		const [diferencia] = await consultar("SELECT id FROM diferencias WHERE recepcion_id = $1", [salida.recepcion_id]);
		const aclarada = await aclararDePrueba(servidor, String(diferencia?.id), { aclaracion: "llego" });
		const nuevo = salidaDe(aclarada).traspaso_id;
		expect(
			await consultar(
				`SELECT t.tipo, t.estado, d.codigo AS destino, t.lote_id FROM traspasos t
				 JOIN ubicaciones d ON d.id = t.destino_ubicacion_id WHERE t.id = $1`,
				[nuevo],
			),
		).toEqual([{ tipo: "lote_temporada", estado: "en_aduana", destino: "BOD", lote_id: lote.loteId }]);
		expect(await libroPorUbicacion(servidor, [lote.prenda.variantes["4"] ?? ""])).toEqual([
			{ codigo: "ADU", piezas: 3 },
		]);
		// Lo que sobró y llegó a Aduana no regresa: `llego` no aplica.
		const otro = await loteRevisado(servidor, siembra, [1, 1, 0]);
		const deMas = recibida(await recibir(otro, 2, 1));
		const [sobra] = await consultar("SELECT id FROM diferencias WHERE recepcion_id = $1", [deMas.recepcion_id]);
		expect((await aclararDePrueba(servidor, String(sobra?.id), { aclaracion: "llego" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
		});
		expect((await aclararDePrueba(servidor, String(sobra?.id), { aclaracion: "no_salio" })).cuerpo).toMatchObject({
			codigo: "aclaracion_no_aplica",
		});
	});
});
