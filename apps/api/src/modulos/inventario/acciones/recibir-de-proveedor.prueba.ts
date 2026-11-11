/**
 * Prueba de `inventario.recibir_de_proveedor`: rollos con sus metros, su partida (reusada) y el costo de su línea, el
 * A- en aduana con destino Bodega y el movimiento de Fuera a Aduana, en una transacción; solo una orden enviada o
 * recibida en parte se recibe; lo de más pide autorización; Aduana nunca recibe un costo.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { ordenEnEstado } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Recibir una orden crea sus rollos, su partida (reusada), el costo de su línea, el A- en aduana con destino Bodega y el movimiento de Fuera a Aduana, en una transacción; Aduana nunca recibe un costo", () => {
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

	it("nacen los rollos con sus metros, sus partidas y el costo de su línea; el A- y el movimiento; la orden queda recibida", async () => {
		const orden = await ordenParaRecibir(servidor);
		const respuesta = await recibirDePrueba(
			servidor,
			orden,
			[
				{ metros: "50.5", partida: "p-2224" },
				{ metros: "49.5", partida: "P-2231" },
			],
			500,
		);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo).toMatchObject({
			resultado: {
				folio: expect.stringMatching(/^A-\d+$/),
				rollos: [{ folio: expect.stringMatching(/^R-\d{4}$/) }, { folio: expect.stringMatching(/^R-\d{4}$/) }],
				mensaje: `${orden.folio} recibida: queda en aduana hasta que bodega la confirme`,
			},
			avisos: ["Llegan 2 partidas distintas"],
		});
		// Aduana nunca recibe un costo.
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/costo|precio|centavos/);
		const { recepcion_id: recepcionId, traspaso_id: traspasoId } = z
			.object({ recepcion_id: z.uuid(), traspaso_id: z.uuid() })
			.parse(respuesta.cuerpo.resultado);
		expect(
			await consultar(
				`SELECT r.metros_iniciales AS metros, p.codigo_proveedor AS partida, p.folio LIKE 'P-%' AS con_folio,
				        r.costo_metro_centavos::int AS costo, r.estado
				 FROM rollos r JOIN partidas_tela p ON p.id = r.partida_tela_id WHERE r.recepcion_id = $1 ORDER BY r.folio`,
				[recepcionId],
			),
		).toEqual([
			{ metros: "50.500", partida: "P-2224", con_folio: true, costo: 7_800, estado: "disponible" },
			{ metros: "49.500", partida: "P-2231", con_folio: true, costo: 7_800, estado: "disponible" },
		]);
		expect(
			await consultar(
				`SELECT t.tipo, t.estado, t.origen_externo, u.codigo AS destino, t.orden_compra_id, t.recepcion_aduana_id,
				        (SELECT count(*)::int FROM traspaso_lineas l WHERE l.traspaso_id = t.id) AS renglones
				 FROM traspasos t JOIN ubicaciones u ON u.id = t.destino_ubicacion_id WHERE t.id = $1`,
				[traspasoId],
			),
		).toEqual([
			{
				tipo: "material_proveedor",
				estado: "en_aduana",
				origen_externo: "proveedor",
				destino: "BOD",
				orden_compra_id: orden.id,
				recepcion_aduana_id: recepcionId,
				renglones: 3,
			},
		]);
		// El movimiento de Fuera a Aduana, ligado a la recepción; la existencia en aduana por rollo y del avío.
		expect(
			await consultar(
				`SELECT m.tipo, count(l.*)::int AS renglones, bool_and(l.origen_ubicacion_id IS NULL) AS de_fuera
				 FROM recepciones r JOIN movimientos m ON m.id = r.movimiento_id JOIN movimiento_lineas l ON l.movimiento_id = m.id
				 WHERE r.id = $1 GROUP BY m.tipo`,
				[recepcionId],
			),
		).toEqual([{ tipo: "recepcion_proveedor", renglones: 3, de_fuera: true }]);
		expect(
			await consultar(
				`SELECT sum(e.cantidad)::text AS hay FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'ADU' AND e.material_id = ANY($1::uuid[]) GROUP BY e.material_id ORDER BY 1`,
				[[orden.tela, orden.avio]],
			),
		).toEqual([{ hay: "100.000" }, { hay: "500.000" }]);
		// El papel: lo esperado (lo que faltaba) en el primer renglón de cada línea.
		expect(
			await consultar(
				"SELECT cantidad_esperada AS esperada, cantidad_contada AS contada FROM recepcion_lineas WHERE recepcion_id = $1 ORDER BY renglon",
				[recepcionId],
			),
		).toEqual([
			{ esperada: "100.000", contada: "50.500" },
			{ esperada: null, contada: "49.500" },
			{ esperada: "500.000", contada: "500.000" },
		]);
		expect(await consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id])).toEqual([
			{ estado: "recibida" },
		]);
	});

	it("en partes: queda recibida en parte, y la misma partida del mismo proveedor y material se reusa", async () => {
		const orden = await ordenParaRecibir(servidor);
		expect((await recibirDePrueba(servidor, orden, [{ metros: "60", partida: "L-77" }])).estado).toBe(200);
		expect(await consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id])).toEqual([
			{ estado: "recibida_en_parte" },
		]);
		expect((await recibirDePrueba(servidor, orden, [{ metros: "40", partida: "l-77" }], 500)).estado).toBe(200);
		expect(await consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id])).toEqual([
			{ estado: "recibida" },
		]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM partidas_tela WHERE material_id = $1", [orden.tela]),
		).toEqual([{ n: 1 }]);
	});

	it("dos recepciones de la misma orden a la vez, con la misma partida nueva: las dos entran y la partida nace una vez", async () => {
		const orden = await ordenParaRecibir(servidor);
		const [una, otra] = await Promise.all([
			recibirDePrueba(servidor, orden, [{ metros: "50", partida: "Z-1" }]),
			recibirDePrueba(servidor, orden, [{ metros: "50", partida: "Z-1" }]),
		]);
		expect([una.estado, otra.estado]).toEqual([200, 200]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM partidas_tela WHERE material_id = $1", [orden.tela]),
		).toEqual([{ n: 1 }]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM recepciones WHERE orden_compra_id = $1", [orden.id]),
		).toEqual([{ n: 2 }]);
	});

	it("una orden que no está enviada ni recibida en parte no se recibe; una enviada sí, aunque llegue antes; los datos que faltan", async () => {
		const borrador = await ordenParaRecibir(servidor);
		await servidor.base.dueno.query(
			"UPDATE ordenes_compra SET estado = 'borrador', enviada_en = NULL, dias_credito = NULL WHERE id = $1",
			[borrador.id],
		);
		expect((await recibirDePrueba(servidor, borrador, [{ metros: "10", partida: "A" }])).cuerpo).toMatchObject({
			codigo: "orden_no_recibible",
			mensaje: `${borrador.folio} no se puede recibir: está en borrador`,
		});
		const cancelada = await ordenParaRecibir(servidor);
		await ordenEnEstado(servidor, cancelada.id, "cancelada");
		expect((await recibirDePrueba(servidor, cancelada, [], 10)).cuerpo).toMatchObject({
			codigo: "orden_no_recibible",
			mensaje: `${cancelada.folio} no se puede recibir: está cancelada`,
		});
		// Una enviada que promete llegar en 100 días se recibe hoy.
		const lejana = await ordenParaRecibir(servidor);
		await servidor.base.dueno.query("UPDATE ordenes_compra SET fecha_prometida = current_date + 100 WHERE id = $1", [
			lejana.id,
		]);
		const otra = await ordenParaRecibir(servidor);
		expect((await recibirDePrueba(servidor, { ...lejana, lineaAvio: otra.lineaAvio }, [], 10)).cuerpo).toMatchObject({
			codigo: "linea_ajena",
			mensaje: `Ese material no es de ${lejana.folio}.`,
		});
		expect((await recibirDePrueba(servidor, lejana, [], 2.5)).cuerpo).toMatchObject({
			campos: { "materiales.0.cantidad": "Número entero" },
		});
		expect((await recibirDePrueba(servidor, { ...lejana }, [])).cuerpo).toMatchObject({ error: "validacion" });
		expect((await recibirDePrueba(servidor, lejana, [{ metros: "0", partida: "A" }])).cuerpo).toMatchObject({
			campos: { "materiales.0.rollos.0.metros": "Metros" },
		});
		expect((await recibirDePrueba(servidor, lejana, [{ metros: "10.25", partida: "A" }])).cuerpo).toMatchObject({
			campos: { "materiales.0.rollos.0.metros": "Metros" },
		});
		expect((await recibirDePrueba(servidor, lejana, [{ metros: "10", partida: "A" }], 10)).estado).toBe(200);
		// Nada quedó de los intentos que fallaron.
		expect(
			await consultar("SELECT count(*)::int AS n FROM recepciones WHERE orden_compra_id = $1", [lejana.id]),
		).toEqual([{ n: 1 }]);
	});

	it("lo de más pide una autorización por material, por todo lo que pasa de lo pedido y sin repetir lo pedido; en la tela, solo arriba del 3 %; y cuenta en la existencia", async () => {
		const orden = await ordenParaRecibir(servidor);
		const autorizaciones = () =>
			consultar(
				"SELECT cantidad, unidad, resumen FROM autorizaciones WHERE tipo = 'recepcion_de_mas' AND orden_compra_linea_id = ANY($1::uuid[]) ORDER BY creado_en",
				[[orden.lineaTela, orden.lineaAvio]],
			);
		// 102 m de 100: dentro del 3 %, no pide nada.
		await recibirDePrueba(servidor, orden, [{ metros: "102", partida: "A" }]);
		expect(await autorizaciones()).toEqual([]);
		// 5 m más: 107 de 100 pasa del 3 %; pide los 7 m (no había nada pedido de la tela).
		await recibirDePrueba(servidor, orden, [{ metros: "5", partida: "A" }]);
		// 3 m más: pide solo los 3 nuevos.
		await recibirDePrueba(servidor, orden, [{ metros: "3", partida: "A" }]);
		// El avío: 520 de 500, sin margen, pide los 20.
		const avio = await recibirDePrueba(servidor, orden, [], 520);
		expect(z.object({ mensaje: z.string() }).parse(avio.cuerpo.resultado).mensaje).toMatch(
			new RegExp(
				`^${orden.folio} recibida: queda en aduana hasta que bodega la confirme\\. Llegó de más: 20 pza de Botón .+, espera autorización de Dirección$`,
			),
		);
		expect(await autorizaciones()).toEqual([
			{
				cantidad: "7.000",
				unidad: "m",
				resumen: expect.stringMatching(new RegExp(`^Recibir 7 m de más en ${orden.folio} de `)),
			},
			{ cantidad: "3.000", unidad: "m", resumen: expect.stringMatching(/^Recibir 3 m de más/) },
			{ cantidad: "20.000", unidad: "pza", resumen: expect.stringMatching(/^Recibir 20 pza de más/) },
		]);
		// Todo cuenta en la existencia mientras Dirección decide.
		expect(
			await consultar(
				`SELECT sum(e.cantidad)::text AS hay FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE u.codigo = 'ADU' AND e.material_id = $1`,
				[orden.tela],
			),
		).toEqual([{ hay: "110.000" }]);
	});
});
