/**
 * Prueba de `contaduria.terceros` con la muestra: cada tercero con lo que nos debe, lo que le debemos y su saldo neto,
 * primero los que van de los dos lados; el buscador y el filtro por relación; y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la cuenta
 * no debe ver: … saldos sin Contaduría») y docs/interfaz/fabrica/contaduria.md («Terceros»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const terceros = z.object({
	renglones: z.array(
		z.object({
			nombre: z.string(),
			relacion: z.array(z.string()),
			por_cobrar_centavos: z.number(),
			por_pagar_centavos: z.number(),
			neto: z.object({ como: z.string(), monto_centavos: z.number() }),
		}),
	),
	para_deuda: z.array(z.object({ nombre: z.string() })),
});

describe("Terceros", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide los terceros. */
	async function pedir(parametros: Record<string, string> = {}) {
		const pedida = await pedirConsulta(servidor, "contaduria.terceros", parametros, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		return terceros.parse(pedida.cuerpo.resultado);
	}

	it("primero los que nos deben y les debemos, con su saldo neto", async () => {
		const { renglones, para_deuda } = await pedir();
		const [primero] = renglones;
		expect(primero?.nombre).toBe("Distribuidora Escolar Zamora");
		expect(primero?.relacion).toEqual(["Cliente", "Acreedor"]);
		if (primero === undefined) return;
		const neto = primero.por_cobrar_centavos - primero.por_pagar_centavos;
		expect(primero.neto).toEqual({
			como: neto > 0 ? "a_favor" : neto < 0 ? "en_contra" : "saldado",
			monto_centavos: Math.abs(neto),
		});
		expect(para_deuda.length).toBeGreaterThan(0);
	});

	it("el buscador y el filtro por relación", async () => {
		const acreedores = await pedir({ rol: "acreedor" });
		expect(acreedores.renglones.every((renglon) => renglon.relacion.includes("Acreedor"))).toBe(true);
		const banorte = await pedir({ buscar: "banor" });
		expect(banorte.renglones.map((renglon) => renglon.nombre)).toEqual(["Banorte"]);
	});

	it("solo Contaduría la pide: Compras recibe 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.terceros", {}, "compras")).estado).toBe(403);
	});
});
