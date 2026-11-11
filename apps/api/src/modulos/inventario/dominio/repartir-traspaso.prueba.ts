/**
 * Prueba de `repartirTraspaso`: nunca pasa de lo que queda en aduana, no mueve existencia, el hijo nace con su
 * folio y la antigüedad del padre, y el padre queda `repartido` cuando no le queda nada.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 2)
 *
 * Que las reservas pasen al hijo se prueba en la parte 3, con las reservas.
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevoTraspaso, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { type PedidoDeReparto, repartirTraspaso } from "./traspasos.ts";

describe("Repartir nunca pasa de lo que queda en aduana, no mueve existencia y deja al padre `repartido` cuando no le queda nada", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let variante: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		variante = (await servidor.base.dueno.query("SELECT id FROM variantes LIMIT 1")).rows[0]?.id;
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Reparte, guardando su evento como el corredor. */
	function repartir(pedido: PedidoDeReparto) {
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => repartirTraspaso(contexto, pedido),
			{ guardarEventos: true },
		);
	}

	/** Un lote de un pedido externo recién recibido en aduana: 10 piezas y 3.5 m de tela. */
	async function loteEnAduana() {
		const lote = await nuevoTraspaso(servidor, {
			tipo: "lote_cliente",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.TAL ?? "" },
			destino: { externo: "cliente_externo" },
			renglones: [
				{ varianteId: variante, piezas: 10 },
				{ materialId: uuidv7(), cantidad: "3.500" },
			],
			llegoAduanaEn: "2026-11-09T15:00:00Z",
			fechaSalidaEsperada: "2026-11-20",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM traspaso_lineas WHERE traspaso_id = $1 ORDER BY renglon",
			[lote.traspasoId],
		);
		return { ...lote, prenda: rows[0]?.id, tela: rows[1]?.id };
	}

	/** Lo repartido y el estado del padre. */
	async function padre(traspasoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.estado, t.terminado_en IS NOT NULL AS terminado, l.piezas_repartidas, l.cantidad_repartida
			 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.id = $1 ORDER BY l.renglon`,
			[traspasoId],
		);
		return rows;
	}

	it("reparte una parte a un hijo `{padre}-1` en aduana, con el origen y la antigüedad del padre, sin mover nada", async () => {
		const lote = await loteEnAduana();
		const movimientosAntes = (await servidor.base.dueno.query("SELECT count(*)::int AS n FROM movimientos")).rows[0]?.n;
		const nota = uuidv7();
		const hijo = await repartir({
			padreId: lote.traspasoId,
			renglones: [
				{ lineaId: lote.prenda, piezas: 4 },
				{ lineaId: lote.tela, cantidad: "1.250" },
			],
			hijo: { tipo: "nota_entrega", destino: { externo: "cliente_externo" }, referencias: { notaEntregaId: nota } },
		});
		expect(hijo).toMatchObject({ folio: `${lote.folio}-1`, padreRepartido: false });
		expect(hijo.lineasDelHijo.size).toBe(2);
		expect(await padre(lote.traspasoId)).toEqual([
			{ estado: "en_aduana", terminado: false, piezas_repartidas: 4, cantidad_repartida: "0.000" },
			{ estado: "en_aduana", terminado: false, piezas_repartidas: 0, cantidad_repartida: "1.250" },
		]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.estado, t.tipo, t.origen_ubicacion_id, t.traspaso_padre_id, t.nota_entrega_id, t.llego_aduana_en::text AS llego,
				t.fecha_salida_esperada::text AS sale, l.piezas_enviadas, l.piezas_recibidas_aduana, l.cantidad_enviada, l.cantidad_recibida_aduana
			 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.id = $1 ORDER BY l.renglon`,
			[hijo.traspasoId],
		);
		expect(rows).toEqual([
			{
				estado: "en_aduana",
				tipo: "nota_entrega",
				origen_ubicacion_id: ubicacion.TAL,
				traspaso_padre_id: lote.traspasoId,
				nota_entrega_id: nota,
				llego: "2026-11-09 15:00:00+00",
				sale: "2026-11-20",
				piezas_enviadas: 4,
				piezas_recibidas_aduana: 4,
				cantidad_enviada: null,
				cantidad_recibida_aduana: null,
			},
			expect.objectContaining({ cantidad_enviada: "1.250", cantidad_recibida_aduana: "1.250", piezas_enviadas: null }),
		]);
		// No es un movimiento.
		expect((await servidor.base.dueno.query("SELECT count(*)::int AS n FROM movimientos")).rows[0]?.n).toBe(
			movimientosAntes,
		);
		// Su evento.
		const { rows: eventos } = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'traspaso.repartido' AND entidad_id = $1",
			[hijo.traspasoId],
		);
		expect(eventos).toEqual([
			{ datos: { padre_id: lote.traspasoId, hijo_id: hijo.traspasoId, padre_repartido: false } },
		]);
		// La partida en aduana del padre ya solo tiene lo que queda.
		const { rows: partida } = await servidor.base.dueno.query(
			"SELECT piezas, cantidad FROM partidas_aduana WHERE traspaso_id = $1 ORDER BY renglon",
			[lote.traspasoId],
		);
		expect(partida).toEqual([
			{ piezas: 6, cantidad: null },
			{ piezas: null, cantidad: "2.250" },
		]);
	});

	it("nunca pasa de lo que queda; repartir lo que queda deja al padre `repartido` y el siguiente hijo es `-2`", async () => {
		const lote = await loteEnAduana();
		await repartir({
			padreId: lote.traspasoId,
			renglones: [{ lineaId: lote.prenda, piezas: 7 }],
			hijo: { tipo: "regresa", destino: { ubicacionId: ubicacion.BOD ?? "" } },
		});
		await expect(
			repartir({
				padreId: lote.traspasoId,
				renglones: [{ lineaId: lote.prenda, piezas: 4 }],
				hijo: { tipo: "regresa", destino: { ubicacionId: ubicacion.BOD ?? "" } },
			}),
		).rejects.toThrow("se reparte 4 y quedan 3");
		await expect(
			repartir({
				padreId: lote.traspasoId,
				renglones: [{ lineaId: lote.tela, cantidad: "3.501" }],
				hijo: { tipo: "regresa", destino: { ubicacionId: ubicacion.BOD ?? "" } },
			}),
		).rejects.toThrow("se reparte 3501 y quedan 3500");
		const ultimo = await repartir({
			padreId: lote.traspasoId,
			renglones: [
				{ lineaId: lote.prenda, piezas: 3 },
				{ lineaId: lote.tela, cantidad: "3.500" },
			],
			hijo: { tipo: "lote_temporada", destino: { ubicacionId: ubicacion.BOD ?? "" } },
		});
		expect(ultimo).toMatchObject({ folio: `${lote.folio}-2`, padreRepartido: true });
		expect(await padre(lote.traspasoId)).toEqual([
			{ estado: "repartido", terminado: true, piezas_repartidas: 10, cantidad_repartida: "0.000" },
			{ estado: "repartido", terminado: true, piezas_repartidas: 0, cantidad_repartida: "3.500" },
		]);
		// Un padre que ya no está en aduana no se reparte.
		await expect(
			repartir({
				padreId: lote.traspasoId,
				renglones: [{ lineaId: lote.prenda, piezas: 1 }],
				hijo: { tipo: "regresa", destino: { ubicacionId: ubicacion.BOD ?? "" } },
			}),
		).rejects.toThrow("no está en aduana: repartido");
	});
});
