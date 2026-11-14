/**
 * Prueba de `contaduria.flujo_proximos_dias`: una columna por día de la ventana, desde hoy; lo que vence por cobrar y
 * por pagar ese día, sin lo detenido ni lo vencido; y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/contaduria.md («Flujo de los próximos
 * {n} días»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const flujo = z.object({
	ventana_dias: z.number(),
	dias: z.array(
		z.object({
			dia: z.string(),
			texto: z.string(),
			hoy: z.boolean(),
			entra_centavos: z.number(),
			sale_centavos: z.number(),
		}),
	),
});

describe("El flujo de los próximos días", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("da un día por cada día de la ventana, desde hoy, con lo que vence ese día por cobrar y por pagar sin lo detenido", async () => {
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City");
		const manana = hoy.add({ days: 1 }).toString();
		// Una cuenta por pagar que vence mañana y otra detenida que también vence mañana: solo la primera sale.
		await servidor.base.dueno.query(
			`UPDATE cuentas_por_pagar SET vence = $1 WHERE id IN (
				SELECT id FROM cuentas_por_pagar WHERE estado = 'por_pagar' ORDER BY id LIMIT 1)`,
			[manana],
		);
		await servidor.base.dueno.query(
			`UPDATE cuentas_por_pagar SET vence = $1 WHERE id IN (
				SELECT id FROM cuentas_por_pagar WHERE estado = 'detenida' ORDER BY id LIMIT 1)`,
			[manana],
		);
		const pedida = await pedirConsulta(servidor, "contaduria.flujo_proximos_dias", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const { ventana_dias, dias } = flujo.parse(pedida.cuerpo.resultado);
		expect(ventana_dias).toBe(7);
		expect(dias.map((dia) => dia.dia)).toEqual(Array.from({ length: 7 }, (_, i) => hoy.add({ days: i }).toString()));
		expect(dias[0]?.hoy).toBe(true);
		expect(dias[0]?.texto).toMatch(/^[a-záé]{3} \d{1,2}$/);
		const { rows } = await servidor.base.dueno.query(
			"SELECT sum(saldo_centavos) AS suma FROM cuentas_por_pagar WHERE vence = $1 AND estado IN ('por_pagar', 'pagada_en_parte')",
			[manana],
		);
		expect(dias[1]?.sale_centavos).toBe(Number(rows[0]?.suma));
	});

	it("solo Contaduría la pide", async () => {
		expect((await pedirConsulta(servidor, "contaduria.flujo_proximos_dias", {}, "direccion")).estado).toBe(403);
	});
});
