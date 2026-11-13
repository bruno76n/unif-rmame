/**
 * Prueba de `contaduria.registrar_pago_opciones` con la muestra: los clientes con algo por pagar, los documentos del
 * escogido (sus notas con saldo y sus pedidos abiertos), los terceros a quienes se les debe sin el mismo cliente, sus
 * deudas no detenidas, y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la
 * cuenta no debe ver») y docs/interfaz/fabrica/contaduria.md («Registrar pago»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const opciones = z.object({
	clientes: z.array(z.object({ id: z.string(), nombre: z.string() })),
	cliente_id: z.string().nullable(),
	documentos: z.array(z.object({ tipo: z.string(), folio: z.string(), saldo_centavos: z.number() })),
	cuentas_fabrica: z.array(z.object({ nombre: z.string() })),
	terceros: z.array(z.object({ id: z.string(), nombre: z.string() })),
	deudas: z.array(z.object({ cuenta_por_pagar_id: z.string(), documento: z.string() })),
});

describe("Las opciones de Registrar pago", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide las opciones. */
	async function pedir(parametros: Record<string, string> = {}) {
		const pedida = await pedirConsulta(servidor, "contaduria.registrar_pago_opciones", parametros, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		return opciones.parse(pedida.cuerpo.resultado);
	}

	it("sin cliente escoge el primero con algo por pagar y trae sus notas con saldo y sus pedidos abiertos", async () => {
		const datos = await pedir();
		expect(datos.clientes.length).toBeGreaterThan(0);
		expect(datos.cliente_id).toBe(datos.clientes[0]?.id);
		expect(datos.documentos.length).toBeGreaterThan(0);
		expect(datos.documentos.every((documento) => documento.saldo_centavos > 0)).toBe(true);
		expect(datos.cuentas_fabrica.map((cuenta) => cuenta.nombre)).toContain("Cuenta de la fábrica");
	});

	it("los terceros son a quienes se les debe, sin el mismo cliente; sus deudas, sin las detenidas", async () => {
		const zamora = (await pedir()).clientes.find((uno) => uno.nombre === "Distribuidora Escolar Zamora");
		if (zamora === undefined) throw new Error("Zamora no tiene nada por pagar en la muestra");
		const suyas = await pedir({ cliente_id: zamora.id });
		expect(suyas.terceros.map((tercero) => tercero.nombre)).not.toContain("Distribuidora Escolar Zamora");
		const villasenor = suyas.terceros.find((tercero) => tercero.nombre === "Ing. Ramón Villaseñor");
		if (villasenor === undefined) throw new Error("falta el acreedor de la muestra");
		const conDeudas = await pedir({ cliente_id: zamora.id, tercero_deposito_id: villasenor.id });
		expect(conDeudas.deudas.length).toBeGreaterThan(0);
		const { rows } = await servidor.base.dueno.query("SELECT id FROM cuentas_por_pagar WHERE estado = 'detenida'");
		const detenidas = new Set(rows.map((fila: { id: string }) => fila.id));
		expect(conDeudas.deudas.some((deuda) => detenidas.has(deuda.cuenta_por_pagar_id))).toBe(false);
	});

	it("solo Contaduría las pide: Aduana recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.registrar_pago_opciones", {}, "aduana")).estado).toBe(403);
	});
});
