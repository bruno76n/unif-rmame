/**
 * Prueba de la copia local, en un Chrome de tablet Android contra la API real con la muestra: después de su foto y de
 * bajar, nada de lo guardado tiene precios, costos ni sueldos (las tarifas solo si la dueña decide mostrarlas), y cada
 * tabla trae lo mismo que el servidor le manda.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «… y nada de lo guardado tiene precios,
 * costos ni sueldos») y docs/apps/tablet.md (regla 5 y «La copia local»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { levantarTablet, type TabletDePrueba, tabletLista } from "../pruebas/tablet-de-prueba.ts";

/** Lo que guarda la tablet: cada tabla con sus renglones. */
const guardado = z.record(z.string(), z.array(z.record(z.string(), z.unknown())));

/**
 * Las columnas de lo guardado, salvo las de unas tablas.
 * @param todo Lo guardado.
 * @param salvo Las tablas que no se revisan.
 */
function columnasDe(todo: z.infer<typeof guardado>, salvo: readonly string[] = []): string[] {
	const columnas = new Set<string>();
	for (const [tabla, renglones] of Object.entries(todo)) {
		if (salvo.includes(tabla)) continue;
		for (const renglon of renglones) for (const columna of Object.keys(renglon)) columnas.add(columna);
	}
	return [...columnas];
}

/** Las columnas de dinero o de sueldo que nunca bajan. */
const deDinero = /precio|costo|sueldo|pago_dia|importe|saldo|monto|tarifa|centavos/;

describe("la copia local nunca guarda precios, costos ni sueldos", () => {
	let prueba: TabletDePrueba;
	beforeAll(async () => {
		prueba = await levantarTablet();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	it("nada de lo guardado tiene precios, costos ni sueldos, y cada tabla trae lo que baja del servidor", async () => {
		const { pagina, contexto } = await tabletLista(prueba);
		const todo = guardado.parse(JSON.parse(await pagina.evaluate(() => window.porDentro.todo())));
		expect(columnasDe(todo).filter((columna) => deDinero.test(columna))).toEqual([]);
		expect(todo.tarifas_operacion).toEqual([]);
		// Lo que baja de cada tabla: los bultos del lote en proceso y del terminado, las máquinas activas, las personas.
		const [{ bultos } = {}] = await prueba.consultar(
			"SELECT count(*)::int AS bultos FROM bultos b JOIN lotes l ON l.id = b.lote_id WHERE l.estado IN ('en_proceso', 'terminado')",
		);
		const [{ maquinas } = {}] = await prueba.consultar(
			"SELECT count(*)::int AS maquinas FROM maquinas WHERE baja_en IS NULL",
		);
		expect(todo.bultos).toHaveLength(Number(bultos));
		expect(todo.maquinas).toHaveLength(Number(maquinas));
		expect(todo.parametros?.map((parametro) => parametro.clave)).toContain("personal.pin_intentos_bloqueo");
		await contexto.close();
	});

	it("con las tarifas visibles en la tablet, bajan solo las tarifas: ningún otro dinero", async () => {
		await prueba.consultar(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'produccion.tarifa_visible_tablet'",
		);
		try {
			const { pagina, contexto } = await tabletLista(prueba);
			const todo = guardado.parse(JSON.parse(await pagina.evaluate(() => window.porDentro.todo())));
			expect(columnasDe(todo, ["tarifas_operacion"]).filter((columna) => deDinero.test(columna))).toEqual([]);
			await contexto.close();
		} finally {
			await prueba.consultar(
				"UPDATE parametros SET valor_booleano = false WHERE clave = 'produccion.tarifa_visible_tablet'",
			);
		}
	});
});
