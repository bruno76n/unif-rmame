/**
 * Prueba de `inventario.liberar_reservas` y `inventario.confirmar_pago_reserva`: liberar una parte deja el resto
 * en una reserva nueva; un documento cancelado reparte lo de aduana en un `regresa` a su origen; un pago que
 * llega tarde vuelve a apartar.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	llamarInterna,
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedidoLineaDePrueba } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("liberar reservas", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las reservas de un documento, con su estado. */
	async function reservasDe(columna: string, id: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT piezas, estado, motivo_fin, ubicacion_id, traspaso_id, transferida_a_reserva_id IS NOT NULL AS transferida
			 FROM reservas WHERE ${columna} = $1 ORDER BY creado_en, piezas`,
			[id],
		);
		return rows;
	}

	it("Liberar una parte deja el resto en una reserva nueva; las que ya no están activas se ignoran", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 10);
		const pedido = await pedidoDePrueba(servidor);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_externo",
			pedido_id: pedido,
			renglones: [{ variante_id: variante, piezas: 10 }],
		});
		const liberadas = await llamarInterna(servidor, "inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido,
			motivo_fin: "quitada_del_pedido",
			documento_cancelado: false,
			piezas: [{ variante_id: variante, piezas: 4 }],
		});
		expect(liberadas).toMatchObject({ reserva_ids: [expect.any(String)], regresa_ids: [] });
		const reservas = await reservasDe("pedido_id", pedido);
		// La original quedó transferida al resto; la parte de 4, liberada; el resto de 6, activo.
		expect(reservas.map((reserva) => [reserva.piezas, reserva.estado, reserva.motivo_fin])).toEqual([
			[10, "transferida", "quitada_del_pedido"],
			[4, "liberada", "quitada_del_pedido"],
			[6, "activa", null],
		]);
		// Liberar todo lo que queda; otra vez no hace nada.
		await llamarInterna(servidor, "inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido,
			motivo_fin: "documento_cancelado",
			documento_cancelado: true,
		});
		const otraVez = await llamarInterna(servidor, "inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido,
			motivo_fin: "documento_cancelado",
			documento_cancelado: true,
		});
		expect(otraVez).toEqual({ reserva_ids: [], regresa_ids: [], liberadas: [] });
		expect((await reservasDe("pedido_id", pedido)).filter((reserva) => reserva.estado === "activa")).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM eventos WHERE tipo = 'reserva.liberada'",
		);
		expect(rows[0]?.n).toBe(2);
	});

	it("Un documento cancelado reparte lo de aduana en un `regresa` a su origen (Bodega, si vino del Taller)", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = await pedidoDePrueba(servidor);
		// Un lote del pedido, recibido en aduana: sus 8 piezas están apartadas para el pedido.
		const lote = await nuevoTraspaso(servidor, {
			tipo: "lote_cliente",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.TAL ?? "" },
			destino: { externo: "cliente_externo" },
			renglones: [{ varianteId: variante, piezas: 8 }],
			referencias: { pedidoId: pedido },
		});
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 8);
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, traspaso_id, estado)
			 VALUES ($1, $2, $3, 8, 'pedido_externo', $4, $5, 'activa')`,
			[uuidv7(), ubicacion.ADU, variante, pedido, lote.traspasoId],
		);
		const liberadas = (await llamarInterna(servidor, "inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido,
			motivo_fin: "documento_cancelado",
			documento_cancelado: true,
		})) as { regresa_ids: string[] };
		expect(liberadas.regresa_ids).toHaveLength(1);
		const { rows } = await servidor.base.dueno.query(
			`SELECT h.folio, h.tipo, h.estado, h.destino_ubicacion_id, p.estado AS padre, l.piezas_enviadas
			 FROM traspasos h JOIN traspasos p ON p.id = h.traspaso_padre_id JOIN traspaso_lineas l ON l.traspaso_id = h.id
			 WHERE h.id = $1`,
			[liberadas.regresa_ids[0]],
		);
		expect(rows).toEqual([
			{
				folio: `${lote.folio}-1`,
				tipo: "regresa",
				estado: "en_aduana",
				destino_ubicacion_id: ubicacion.BOD,
				padre: "repartido",
				piezas_enviadas: 8,
			},
		]);
	});

	it("un pago que llega antes del vencimiento quita el vencimiento; uno que llega tarde vuelve a apartar", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 3);
		const enTiempo = await pedidoLineaDePrueba(servidor);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: enTiempo,
			renglones: [{ variante_id: variante, piezas: 1 }],
			pago_pendiente: true,
		});
		expect(await llamarInterna(servidor, "inventario.confirmar_pago_reserva", { pedido_linea_id: enTiempo })).toEqual({
			volvio_a_apartar: false,
			renglones: [],
			promesa: "sale_hoy",
		});
		const { rows } = await servidor.base.dueno.query("SELECT vence_en FROM reservas WHERE pedido_linea_id = $1", [
			enTiempo,
		]);
		expect(rows).toEqual([{ vence_en: null }]);
		// Otro W- con pago pendiente vence y se libera; el pago llega después.
		const tarde = await pedidoLineaDePrueba(servidor);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: tarde,
			renglones: [{ variante_id: variante, piezas: 2 }],
			pago_pendiente: true,
		});
		await llamarInterna(servidor, "inventario.liberar_reservas", {
			motivo: "pedido_linea",
			documento_id: tarde,
			motivo_fin: "vencio_pago",
			documento_cancelado: false,
		});
		const otraVez = await llamarInterna(servidor, "inventario.confirmar_pago_reserva", { pedido_linea_id: tarde });
		expect(otraVez).toMatchObject({
			volvio_a_apartar: true,
			renglones: [{ reservas: [{ ubicacion_id: ubicacion.BOD, piezas: 2 }] }],
		});
		expect((await reservasDe("pedido_linea_id", tarde)).map((reserva) => reserva.estado)).toEqual([
			"liberada",
			"activa",
		]);
	});

	it("si el pago se confirma mientras se liberan sus reservas, espera y vuelve a apartar: el W- pagado nunca se queda sin reserva", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 2);
		const pedido = await pedidoLineaDePrueba(servidor);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: pedido,
			renglones: [{ variante_id: variante, piezas: 1 }],
			pago_pendiente: true,
		});
		let soltar: () => void = () => undefined;
		const espera = new Promise<void>((resolver) => {
			soltar = resolver;
		});
		let libero: () => void = () => undefined;
		const yaLibero = new Promise<void>((resolver) => {
			libero = resolver;
		});
		// «Vencer reservas» libera y se queda abierta hasta que se le suelte.
		const vencer = enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
			await contexto.interna("inventario.liberar_reservas", {
				motivo: "pedido_linea",
				documento_id: pedido,
				motivo_fin: "vencio_pago",
				documento_cancelado: false,
			});
			libero();
			await espera;
		});
		await yaLibero;
		const confirmar = llamarInterna(servidor, "inventario.confirmar_pago_reserva", { pedido_linea_id: pedido });
		await new Promise((resolver) => setTimeout(resolver, 300));
		soltar();
		await vencer;
		expect(await confirmar).toMatchObject({ volvio_a_apartar: true });
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM reservas WHERE pedido_linea_id = $1 AND estado = 'activa'",
			[pedido],
		);
		expect(rows[0]?.n).toBe(1);
	});
});
