/**
 * Prueba de `contaduria.pagos_recibidos` con la muestra: los pagos recibidos, el más reciente arriba, con dónde se
 * recibieron y si un depósito a un tercero está aplicado; los cancelados solo si se piden; y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … saldos sin Contaduría») y docs/interfaz/fabrica/contaduria.md
 * («Cuentas por cobrar», «Pagos recibidos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const pagos = z.object({
	renglones: z.array(
		z.object({
			pago_id: z.string(),
			version: z.number(),
			folio: z.string(),
			fecha: z.string(),
			cliente_id: z.string(),
			donde: z.string(),
			aplicado: z.object({ texto: z.string(), ambar: z.boolean() }).nullable(),
			cancelado: z.boolean(),
			registro: z.string(),
		}),
	),
	hay_mas: z.boolean(),
});

describe("Pagos recibidos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide los pagos con unos parámetros. */
	async function pedir(parametros: Record<string, string> = {}) {
		const pedida = await pedirConsulta(servidor, "contaduria.pagos_recibidos", parametros, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		return pagos.parse(pedida.cuerpo.resultado);
	}

	it("trae los pagos recibidos registrados, el más reciente arriba, con dónde se recibieron y si el depósito está aplicado", async () => {
		const { renglones } = await pedir();
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM pagos WHERE direccion = 'recibido' AND estado = 'registrado'",
		);
		expect(renglones).toHaveLength(Number(rows[0]?.n));
		const fechas = renglones.map((renglon) => renglon.fecha);
		expect(fechas).toEqual([...fechas].sort().reverse());
		const aUnTercero = renglones.filter((renglon) => renglon.donde === "Cuenta de Ing. Ramón Villaseñor");
		expect(aUnTercero).toHaveLength(1);
		expect(aUnTercero[0]?.aplicado).toEqual({ texto: "sin aplicar", ambar: true });
		expect(renglones.every((renglon) => renglon.registro !== "")).toBe(true);
	});

	it("un pago cancelado solo sale con «Mostrar cancelados»; el filtro por cliente deja solo los suyos", async () => {
		const { renglones } = await pedir();
		const [primero] = renglones;
		if (primero === undefined) throw new Error("la muestra no trae pagos");
		const cancelado = await mandarAccion(
			servidor,
			"contaduria.cancelar_pago",
			{ datos: { pago_id: primero.pago_id, motivo: "Se registró dos veces" }, version: primero.version },
			"contaduria",
			conGoogle(),
		);
		expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
		expect((await pedir()).renglones.some((renglon) => renglon.pago_id === primero.pago_id)).toBe(false);
		const conCancelados = await pedir({ incluir_cancelados: "si" });
		expect(conCancelados.renglones.find((renglon) => renglon.pago_id === primero.pago_id)?.cancelado).toBe(true);
		const delCliente = await pedir({ cliente_id: primero.cliente_id });
		expect(delCliente.renglones.every((renglon) => renglon.cliente_id === primero.cliente_id)).toBe(true);
	});

	it("solo Contaduría los pide: Bodega recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.pagos_recibidos", {}, "bodega")).estado).toBe(403);
	});
});
