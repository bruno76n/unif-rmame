/**
 * Prueba de `inventario.recibir_despacho` y `inventario.entregar_a_tienda_sin_caja`: solo quien recibe confirma; lo que
 * falta se queda en Tránsito a cargo de Aduana y lo que sobra o no venía sale del tramo del primer traspaso; el
 * material queda en Bodega.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 2)
 * Fase 14 · «Recibir con diferencias en aduana o un despacho abre una DF- por renglón, a cargo de quien lo mandó, y el
 * traspaso queda `con_diferencia`»
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	despacharDePrueba,
	ordenParaRecibir,
	recibirDePrueba,
	traspasoEnAduana,
	versionDeDespacho,
} from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Solo quien recibe confirma: lo que falta se queda en Tránsito a cargo de Aduana y lo que sobra sale del tramo del primer traspaso", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Despacha unos traspasos y regresa el despacho. */
	async function despachado(ids: string[]): Promise<string> {
		const respuesta = await despacharDePrueba(servidor, ids);
		return z.object({ despacho_id: z.uuid() }).parse(respuesta.cuerpo.resultado).despacho_id;
	}

	/** Bodega recibe un despacho. */
	async function recibir(despachoId: string, datos: Record<string, unknown>, quien = "bodega") {
		return mandarAccion(
			servidor,
			"inventario.recibir_despacho",
			{ datos: { despacho_id: despachoId, ...datos }, version: await versionDeDespacho(servidor, despachoId) },
			quien,
		);
	}

	/** Las piezas de unas variantes por ubicación. */
	function piezas(variantes: string[]) {
		return consultar(
			`SELECT u.codigo, sum(e.piezas)::int AS piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE e.variante_id = ANY($1::uuid[]) AND e.piezas <> 0 GROUP BY u.codigo ORDER BY u.codigo`,
			[variantes],
		);
	}

	it("completo: todo pasa a Bodega; el traspaso y el despacho quedan recibidos; Aduana no confirma por Bodega", async () => {
		const traspaso = await traspasoEnAduana(servidor, "BOD");
		const despacho = await despachado([traspaso.id]);
		expect((await recibir(despacho, { modo: "completo" }, "aduana")).estado).toBe(403);
		const respuesta = await recibir(despacho, { modo: "completo" });
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^D-\d{4}: 8 piezas recibidas en bodega$/),
		});
		expect(await piezas(traspaso.variantes)).toEqual([{ codigo: "BOD", piezas: 8 }]);
		expect(
			await consultar("SELECT estado, recepcion_destino_id IS NOT NULL AS con_recepcion FROM traspasos WHERE id = $1", [
				traspaso.id,
			]),
		).toEqual([{ estado: "recibido", con_recepcion: true }]);
		expect(
			await consultar("SELECT estado, recibido_en IS NOT NULL AS recibido FROM despachos WHERE id = $1", [despacho]),
		).toEqual([{ estado: "recibido", recibido: true }]);
		expect((await recibir(despacho, { modo: "completo" })).cuerpo).toMatchObject({ codigo: "ya_recibido" });
	});

	it("con diferencias: lo que falta se queda en Tránsito; lo que sobra y lo que no venía sale del tramo del primer traspaso", async () => {
		const [primero, segundo] = [await traspasoEnAduana(servidor, "BOD"), await traspasoEnAduana(servidor, "BOD")];
		const despacho = await despachado([primero.id, segundo.id]);
		const lineas = await consultar(
			`SELECT l.id, l.traspaso_id, l.variante_id, l.piezas_enviadas FROM traspaso_lineas l JOIN traspasos t ON t.id = l.traspaso_id
			 WHERE t.despacho_id = $1 ORDER BY t.folio, l.renglon`,
			[despacho],
		);
		expect((await recibir(despacho, { modo: "con_diferencias", renglones: [] })).cuerpo).toMatchObject({
			codigo: "falta_renglon",
			mensaje: "Escribe cuántas llegaron de cada prenda, aunque sea 0",
		});
		// Del primero llegaron 4 de 5 y 3 de 3; del segundo, 7 de 5 y 0 de 3; y una prenda que no venía.
		const [otra = ""] = await variantesLibres(servidor, 1);
		const contadas = [4, 3, 7, 0];
		const respuesta = await recibir(despacho, {
			modo: "con_diferencias",
			renglones: lineas.map((linea, i) => ({ traspaso_linea_id: linea.id, piezas: contadas[i] })),
			no_venia: [{ variante_id: otra, piezas: 2 }],
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				/^D-\d{4}: 16 piezas en bodega\. Faltaron 4: queda por aclarar a cargo de Aduana$/,
			),
		});
		// En Tránsito quedan las 4 que faltaron, menos las 2 de más del segundo y las 2 que no venían.
		const enTransito = await consultar(
			`SELECT l.traspaso_id, sum(CASE WHEN u2.tipo = 'transito' THEN l.piezas ELSE 0 END - CASE WHEN u.tipo = 'transito' THEN l.piezas ELSE 0 END)::int AS queda
			 FROM movimiento_lineas l LEFT JOIN ubicaciones u ON u.id = l.origen_ubicacion_id LEFT JOIN ubicaciones u2 ON u2.id = l.destino_ubicacion_id
			 WHERE l.traspaso_id = ANY($1::uuid[]) GROUP BY l.traspaso_id`,
			[[primero.id, segundo.id]],
		);
		const queda = new Map(enTransito.map((fila) => [fila.traspaso_id, fila.queda]));
		// El primero: le faltó 1 y de su tramo salieron las 2 de más del segundo y las 2 que no venían.
		expect(queda.get(primero.id)).toBe(1 - 2 - 2);
		// El segundo: le faltaron 3; sus 2 de más salieron del tramo del primero, no del suyo.
		expect(queda.get(segundo.id)).toBe(3);
		expect(
			await consultar("SELECT folio, estado FROM traspasos WHERE id = ANY($1::uuid[]) ORDER BY folio", [
				[primero.id, segundo.id],
			]),
		).toEqual([
			{ folio: primero.folio, estado: "con_diferencia" },
			{ folio: segundo.folio, estado: "con_diferencia" },
		]);
		expect(await consultar("SELECT estado FROM despachos WHERE id = $1", [despacho])).toEqual([
			{ estado: "con_diferencia" },
		]);
		// Fase 14: una DF- por renglón que no cuadró, en Tránsito y a cargo de Aduana, por aclarar; lo que sobró o no
		// venía, con el primer traspaso. Lo que dicen las DF- de cada traspaso es justo lo que quedó en su tramo.
		const nacidas = await consultar(
			`SELECT d.traspaso_id, d.piezas, d.sistema_decia, d.estado, u.codigo AS hueco, c.codigo AS a_cargo, d.descripcion
			 FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id JOIN ubicaciones c ON c.id = d.a_cargo_ubicacion_id
			 WHERE d.recepcion_id = $1 ORDER BY d.folio`,
			[z.object({ recepcion_id: z.uuid() }).parse(respuesta.cuerpo.resultado).recepcion_id],
		);
		const comun = { estado: "por_aclarar", hueco: "TRA", a_cargo: "ADU" };
		expect(nacidas).toEqual([
			{
				...comun,
				traspaso_id: primero.id,
				piezas: -1,
				sistema_decia: 5,
				descripcion: expect.stringMatching(/^Aduana mandó 5 en D-\d{4} y Bodega recibió 4$/),
			},
			{
				...comun,
				traspaso_id: primero.id,
				piezas: 2,
				sistema_decia: 5,
				descripcion: expect.stringMatching(/recibió 7$/),
			},
			{
				...comun,
				traspaso_id: segundo.id,
				piezas: -3,
				sistema_decia: 3,
				descripcion: expect.stringMatching(/recibió 0$/),
			},
			{
				...comun,
				traspaso_id: primero.id,
				piezas: 2,
				sistema_decia: 0,
				descripcion: expect.stringMatching(/^Bodega recibió 2 en D-\d{4} que no venían$/),
			},
		]);
		for (const traspaso of [primero, segundo]) {
			const suyas = nacidas.filter((nacida) => nacida.traspaso_id === traspaso.id);
			expect(queda.get(traspaso.id)).toBe(-suyas.reduce((suma, suya) => suma + suya.piezas, 0));
		}
	});

	it("con diferencias: el primer traspaso que cuadra queda con diferencia si de su tramo salió lo de más de otro", async () => {
		const [primero, segundo] = [await traspasoEnAduana(servidor, "BOD"), await traspasoEnAduana(servidor, "BOD")];
		const despacho = await despachado([primero.id, segundo.id]);
		const lineas = await consultar(
			`SELECT l.id FROM traspaso_lineas l JOIN traspasos t ON t.id = l.traspaso_id
			 WHERE t.despacho_id = $1 ORDER BY t.folio, l.renglon`,
			[despacho],
		);
		// El primero llegó justo; del segundo, 6 de 5.
		const contadas = [5, 3, 6, 3];
		await recibir(despacho, {
			modo: "con_diferencias",
			renglones: lineas.map((linea, i) => ({ traspaso_linea_id: linea.id, piezas: contadas[i] })),
		});
		expect(
			await consultar("SELECT folio, estado FROM traspasos WHERE id = ANY($1::uuid[]) ORDER BY folio", [
				[primero.id, segundo.id],
			]),
		).toEqual([
			{ folio: primero.folio, estado: "con_diferencia" },
			{ folio: segundo.folio, estado: "con_diferencia" },
		]);
	});

	it("el material de una orden: despachado y recibido, queda en Bodega por rollo", async () => {
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirDePrueba(servidor, orden, [{ metros: "100", partida: "A" }], 500);
		const { traspaso_id: aDeLaOrden } = z.object({ traspaso_id: z.uuid() }).parse(recibida.cuerpo.resultado);
		const despacho = await despachado([aDeLaOrden]);
		expect((await recibir(despacho, { modo: "completo" })).cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^D-\d{4}: el material ya está en bodega$/),
		});
		expect(
			await consultar(
				`SELECT u.codigo, count(DISTINCT e.rollo_id)::int AS rollos, sum(e.cantidad)::text AS hay FROM existencias_material e
				 JOIN ubicaciones u ON u.id = e.ubicacion_id WHERE e.material_id = $1 AND e.cantidad <> 0 GROUP BY u.codigo`,
				[orden.tela],
			),
		).toEqual([{ codigo: "BOD", rollos: 1, hay: "100.000" }]);
	});

	it("las reservas viajan con su pieza: de Aduana a Tránsito al despachar, y de ahí a Bodega al recibir", async () => {
		const traspaso = await traspasoEnAduana(servidor, "BOD");
		const [variante] = traspaso.variantes;
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, traspaso_id, estado)
			 SELECT $1, u.id, $2, 5, 'pedido_externo', $3, $4, 'activa' FROM ubicaciones u WHERE u.codigo = 'ADU'`,
			[uuidv7(), variante, await pedidoDePrueba(servidor), traspaso.id],
		);
		// Al llegar al destino del traspaso, la reserva deja su traspaso: se busca por su variante.
		const dondeEsta = async () =>
			consultar(
				`SELECT u.codigo, r.piezas, r.traspaso_id IS NOT NULL AS viajando FROM reservas r
				 JOIN ubicaciones u ON u.id = r.ubicacion_id WHERE r.variante_id = $1 AND r.estado = 'activa'`,
				[variante],
			);
		const despacho = await despachado([traspaso.id]);
		expect(await dondeEsta()).toEqual([{ codigo: "TRA", piezas: 5, viajando: true }]);
		await recibir(despacho, { modo: "completo" });
		expect(await dondeEsta()).toEqual([{ codigo: "BOD", piezas: 5, viajando: false }]);
	});

	it("una tienda sin caja: Aduana confirma con la firma; lo que llegó sale de la fábrica y lo que faltó se queda en Tránsito", async () => {
		const traspaso = await traspasoEnAduana(servidor, "T1");
		const despacho = await despachado([traspaso.id]);
		expect((await recibir(despacho, { modo: "completo" })).cuerpo).toMatchObject({ codigo: "otro_destino" });
		const lineas = await consultar("SELECT id FROM traspaso_lineas WHERE traspaso_id = $1 ORDER BY renglon", [
			traspaso.id,
		]);
		const entregar = async (datos: Record<string, unknown>) =>
			mandarAccion(
				servidor,
				"inventario.entregar_a_tienda_sin_caja",
				{ datos: { despacho_id: despacho, ...datos }, version: await versionDeDespacho(servidor, despacho) },
				"aduana",
			);
		expect((await entregar({ modo: "completo", recibio_nombre: "Al" })).cuerpo).toMatchObject({
			campos: { recibio_nombre: "Escribe quién recibió" },
		});
		const respuesta = await entregar({
			modo: "con_diferencias",
			recibio_nombre: "Marta Ruiz",
			renglones: [
				{ traspaso_linea_id: lineas[0]?.id, piezas: 5 },
				{ traspaso_linea_id: lineas[1]?.id, piezas: 2 },
			],
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				/^D-\d{4} entregado en Tienda 1: 7 piezas\. Faltaron 1: queda por aclarar a cargo de Aduana$/,
			),
		});
		expect(await piezas(traspaso.variantes)).toEqual([{ codigo: "TRA", piezas: 1 }]);
		expect(await consultar("SELECT estado, recibio_nombre FROM despachos WHERE id = $1", [despacho])).toEqual([
			{ estado: "con_diferencia", recibio_nombre: "Marta Ruiz" },
		]);
	});

	it("las etiquetas: solo de un lote, un reproceso o los rollos de un proveedor; en PDF quedan anotadas en el traspaso y sus rollos", async () => {
		const traspaso = await traspasoEnAduana(servidor, "BOD");
		const etiquetas = async (traspasoId: string, destino: "pdf" | "impresora") => {
			const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM traspasos WHERE id = $1", [
				traspasoId,
			]);
			return mandarAccion(
				servidor,
				"inventario.marcar_etiquetas_impresas",
				{ datos: { traspaso_id: traspasoId, destino }, version: rows[0]?.v },
				"aduana",
			);
		};
		expect((await etiquetas(traspaso.id, "pdf")).cuerpo).toMatchObject({
			codigo: "sin_etiquetas",
			mensaje: `${traspaso.folio} no lleva etiquetas.`,
		});
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirDePrueba(servidor, orden, [{ metros: "100", partida: "A" }]);
		const { traspaso_id: aDeLaOrden } = z.object({ traspaso_id: z.uuid() }).parse(recibida.cuerpo.resultado);
		expect((await etiquetas(aDeLaOrden, "pdf")).cuerpo.resultado).toMatchObject({
			pdf_ruta: `/v1/etiquetas/traspaso/${aDeLaOrden}?formato=pdf`,
		});
		expect(
			await consultar(
				`SELECT t.etiquetas_impresas_en IS NOT NULL AS traspaso, bool_and(r.etiqueta_impresa_en IS NOT NULL) AS rollos
				 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id JOIN rollos r ON r.id = l.rollo_id
				 WHERE t.id = $1 GROUP BY t.id`,
				[aDeLaOrden],
			),
		).toEqual([{ traspaso: true, rollos: true }]);
	});
});
