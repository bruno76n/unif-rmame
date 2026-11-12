/**
 * Prueba de `contaduria.aplicar_anticipo_a_nota` y de la cuenta que nace con su anticipo: el disponible nunca queda
 * negativo, aun con dos notas al mismo tiempo, y la nota llega a cobranza con el anticipo ya descontado.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	anticipoRecibidoDePrueba,
	clienteDePrueba,
	internaDeContaduria,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("El anticipo disponible nunca queda negativo, aun con dos notas al mismo tiempo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lo que Ventas lee del anticipo de un pedido. */
	function anticipoDe(pedidoId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("contaduria.anticipo_del_pedido", { pedido_id: pedidoId }),
		);
	}

	it("Zamora deja $10,000 al PE-; la NV- de $18,400 descuenta $5,000: quedan $5,000 y la cuenta nace por $13,400", async () => {
		const zamora = await clienteDePrueba(servidor);
		const { pedidoId } = await anticipoRecibidoDePrueba(servidor, zamora, 1_000_000);
		const { notaId: nota } = await notaDePrueba(servidor, { pedidoId });
		const aplicado = await internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
			pedido_id: pedidoId,
			cliente_id: zamora.clienteId,
			nota_entrega_id: nota,
			monto_centavos: 500_000,
		});
		expect(aplicado).toEqual({ anticipo_id: expect.any(String) });
		expect(await anticipoDe(pedidoId)).toEqual({
			recibido_centavos: 1_000_000,
			aplicado_centavos: 500_000,
			a_favor_centavos: 0,
			disponible_centavos: 500_000,
		});
		const cuenta = await internaDeContaduria(servidor, "crear_cuenta_por_cobrar", {
			nota_entrega_id: nota,
			pedido_id: pedidoId,
			cliente_id: zamora.clienteId,
			fecha_entrega: "2026-11-09",
			dias_credito: 15,
			total_nota_centavos: 1_840_000,
		});
		expect(cuenta).toMatchObject({ importe_centavos: 1_340_000, vence: "2026-11-24" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT anticipo_aplicado_centavos::int AS anticipo, saldo_centavos::int AS saldo FROM cuentas_por_cobrar WHERE nota_entrega_id = $1",
			[nota],
		);
		expect(rows).toEqual([{ anticipo: 500_000, saldo: 1_340_000 }]);
	});

	it("de más que el disponible: `anticipo_insuficiente` con el folio del pedido", async () => {
		const cliente = await clienteDePrueba(servidor);
		const { pedidoId } = await anticipoRecibidoDePrueba(servidor, cliente, 300_000);
		expect(
			await internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
				pedido_id: pedidoId,
				cliente_id: cliente.clienteId,
				nota_entrega_id: (await notaDePrueba(servidor, { pedidoId })).notaId,
				monto_centavos: 300_100,
			}),
		).toMatchObject({
			codigo: "anticipo_insuficiente",
			mensaje: expect.stringMatching(/^El pedido PE-P[0-9a-f]{8} solo tiene \$3,000 de anticipo\.$/),
		});
	});

	it("dos notas a la vez que juntas pasan del disponible: entra una y el disponible no queda negativo", async () => {
		const cliente = await clienteDePrueba(servidor);
		const { pedidoId } = await anticipoRecibidoDePrueba(servidor, cliente, 1_000_000);
		const aplicar = async () =>
			internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
				pedido_id: pedidoId,
				cliente_id: cliente.clienteId,
				nota_entrega_id: (await notaDePrueba(servidor, { pedidoId })).notaId,
				monto_centavos: 600_000,
			});
		const resultados = await Promise.all([aplicar(), aplicar()]);
		expect(resultados).toContainEqual({ anticipo_id: expect.any(String) });
		expect(resultados).toContainEqual(expect.objectContaining({ codigo: "anticipo_insuficiente" }));
		expect(await anticipoDe(pedidoId)).toMatchObject({ aplicado_centavos: 600_000, disponible_centavos: 400_000 });
	});
});
