/**
 * Prueba de `contaduria.credito_de_cliente`: Ventas lee el semáforo, si tiene crédito, sus días y si está cerca de su
 * límite, y nunca un monto.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { clienteDePrueba, cuentaEscritaDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Ventas nunca recibe un monto del crédito", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lo que Ventas lee: exactamente estos cuatro campos, ninguno con un monto. */
	const deVentas = z
		.object({
			semaforo: z.enum(["al_corriente", "cerca_del_limite", "detenido"]),
			tiene_credito: z.boolean(),
			dias_credito: z.number().int(),
			cerca_del_limite: z.boolean(),
		})
		.strict();

	/** Lee el crédito de un cliente como lo lee Ventas. */
	function leer(clienteId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) =>
			deVentas.parse(await contexto.lectura("contaduria.credito_de_cliente", { cliente_id: clienteId })),
		);
	}

	it("sin crédito: al corriente, sin crédito y nunca cerca del límite, aunque deba", async () => {
		const cliente = await clienteDePrueba(servidor);
		await cuentaEscritaDePrueba(servidor, cliente, {
			importeCentavos: 500_000,
			saldoCentavos: 500_000,
			venceEnDias: 5,
		});
		expect(await leer(cliente.clienteId)).toEqual({
			semaforo: "al_corriente",
			tiene_credito: false,
			dias_credito: 15,
			cerca_del_limite: false,
		});
	});

	it("con $68,000 por cobrar de $80,000 está cerca de su límite; lo pagado no cuenta", async () => {
		const cliente = await clienteDePrueba(servidor, { limiteCentavos: 8_000_000 });
		await cuentaEscritaDePrueba(servidor, cliente, {
			importeCentavos: 7_000_000,
			saldoCentavos: 6_000_000,
			venceEnDias: 5,
		});
		await cuentaEscritaDePrueba(servidor, cliente, { importeCentavos: 900_000, saldoCentavos: 0, venceEnDias: -40 });
		expect(await leer(cliente.clienteId)).toMatchObject({ tiene_credito: true, cerca_del_limite: false });
		await cuentaEscritaDePrueba(servidor, cliente, {
			importeCentavos: 800_000,
			saldoCentavos: 800_000,
			venceEnDias: 1,
		});
		expect(await leer(cliente.clienteId)).toEqual({
			semaforo: "al_corriente",
			tiene_credito: true,
			dias_credito: 15,
			cerca_del_limite: true,
		});
	});
});
