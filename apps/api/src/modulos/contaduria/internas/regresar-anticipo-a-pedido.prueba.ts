/**
 * Prueba de `contaduria.regresar_anticipo_a_pedido`: cancelar una nota por despachar regresa al pedido lo que se le
 * descontó, una sola vez; sin anticipo aplicado no hace nada.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	anticipoRecibidoDePrueba,
	clienteDePrueba,
	internaDeContaduria,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Regresar el anticipo de una nota sigue sus reglas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la nota que se cancela regresa sus $5,000 al pedido, con su `aplicado`; otra vez, nada", async () => {
		const cliente = await clienteDePrueba(servidor);
		const { pedidoId } = await anticipoRecibidoDePrueba(servidor, cliente, 1_000_000);
		const { notaId: nota } = await notaDePrueba(servidor, { pedidoId });
		const { anticipo_id: aplicadoId } = (await internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
			pedido_id: pedidoId,
			cliente_id: cliente.clienteId,
			nota_entrega_id: nota,
			monto_centavos: 500_000,
		})) as { anticipo_id: string };
		expect(await internaDeContaduria(servidor, "regresar_anticipo_a_pedido", { nota_entrega_id: nota })).toEqual({
			regresado_centavos: 500_000,
		});
		expect(await internaDeContaduria(servidor, "regresar_anticipo_a_pedido", { nota_entrega_id: nota })).toEqual({
			regresado_centavos: 0,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, monto_centavos::int AS monto, anticipo_aplicado_id FROM anticipos WHERE pedido_id = $1 AND tipo = 'regresado'",
			[pedidoId],
		);
		expect(rows).toEqual([{ tipo: "regresado", monto: 500_000, anticipo_aplicado_id: aplicadoId }]);
	});

	it("una nota sin anticipo aplicado no hace nada", async () => {
		expect(
			await internaDeContaduria(servidor, "regresar_anticipo_a_pedido", {
				nota_entrega_id: (await notaDePrueba(servidor)).notaId,
			}),
		).toEqual({
			regresado_centavos: 0,
		});
	});
});
