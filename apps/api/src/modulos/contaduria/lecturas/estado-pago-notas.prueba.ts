/**
 * Prueba de `contaduria.estado_pago_notas` y `contaduria.saldo_por_cobrar_de_cliente`: Ventas ve el estado de pago de
 * sus notas y si el cliente debe, nunca un monto; Contaduría ve los saldos.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { clienteDePrueba, notaEntregadaDePrueba, pagarDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Ventas nunca recibe un monto de las cuentas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee como lo hace la cuenta que se diga. */
	function leer(quien: string, lectura: string, datos: unknown) {
		const cuenta = quienesDePrueba[quien];
		if (cuenta === undefined) throw new Error(`no hay cuenta de prueba ${quien}`);
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => contexto.lectura(`contaduria.${lectura}`, datos),
			{ quien: cuenta },
		);
	}

	it("sin pagar, pagada en parte y pagada; el saldo solo a Contaduría; una nota sin entregar no sale", async () => {
		const cliente = await clienteDePrueba(servidor);
		const sinPagar = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		const enParte = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		const pagada = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		await pagarDePrueba(servidor, cliente, enParte, 40_000);
		await pagarDePrueba(servidor, cliente, pagada, 100_000);
		const notas = { nota_entrega_ids: [sinPagar.notaId, enParte.notaId, pagada.notaId, crypto.randomUUID()] };
		const deVentas = (await leer("ventas", "estado_pago_notas", notas)) as { notas: unknown[] };
		expect(new Set(deVentas.notas)).toEqual(
			new Set([
				{ nota_entrega_id: sinPagar.notaId, estado: "sin_pagar" },
				{ nota_entrega_id: enParte.notaId, estado: "pagada_en_parte" },
				{ nota_entrega_id: pagada.notaId, estado: "pagada" },
			]),
		);
		const deContaduria = (await leer("contaduria", "estado_pago_notas", notas)) as { notas: unknown[] };
		expect(deContaduria.notas).toContainEqual({
			nota_entrega_id: enParte.notaId,
			estado: "pagada_en_parte",
			saldo_centavos: 60_000,
		});
		expect(await leer("ventas", "saldo_por_cobrar_de_cliente", { cliente_id: cliente.clienteId })).toEqual({
			con_saldo: true,
		});
		expect(await leer("contaduria", "saldo_por_cobrar_de_cliente", { cliente_id: cliente.clienteId })).toEqual({
			con_saldo: true,
			saldo_centavos: 160_000,
		});
		const sinDeuda = await clienteDePrueba(servidor);
		expect(await leer("ventas", "saldo_por_cobrar_de_cliente", { cliente_id: sinDeuda.clienteId })).toEqual({
			con_saldo: false,
		});
	});
});
