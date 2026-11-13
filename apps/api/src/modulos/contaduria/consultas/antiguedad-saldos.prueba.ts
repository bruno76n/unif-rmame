/**
 * Prueba de `contaduria.antiguedad_saldos` con la muestra: el saldo por tramo de cada cliente cuadra con sus cuentas,
 * del que más debe al que menos, con su crédito y su semáforo; los depósitos a terceros por aplicar con las deudas de
 * ese tercero; lo cobrado por semana; y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … saldos sin Contaduría») y docs/interfaz/fabrica/contaduria.md
 * («Cuentas por cobrar»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const antiguedad = z.object({
	tramos: z.array(z.object({ etiqueta: z.string() })),
	por_cobrar: z.object({ total_centavos: z.number() }),
	cobrado_por_semana: z.array(z.object({ actual: z.boolean(), monto_centavos: z.number() })),
	clientes: z.array(
		z.object({
			nombre: z.string(),
			saldo_centavos: z.number(),
			por_tramo: z.array(z.object({ monto_centavos: z.number() })),
			semaforo: z.object({ texto: z.string() }),
			uso_tono: z.string(),
		}),
	),
	depositos: z.array(
		z.object({ tercero: z.string(), queda_centavos: z.number(), deudas: z.array(z.object({ documento: z.string() })) }),
	),
});

describe("Antigüedad de saldos por cliente", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada cliente con su saldo por tramo, del que más debe al que menos, con su semáforo; la suma es el saldo por cobrar", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.antiguedad_saldos", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = antiguedad.parse(pedida.cuerpo.resultado);
		expect(datos.tramos.map((tramo) => tramo.etiqueta)).toEqual([
			"Por vencer",
			"1 a 15 días",
			"16 a 30 días",
			"Más de 30",
		]);
		const { rows } = await servidor.base.dueno.query("SELECT sum(saldo_centavos) AS suma FROM cuentas_por_cobrar");
		expect(datos.por_cobrar.total_centavos).toBe(Number(rows[0]?.suma));
		expect(datos.clientes.reduce((suma, cliente) => suma + cliente.saldo_centavos, 0)).toBe(
			datos.por_cobrar.total_centavos,
		);
		for (const cliente of datos.clientes) {
			expect(cliente.por_tramo.reduce((suma, tramo) => suma + tramo.monto_centavos, 0)).toBe(cliente.saldo_centavos);
		}
		const saldos = datos.clientes.map((cliente) => cliente.saldo_centavos);
		expect(saldos).toEqual([...saldos].sort((uno, otro) => otro - uno));
		// El Bajío está detenido en la muestra: sale aunque no deba.
		expect(datos.clientes.find((cliente) => cliente.nombre === "Uniformes El Bajío")?.semaforo.texto).toBe("Detenido");
		expect(datos.cobrado_por_semana).toHaveLength(8);
		expect(datos.cobrado_por_semana.at(-1)?.actual).toBe(true);
	});

	it("los depósitos a terceros por aplicar traen las deudas abiertas no detenidas de su tercero", async () => {
		const datos = antiguedad.parse(
			(await pedirConsulta(servidor, "contaduria.antiguedad_saldos", {}, "contaduria")).cuerpo.resultado,
		);
		expect(datos.depositos).toHaveLength(2);
		const aVillasenor = datos.depositos.find((deposito) => deposito.tercero === "Ing. Ramón Villaseñor");
		expect(aVillasenor?.queda_centavos).toBe(1_200_000);
		expect(aVillasenor?.deudas.length).toBeGreaterThan(0);
		expect(aVillasenor?.deudas.every((deuda) => deuda.documento.includes("mensualidad"))).toBe(true);
	});

	it("solo Contaduría ve los saldos: Ventas y Dirección reciben 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.antiguedad_saldos", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "contaduria.antiguedad_saldos", {}, "direccion")).estado).toBe(403);
	});
});
