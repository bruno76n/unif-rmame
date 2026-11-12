/**
 * Prueba de `produccion.lotes` con los datos de la muestra: los cuatro grupos (atorados, en proceso, por cortar y
 * terminados), la tira de cada lote en proceso sin el corte y con su marca, el estado de cada uno con su color, y nada
 * de dinero; solo Producción la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una tarjeta de lote en proceso. */
interface Tarjeta {
	folio: string;
	piezas: number;
	estado: { texto: string; color: string; linea: string };
	tira: { operacion: string; hechas: number; puede_hasta: number; marca: string | null }[];
}

/** Lo que regresa la consulta. */
interface Lotes {
	atorados: Tarjeta[];
	en_proceso: Tarjeta[];
	por_cortar: { folio: string; receta: string; en_dias: string; corte_pronto: boolean; para: { tipo: string } }[];
	terminados: { folio: string; listas: number; cortadas: number }[];
}

describe("produccion.lotes: los lotes del taller en cuatro grupos, sin dinero", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada grupo trae sus lotes de la muestra; la tira no lleva el corte y nadie reporta más que la anterior", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.lotes", {}, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|tarifa/);
		const lotes = respuesta.cuerpo.resultado as Lotes;
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, count(*)::int AS n FROM lotes WHERE estado IN ('en_proceso', 'por_cortar', 'terminado') GROUP BY estado",
		);
		const cuantos = (estado: string) => Number(rows.find((fila) => fila.estado === estado)?.n ?? 0);
		expect(lotes.atorados.length + lotes.en_proceso.length).toBe(cuantos("en_proceso"));
		expect(lotes.por_cortar.length).toBe(cuantos("por_cortar"));
		expect(lotes.terminados.length).toBe(cuantos("terminado"));
		// Los atorados van en rojo; los demás en proceso no.
		expect(lotes.atorados.every((tarjeta) => tarjeta.estado.color === "rojo")).toBe(true);
		expect(lotes.en_proceso.every((tarjeta) => tarjeta.estado.color !== "rojo")).toBe(true);
		for (const tarjeta of [...lotes.atorados, ...lotes.en_proceso]) {
			expect(tarjeta.tira.map((casilla) => casilla.operacion)).not.toContain("Corte");
			expect(tarjeta.tira[0]?.puede_hasta).toBe(tarjeta.piezas);
			tarjeta.tira.forEach((casilla, i) => {
				if (i > 0) expect(casilla.puede_hasta).toBe(tarjeta.tira[i - 1]?.hechas);
			});
			expect(tarjeta.tira.filter((casilla) => casilla.marca !== null).length).toBeLessThanOrEqual(1);
		}
		// Por cortar, por fecha de corte, con su receta; el L-2026-019 es del pedido de Zamora, sin verificar.
		const pantalon = lotes.por_cortar.find((lote) => lote.folio === "L-2026-019");
		expect(pantalon).toMatchObject({ receta: "sin_verificar", para: { tipo: "pedido" }, corte_pronto: true });
		expect(pantalon?.en_dias).toMatch(/^(hoy|en \d+ días?|hace \d+ días?)$/);
		const terminado = lotes.terminados.find((lote) => lote.folio === "L-2026-001");
		expect(terminado?.cortadas).toBe(120);
	});

	it("solo Producción la pide", async () => {
		expect((await pedirConsulta(servidor, "produccion.lotes", {}, "bodega")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.lotes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.lotes", {}, "duena")).estado).toBe(200);
	});
});
