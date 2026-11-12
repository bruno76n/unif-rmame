/**
 * Prueba de `inventario.recibir_en_aduana`: lo que llegó pasa a Aduana, lo que no llegó se queda en su tramo a cargo de
 * quien lo mandó, y una devolución de cliente que no llegó no deja nada.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 3)
 * Fase 14 · «Recibir con diferencias en aduana o un despacho abre una DF- por renglón, a cargo de quien lo mandó»
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import {
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Recibir lo que viene en camino deja lo que no llegó en su tramo y una devolución de cliente que no llegó no deja nada", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Un pedido con 3 piezas reservadas en Bodega, ya surtido a aduana: su A- en camino. */
	async function surtido() {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = uuidv7();
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 3);
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
			 VALUES ($1, $2, $3, 3, 'pedido_externo', $4, 'activa')`,
			[uuidv7(), ubicacion.BOD, variante, pedido],
		);
		await mandarAccion(
			servidor,
			"inventario.surtir_a_aduana",
			{ datos: { documento_tipo: "pedido_externo", documento_id: pedido } },
			"bodega",
		);
		const { rows } = await servidor.base.dueno.query(
			"SELECT t.id, t.folio, l.id AS linea FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.pedido_id = $1",
			[pedido],
		);
		return { variante, pedido, id: String(rows[0]?.id), folio: String(rows[0]?.folio), linea: String(rows[0]?.linea) };
	}

	/** Aduana recibe un traspaso. */
	async function recibir(traspasoId: string, datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{ datos: { traspaso_id: traspasoId, ...datos }, version: await versionDeTraspaso(servidor, traspasoId) },
			"aduana",
		);
	}

	/** Las piezas de una variante por ubicación. */
	async function piezas(variante: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT u.codigo, e.piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE e.variante_id = $1 AND e.piezas <> 0 ORDER BY u.codigo`,
			[variante],
		);
		return rows;
	}

	it("completo: todo pasa a Aduana, el traspaso queda en aduana con su recepción, y la reserva viaja con él", async () => {
		const a = await surtido();
		const respuesta = await recibir(a.id, { modo: "completo" });
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: `${a.folio} recibido en aduana: 3 piezas` });
		expect(await piezas(a.variante)).toEqual([{ codigo: "ADU", piezas: 3 }]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, recepcion_aduana_id IS NOT NULL AS con_recepcion, llego_aduana_en IS NOT NULL AS llego FROM traspasos WHERE id = $1",
			[a.id],
		);
		expect(rows).toEqual([{ estado: "en_aduana", con_recepcion: true, llego: true }]);
		const { rows: reserva } = await servidor.base.dueno.query(
			"SELECT u.codigo FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id WHERE r.pedido_id = $1 AND r.estado = 'activa'",
			[a.pedido],
		);
		expect(reserva).toEqual([{ codigo: "ADU" }]);
		expect((await recibir(a.id, { modo: "completo" })).cuerpo).toMatchObject({
			codigo: "no_por_recibir",
			mensaje: `${a.folio} ya se recibió`,
		});
	});

	it("con una versión vieja no recibe: 409, y todo sigue en camino", async () => {
		const { id, variante } = await surtido();
		const vieja = await versionDeTraspaso(servidor, id);
		await servidor.base.dueno.query("UPDATE traspasos SET version = version + 1 WHERE id = $1", [id]);
		const respuesta = await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{ datos: { traspaso_id: id, modo: "completo" }, version: vieja },
			"aduana",
		);
		expect(respuesta.estado).toBe(409);
		expect(await piezas(variante)).toEqual([{ codigo: expect.any(String), piezas: 3 }]);
		expect(await servidor.base.dueno.query("SELECT estado FROM traspasos WHERE id = $1", [id])).toMatchObject({
			rows: [{ estado: "en_camino_aduana" }],
		});
	});

	it("con diferencias: pide cada renglón; lo que no llegó se queda En camino a aduana, a cargo de quien lo mandó", async () => {
		const a = await surtido();
		expect((await recibir(a.id, { modo: "con_diferencias", renglones: [] })).cuerpo).toMatchObject({
			codigo: "falta_renglon",
		});
		const respuesta = await recibir(a.id, {
			modo: "con_diferencias",
			renglones: [{ traspaso_linea_id: a.linea, piezas: 2 }],
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `${a.folio} recibido en aduana: 2 piezas. Faltaron 1: queda por aclarar a cargo de Bodega`,
		});
		expect(await piezas(a.variante)).toEqual([
			{ codigo: "ADU", piezas: 2 },
			{ codigo: "ECA", piezas: 1 },
		]);
		// Fase 14: su DF- de recepción, en En camino a aduana, a cargo de Bodega, con su renglón y por aclarar.
		const { rows } = await servidor.base.dueno.query(
			`SELECT d.piezas, d.sistema_decia, d.estado, d.traspaso_linea_id, u.codigo AS hueco, c.codigo AS a_cargo, d.descripcion
			 FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id JOIN ubicaciones c ON c.id = d.a_cargo_ubicacion_id
			 WHERE d.traspaso_id = $1`,
			[a.id],
		);
		expect(rows).toEqual([
			{
				piezas: -1,
				sistema_decia: 3,
				estado: "por_aclarar",
				traspaso_linea_id: a.linea,
				hueco: "ECA",
				a_cargo: "BOD",
				descripcion: `Bodega mandó 3 en ${a.folio} y Aduana recibió 2`,
			},
		]);
	});

	it("una devolución de cliente: lo que llegó entra a Aduana de Fuera; lo que no llegó nunca fue inventario y no deja nada", async () => {
		const [buena = "", perdida = ""] = await variantesLibres(servidor, 2);
		const devolucion = await nuevoTraspaso(servidor, {
			tipo: "devolucion_cliente_externo",
			estado: "esperado",
			origen: { externo: "cliente_externo" },
			destino: { ubicacionId: ubicacion.BOD ?? "" },
			renglones: [
				{ varianteId: buena, piezas: 2 },
				{ varianteId: perdida, piezas: 1 },
			],
		});
		const { rows: lineas } = await servidor.base.dueno.query(
			"SELECT id FROM traspaso_lineas WHERE traspaso_id = $1 ORDER BY renglon",
			[devolucion.traspasoId],
		);
		const respuesta = await recibir(devolucion.traspasoId, {
			modo: "con_diferencias",
			renglones: [
				{ traspaso_linea_id: lineas[0]?.id, piezas: 2 },
				{ traspaso_linea_id: lineas[1]?.id, piezas: 0 },
			],
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: `${devolucion.folio} recibido en aduana: 2 piezas` });
		expect(await piezas(buena)).toEqual([{ codigo: "ADU", piezas: 2 }]);
		expect(await piezas(perdida)).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT r.tipo, m.tipo AS movimiento FROM recepciones r JOIN movimientos m ON m.id = r.movimiento_id WHERE r.traspaso_id = $1",
			[devolucion.traspasoId],
		);
		expect(rows).toEqual([{ tipo: "aduana_devolucion", movimiento: "devolucion_cliente_externo" }]);
	});
});
