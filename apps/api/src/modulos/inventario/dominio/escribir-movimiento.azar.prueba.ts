/**
 * Prueba con datos al azar del libro: movimientos de varios renglones, en desorden y desde varias conexiones al
 * mismo tiempo. La existencia guardada siempre es la suma del libro, y no hay bloqueos cruzados.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 1)
 *
 * Cada movimiento corre en su propia transacción sin el reintento del núcleo: si dos se bloquearan entre sí,
 * Postgres cortaría uno con `40P01` y la prueba lo vería.
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearContexto } from "../../../nucleo/acciones/corredor.ts";
import { type Base, crearBase } from "../../../nucleo/base/conexion.ts";
import { codigoDePostgres } from "../../../nucleo/base/transacciones.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "./escribir-movimiento.ts";

/** Un renglón al azar: cuál variante, en cuál ubicación, si entra o sale, y cuántas piezas. */
const renglon = fc.record({
	variante: fc.integer({ min: 0, max: 2 }),
	ubicacion: fc.constantFrom("BOD", "ADU", "T1"),
	entra: fc.boolean(),
	piezas: fc.integer({ min: 1, max: 9 }),
});

/** Un renglón ya generado. */
interface RenglonAlAzar {
	variante: number;
	ubicacion: string;
	entra: boolean;
	piezas: number;
}

/** Lo que hace cada conexión: una lista de movimientos de 1 a 4 renglones. */
const trabajo = fc.array(fc.array(renglon, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 });

describe("Con movimientos al azar y varias conexiones al mismo tiempo, la existencia guardada es siempre la suma del libro y no hay bloqueos cruzados", () => {
	let servidor: ServidorDePrueba;
	let base: Base;
	let ubicacion: Record<string, string>;
	let variantes: string[];
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		base = crearBase(servidor.base.app);
		ubicacion = Object.fromEntries(
			(await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones")).rows.map((fila) => [
				fila.codigo,
				fila.id,
			]),
		);
		variantes = (await servidor.base.dueno.query("SELECT id FROM variantes ORDER BY codigo DESC LIMIT 3")).rows.map(
			(fila) => fila.id,
		);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Escribe un ajuste con esos renglones en su propia transacción, sin reintento. */
	async function ajuste(renglones: readonly RenglonAlAzar[]) {
		await base.transaction(async (transaccion) => {
			const { contexto } = crearContexto(
				servidor.modulos,
				transaccion,
				{ tipo: "sistema", trabajo: "prueba.azar" },
				"prueba.azar",
				Temporal.Now.instant(),
				undefined,
			);
			await escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: renglones.map((suyo) => {
					const lugar = ubicacion[suyo.ubicacion] ?? "";
					return {
						origen: suyo.entra ? null : lugar,
						destino: suyo.entra ? lugar : null,
						varianteId: variantes[suyo.variante] ?? "",
						piezas: suyo.piezas,
					};
				}),
				clave: uuidv7(),
			});
		});
	}

	/** Las existencias que no son la suma del libro. */
	async function descuadres(): Promise<unknown[]> {
		const { rows } = await servidor.base.dueno.query(`
			WITH libro AS (
				SELECT destino_ubicacion_id AS ubicacion_id, variante_id, piezas FROM movimiento_lineas
				WHERE destino_ubicacion_id IS NOT NULL AND variante_id IS NOT NULL
				UNION ALL
				SELECT origen_ubicacion_id, variante_id, -piezas FROM movimiento_lineas
				WHERE origen_ubicacion_id IS NOT NULL AND variante_id IS NOT NULL
			), suma AS (SELECT ubicacion_id, variante_id, sum(piezas)::int AS piezas FROM libro GROUP BY 1, 2)
			SELECT coalesce(e.ubicacion_id, s.ubicacion_id) AS ubicacion_id, coalesce(e.variante_id, s.variante_id) AS variante_id,
				e.piezas AS guardada, s.piezas AS libro
			FROM existencias e FULL JOIN suma s ON s.ubicacion_id = e.ubicacion_id AND s.variante_id = e.variante_id
			WHERE coalesce(e.piezas, 0) <> coalesce(s.piezas, 0)`);
		return rows;
	}

	it("cuatro conexiones a la vez, cada una con su lista de movimientos al azar", async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(trabajo, { minLength: 4, maxLength: 4 }), async (conexiones) => {
				const errores: unknown[] = [];
				await Promise.all(
					conexiones.map(async (lista) => {
						for (const renglones of lista) {
							await ajuste(renglones).catch((error: unknown) => errores.push(codigoDePostgres(error) ?? error));
						}
					}),
				);
				expect(errores).toEqual([]);
				expect(await descuadres()).toEqual([]);
			}),
			{ numRuns: 25 },
		);
	});
});
