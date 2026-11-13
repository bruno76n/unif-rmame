/**
 * Prueba de `contaduria.cuentas_por_pagar` con la muestra: lo programado sin lo detenido, los pagos detenidos con sus
 * tres puntas y a cargo de quién, el calendario que suma lo que se debe sin lo detenido, y solo Contaduría la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento … y no manda lo que la cuenta
 * no debe ver») y docs/interfaz/fabrica/contaduria.md («Cuentas por pagar»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un grupo del calendario. */
const grupo = z.object({
	cuantos: z.number(),
	suma_centavos: z.number(),
	renglones: z.array(z.object({ documento: z.string(), saldo_centavos: z.number() })),
});

/** Lo que se lee de la respuesta. */
const porPagar = z.object({
	total_centavos: z.number(),
	detenidas: z.number(),
	por_semana: z.array(z.object({ etiqueta: z.string() })),
	pagos_detenidos: z.array(
		z.object({
			responsable: z.string(),
			documento: z.string(),
			ordenes: z.array(
				z.object({ puntas: z.object({ recepcion: z.object({ texto: z.string(), como: z.string() }) }) }),
			),
		}),
	),
	vencidos: grupo,
	proximos: grupo,
	posteriores: grupo,
});

describe("Cuentas por pagar", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el calendario suma lo que se debe sin lo detenido, y lo detenido va aparte con sus tres puntas y su responsable", async () => {
		const pedida = await pedirConsulta(servidor, "contaduria.cuentas_por_pagar", {}, "contaduria");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		const datos = porPagar.parse(pedida.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT sum(saldo_centavos) AS suma, count(*)::int AS n FROM cuentas_por_pagar WHERE estado IN ('por_pagar', 'pagada_en_parte')",
		);
		const enCalendario = datos.vencidos.suma_centavos + datos.proximos.suma_centavos + datos.posteriores.suma_centavos;
		expect(enCalendario).toBe(Number(rows[0]?.suma));
		expect(datos.total_centavos).toBe(Number(rows[0]?.suma));
		expect(datos.vencidos.cuantos + datos.proximos.cuantos + datos.posteriores.cuantos).toBe(Number(rows[0]?.n));
		expect(datos.por_semana.map((semana) => semana.etiqueta)).toEqual([
			"Vencido",
			"Próximos 7 días",
			"+1 sem.",
			"+2 sem.",
			"+3 sem.",
			"+4 sem.",
		]);
		const detenidas = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM cuentas_por_pagar WHERE estado = 'detenida'",
		);
		expect(datos.detenidas).toBe(Number(detenidas.rows[0]?.n));
		expect(datos.pagos_detenidos.map((tarjeta) => tarjeta.responsable).sort()).toEqual(["aduana", "contaduria"]);
		const deAduana = datos.pagos_detenidos.find((tarjeta) => tarjeta.responsable === "aduana");
		expect(deAduana?.ordenes[0]?.puntas.recepcion).toEqual({ texto: "Sin recibir", como: "falta" });
		expect(datos.pagos_detenidos.every((tarjeta) => tarjeta.documento.startsWith("Factura FP-"))).toBe(true);
	});

	it("solo Contaduría ve lo que se debe: Compras y Aduana reciben 403", async () => {
		expect((await pedirConsulta(servidor, "contaduria.cuentas_por_pagar", {}, "compras")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "contaduria.cuentas_por_pagar", {}, "aduana")).estado).toBe(403);
	});
});
