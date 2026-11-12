/**
 * Prueba de `contaduria.pasar_anticipo_a_favor`: el disponible de un pedido cancelado o entregado pasa a favor del
 * cliente; sin disponible, nada.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	anticipoRecibidoDePrueba,
	clienteDePrueba,
	internaDeContaduria,
	saldoAFavorDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Pasar el anticipo a favor sigue sus reglas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un pedido entregado con $5,000 sin usar: pasan a favor de Zamora con su `entra`; otra vez, nada", async () => {
		const zamora = await clienteDePrueba(servidor);
		const { pedidoId } = await anticipoRecibidoDePrueba(servidor, zamora, 1_000_000);
		await internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
			pedido_id: pedidoId,
			cliente_id: zamora.clienteId,
			nota_entrega_id: uuidv7(),
			monto_centavos: 500_000,
		});
		const pasar = () =>
			internaDeContaduria(servidor, "pasar_anticipo_a_favor", { pedido_id: pedidoId, causa: "pedido_entregado" });
		expect(await pasar()).toEqual({ a_favor_centavos: 500_000 });
		expect(await pasar()).toEqual({ a_favor_centavos: 0 });
		expect(await saldoAFavorDePrueba(servidor, zamora.clienteId)).toBe(500_000);
		const { rows } = await servidor.base.dueno.query(
			`SELECT origen, pedido_id = $2 AS del_pedido, tercero_id = $3 AS del_tercero FROM saldo_favor_movimientos
			 WHERE cliente_id = $1`,
			[zamora.clienteId, pedidoId, zamora.terceroId],
		);
		expect(rows).toEqual([{ origen: "anticipo_pedido", del_pedido: true, del_tercero: true }]);
	});

	it("un pedido cancelado sin anticipo no hace nada", async () => {
		expect(
			await internaDeContaduria(servidor, "pasar_anticipo_a_favor", {
				pedido_id: await pedidoDePrueba(servidor),
				causa: "pedido_cancelado",
			}),
		).toEqual({ a_favor_centavos: 0 });
	});
});
