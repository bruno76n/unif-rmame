/**
 * Prueba de `contaduria.devolver_saldo_a_favor`: devolver es un pago emitido con «Confirmar con Google», sin pasar del
 * saldo a favor, aun con dos a la vez.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type ClienteDePrueba,
	clienteDePrueba,
	internaDeContaduria,
	notaEntregadaDePrueba,
	pagarDePrueba,
	saldoAFavorDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Devolver saldo a favor es un pago emitido con «Confirmar con Google» que no pasa de lo que hay", () => {
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

	/** Contaduría devuelve saldo a favor en efectivo, con «Confirmar con Google» si no se dice otra cosa. */
	function devolver(
		cliente: ClienteDePrueba,
		monto: number,
		datos: Record<string, unknown> = {},
		encabezados = conGoogle(),
	) {
		return mandarAccion(
			servidor,
			"contaduria.devolver_saldo_a_favor",
			{
				datos: {
					cliente_id: cliente.clienteId,
					monto_centavos: monto,
					medio: "efectivo",
					referencia: "Recibo 12",
					...datos,
				},
			},
			"contaduria",
			encabezados,
		);
	}

	it("sin Google no entra; con él, un PG- emitido con su confirmación y su `devuelto`, y el saldo a favor baja", async () => {
		const zamora = await clienteDePrueba(servidor);
		await dejarAFavor(zamora, 100_000);
		expect((await devolver(zamora, 100_000, {}, {})).estado).toBe(401);
		const respuesta = await devolver(zamora, 60_000);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: `$600 devueltos a ${zamora.nombre}` });
		expect(await saldoAFavorDePrueba(servidor, zamora.clienteId)).toBe(40_000);
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.direccion, p.concepto, p.referencia, p.confirmado_con_google_en IS NOT NULL AS con_google,
				m.tipo, m.monto_centavos::int AS monto
			 FROM pagos p JOIN saldo_favor_movimientos m ON m.pago_id = p.id WHERE p.cliente_id = $1 AND p.direccion = 'emitido'`,
			[zamora.clienteId],
		);
		expect(rows).toEqual([
			{
				direccion: "emitido",
				concepto: "devolucion_saldo_favor",
				referencia: "Recibo 12",
				con_google: true,
				tipo: "devuelto",
				monto: 60_000,
			},
		]);
	});

	it("de más: «Hasta»; sin saldo a favor: `sin_saldo_a_favor`; sin referencia, no; dos a la vez no pasan de lo que hay", async () => {
		const cliente = await clienteDePrueba(servidor);
		expect((await devolver(cliente, 10_000)).cuerpo).toMatchObject({ codigo: "sin_saldo_a_favor" });
		await dejarAFavor(cliente, 100_000);
		expect((await devolver(cliente, 110_000)).cuerpo).toMatchObject({ campos: { monto_centavos: "Hasta $1,000" } });
		expect((await devolver(cliente, 10_000, { referencia: undefined })).estado).toBe(400);
		const [uno, dos] = await Promise.all([devolver(cliente, 70_000), devolver(cliente, 70_000)]);
		expect([uno.estado, dos.estado].sort()).toEqual([200, 400]);
		expect(await saldoAFavorDePrueba(servidor, cliente.clienteId)).toBe(30_000);
	});

	it("con centavos solo se devuelve todo el saldo a favor: $999.50 completos sí, $500.50 no", async () => {
		const cliente = await clienteDePrueba(servidor);
		await dejarAFavor(cliente, 99_950);
		expect((await devolver(cliente, 50_050)).cuerpo).toMatchObject({
			campos: { monto_centavos: "Escribe el monto en pesos, o el saldo exacto: $999.50" },
		});
		expect((await devolver(cliente, 99_950)).cuerpo.resultado).toMatchObject({
			mensaje: `$999.50 devueltos a ${cliente.nombre}`,
		});
		expect(await saldoAFavorDePrueba(servidor, cliente.clienteId)).toBe(0);
	});
});
