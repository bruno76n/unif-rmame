/**
 * Prueba de `contaduria.aplicar_saldo_a_favor`: el saldo a favor se aplica a una nota sin pasar de lo que hay ni del
 * saldo de la nota, aun con dos acciones al mismo tiempo.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type ClienteDePrueba,
	clienteDePrueba,
	cuentaComoQuedo,
	internaDeContaduria,
	type NotaDePrueba,
	notaEntregadaDePrueba,
	pagarDePrueba,
	saldoAFavorDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El saldo a favor se aplica sin pasar de lo que hay, aun con dos acciones al mismo tiempo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Deja saldo a favor al cliente: una NC sobre una nota ya pagada. */
	async function dejarAFavor(cliente: ClienteDePrueba, monto: number) {
		const pagada = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		await pagarDePrueba(servidor, cliente, pagada, 100_000);
		await internaDeContaduria(servidor, "aplicar_nota_credito", {
			nota_credito_id: uuidv7(),
			nota_entrega_id: pagada.notaId,
			monto_centavos: monto,
		});
	}

	/** Contaduría aplica saldo a favor del cliente a una nota. */
	function aplicar(cliente: ClienteDePrueba, nota: NotaDePrueba, monto: number) {
		return mandarAccion(
			servidor,
			"contaduria.aplicar_saldo_a_favor",
			{ datos: { cliente_id: cliente.clienteId, nota_entrega_id: nota.notaId, monto_centavos: monto } },
			"contaduria",
		);
	}

	it("$1,000 a favor de Zamora a su nota con $5,400: la baja a $4,400 y su saldo a favor queda en 0", async () => {
		const zamora = await clienteDePrueba(servidor);
		await dejarAFavor(zamora, 100_000);
		const nota = await notaEntregadaDePrueba(servidor, zamora, { totalCentavos: 540_000 });
		const respuesta = await aplicar(zamora, nota, 100_000);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: `$1,000 a favor aplicados a ${nota.folio}` });
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 440_000, estado: "pagada_en_parte" });
		expect(await saldoAFavorDePrueba(servidor, zamora.clienteId)).toBe(0);
		const { rows } = await servidor.base.dueno.query(
			`SELECT a.monto_centavos::int AS monto, m.tipo, b.descripcion FROM aplicaciones_pago a
			 JOIN saldo_favor_movimientos m ON m.id = a.saldo_favor_movimiento_id JOIN bitacora b ON b.entidad_id = m.id
			 WHERE a.cuenta_por_cobrar_id = $1`,
			[nota.cuentaId],
		);
		expect(rows).toEqual([
			{
				monto: 100_000,
				tipo: "aplicado_nota",
				descripcion: `Aplicó $1,000 a favor de ${zamora.nombre} a ${nota.folio}`,
			},
		]);
	});

	it("sin saldo a favor, de más que el saldo a favor o de más que el saldo de la nota, no entra", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 50_000 });
		expect((await aplicar(cliente, nota, 10_000)).cuerpo).toMatchObject({
			codigo: "sin_saldo_a_favor",
			mensaje: `${cliente.nombre} no tiene saldo a favor.`,
		});
		await dejarAFavor(cliente, 80_000);
		expect((await aplicar(cliente, nota, 90_000)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_saldo_a_favor",
			mensaje: "Hasta $800.",
		});
		expect((await aplicar(cliente, nota, 60_000)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_saldo",
			mensaje: `El saldo de ${nota.folio} es $500.`,
		});
	});

	it("dos aplicaciones a la vez que juntas pasan del saldo a favor: entra una", async () => {
		const cliente = await clienteDePrueba(servidor);
		await dejarAFavor(cliente, 100_000);
		const una = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		const otra = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		const [uno, dos] = await Promise.all([aplicar(cliente, una, 70_000), aplicar(cliente, otra, 70_000)]);
		expect([uno.estado, dos.estado].sort()).toEqual([200, 422]);
		expect(await saldoAFavorDePrueba(servidor, cliente.clienteId)).toBe(30_000);
	});
});
