/**
 * Prueba de `contaduria.aplicar_nota_credito`: una nota de crédito baja la cuenta hasta su saldo, lo demás entra a
 * favor del cliente, y no se aplica dos veces.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	clienteDePrueba,
	cuentaComoQuedo,
	notaEntregadaDePrueba,
	pagarDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaCreditoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Una nota de crédito baja la cuenta hasta su saldo, lo demás entra a favor del cliente, y no se aplica dos veces", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Aplica una NC como lo hará el efecto de su autorización; regresa lo que regresó o el cuerpo de su error. */
	function aplicar(notaCreditoId: string, notaEntregaId: string, monto: number) {
		return enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) =>
				contexto.interna("contaduria.aplicar_nota_credito", {
					nota_credito_id: notaCreditoId,
					nota_entrega_id: notaEntregaId,
					monto_centavos: monto,
				}),
			{ guardarEventos: true },
		).catch((error: unknown) => (error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error)));
	}

	/** El saldo a favor vigente del cliente. */
	async function aFavor(clienteId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT tipo, origen, monto_centavos::int AS monto, nota_credito_id FROM saldo_favor_movimientos
			 WHERE cliente_id = $1 AND estado = 'vigente'`,
			[clienteId],
		);
		return rows;
	}

	it("una NC de $1,000 a una nota con $5,400: baja a $4,400, sin nada a favor", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 540_000 });
		const nc = await notaCreditoDePrueba(servidor, nota.notaId);
		expect(await aplicar(nc, nota.notaId, 100_000)).toEqual({ aplicado_centavos: 100_000, a_favor_centavos: 0 });
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 440_000, estado: "pagada_en_parte" });
		expect(await aFavor(cliente.clienteId)).toEqual([]);
	});

	it("una NC de $1,000 a una nota ya pagada: los $1,000 quedan a favor; a una con $300, baja $300 y $700 a favor", async () => {
		const cliente = await clienteDePrueba(servidor);
		const pagada = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 200_000 });
		await pagarDePrueba(servidor, cliente, pagada, 200_000);
		const nc = await notaCreditoDePrueba(servidor, pagada.notaId);
		expect(await aplicar(nc, pagada.notaId, 100_000)).toEqual({ aplicado_centavos: 0, a_favor_centavos: 100_000 });
		expect(await aFavor(cliente.clienteId)).toEqual([
			{ tipo: "entra", origen: "nota_credito", monto: 100_000, nota_credito_id: nc },
		]);
		const casi = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 30_000 });
		const otra = await notaCreditoDePrueba(servidor, casi.notaId);
		expect(await aplicar(otra, casi.notaId, 100_000)).toEqual({ aplicado_centavos: 30_000, a_favor_centavos: 70_000 });
		expect(await cuentaComoQuedo(servidor, casi.cuentaId)).toEqual({ saldo: 0, estado: "pagada", con_pagada_en: true });
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM eventos WHERE tipo = 'saldo_favor.creado' AND datos->>'cliente_id' = $1",
			[cliente.clienteId],
		);
		expect(rows).toEqual([{ n: 2 }]);
	});

	it("no se aplica dos veces, aun a la vez: `nota_credito_ya_aplicada` con su folio", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 500_000 });
		const nc = await notaCreditoDePrueba(servidor, nota.notaId, { folio: "NC-0007" });
		const [uno, dos] = await Promise.all([aplicar(nc, nota.notaId, 100_000), aplicar(nc, nota.notaId, 100_000)]);
		expect([uno, dos]).toContainEqual({ aplicado_centavos: 100_000, a_favor_centavos: 0 });
		expect([uno, dos]).toContainEqual(
			expect.objectContaining({ codigo: "nota_credito_ya_aplicada", mensaje: "NC-0007 ya bajó el saldo de su nota." }),
		);
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 400_000 });
		// Una que quedó toda a favor tampoco se aplica otra vez.
		await pagarDePrueba(servidor, cliente, nota, 400_000);
		const toda = await notaCreditoDePrueba(servidor, nota.notaId);
		await aplicar(toda, nota.notaId, 50_000);
		expect(await aplicar(toda, nota.notaId, 50_000)).toMatchObject({ codigo: "nota_credito_ya_aplicada" });
	});
});
