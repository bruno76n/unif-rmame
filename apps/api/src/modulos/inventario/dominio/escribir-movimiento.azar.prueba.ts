/**
 * Prueba con datos al azar del libro: movimientos de varios renglones, de prendas y de material con milésimos,
 * ajustes y aclaraciones entre Taller y Bodega, en desorden y desde varias conexiones al mismo tiempo. La
 * existencia guardada siempre es la suma del libro, y no hay bloqueos cruzados.
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
import { materialesDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "./escribir-movimiento.ts";

/** Dos rollos fijos (y sin rollo): el material con rollo y sin él cuadran por separado. */
const rollos = [null, uuidv7(), uuidv7()];

/** Lo que mueve un renglón: piezas de una variante, o milésimos de un material en un rollo (o sin rollo). */
const cosa = fc.oneof(
	fc.record({ variante: fc.integer({ min: 0, max: 2 }), piezas: fc.integer({ min: 1, max: 9 }) }),
	fc.record({
		material: fc.integer({ min: 0, max: 1 }),
		rollo: fc.integer({ min: 0, max: 2 }),
		milesimos: fc.integer({ min: 1, max: 99_999 }),
	}),
);

/** Un renglón de ajuste: en cuál ubicación, si entra o sale, y qué. */
const deAjuste = fc.record({ ubicacion: fc.constantFrom("BOD", "ADU", "T1", "TAL"), entra: fc.boolean(), cosa });

/** Un renglón de aclaración: entre Taller y Bodega, en un sentido o en el otro. */
const deAclaracion = fc.record({ ubicacion: fc.constant("BOD"), entra: fc.boolean(), cosa });

/** Un movimiento al azar: un ajuste o una aclaración, de 1 a 4 renglones. */
const movimiento = fc.oneof(
	fc.record({ tipo: fc.constant("ajuste" as const), renglones: fc.array(deAjuste, { minLength: 1, maxLength: 4 }) }),
	fc.record({
		tipo: fc.constant("aclaracion_recepcion" as const),
		renglones: fc.array(deAclaracion, { minLength: 1, maxLength: 4 }),
	}),
);

/** Un movimiento ya generado. */
type MovimientoAlAzar = typeof movimiento extends fc.Arbitrary<infer T> ? T : never;

/** Lo que hace cada conexión: una lista de movimientos. */
const trabajo = fc.array(movimiento, { minLength: 1, maxLength: 6 });

describe("Con movimientos al azar y varias conexiones al mismo tiempo, la existencia guardada es siempre la suma del libro y no hay bloqueos cruzados", () => {
	let servidor: ServidorDePrueba;
	let base: Base;
	let ubicacion: Record<string, string>;
	let variantes: string[];
	/** Dos materiales de verdad. */
	let materiales: string[];
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
		materiales = await materialesDePrueba(servidor, 2, "tela");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los milésimos en el texto con tres decimales que guarda la base. */
	function cantidad(milesimos: number): string {
		return `${Math.trunc(milesimos / 1000)}.${String(milesimos % 1000).padStart(3, "0")}`;
	}

	/** Convierte un renglón generado en uno del libro: el ajuste entra de Fuera o sale a Fuera; la aclaración va de Taller a Bodega o al revés. */
	function renglonDelLibro(
		tipo: MovimientoAlAzar["tipo"],
		suyo: MovimientoAlAzar["renglones"][number],
	): RenglonDeMovimiento {
		const lugar = ubicacion[suyo.ubicacion] ?? "";
		const otro = tipo === "ajuste" ? null : (ubicacion.TAL ?? "");
		const lados = suyo.entra ? { origen: otro, destino: lugar } : { origen: lugar, destino: otro };
		if ("variante" in suyo.cosa)
			return { ...lados, varianteId: variantes[suyo.cosa.variante] ?? "", piezas: suyo.cosa.piezas };
		return {
			...lados,
			materialId: materiales[suyo.cosa.material] ?? "",
			rolloId: rollos[suyo.cosa.rollo] ?? null,
			cantidad: cantidad(suyo.cosa.milesimos),
		};
	}

	/** Escribe el movimiento en su propia transacción, sin reintento. */
	async function escribir(generado: MovimientoAlAzar) {
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
				tipo: generado.tipo,
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: generado.renglones.map((suyo) => renglonDelLibro(generado.tipo, suyo)),
				clave: uuidv7(),
			});
		});
	}

	/** Las existencias de prendas que no son la suma del libro. */
	async function descuadresDePrendas(): Promise<unknown[]> {
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

	/** Las existencias de material que no son la suma del libro, al milésimo, por rollo (o sin rollo). */
	async function descuadresDeMaterial(): Promise<unknown[]> {
		const { rows } = await servidor.base.dueno.query(`
			WITH libro AS (
				SELECT destino_ubicacion_id AS ubicacion_id, material_id, rollo_id, cantidad FROM movimiento_lineas
				WHERE destino_ubicacion_id IS NOT NULL AND material_id IS NOT NULL
				UNION ALL
				SELECT origen_ubicacion_id, material_id, rollo_id, -cantidad FROM movimiento_lineas
				WHERE origen_ubicacion_id IS NOT NULL AND material_id IS NOT NULL
			), suma AS (SELECT ubicacion_id, material_id, rollo_id, sum(cantidad) AS cantidad FROM libro GROUP BY 1, 2, 3)
			SELECT coalesce(e.material_id, s.material_id) AS material_id, e.cantidad AS guardada, s.cantidad AS libro
			FROM existencias_material e FULL JOIN suma s ON s.ubicacion_id = e.ubicacion_id AND s.material_id = e.material_id
				AND s.rollo_id IS NOT DISTINCT FROM e.rollo_id
			WHERE coalesce(e.cantidad, 0) <> coalesce(s.cantidad, 0)`);
		return rows;
	}

	it("cuatro conexiones a la vez, cada una con su lista de movimientos al azar de prendas y de material", async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(trabajo, { minLength: 4, maxLength: 4 }), async (conexiones) => {
				const errores: unknown[] = [];
				await Promise.all(
					conexiones.map(async (lista) => {
						for (const generado of lista) {
							await escribir(generado).catch((error: unknown) => errores.push(codigoDePostgres(error) ?? error));
						}
					}),
				);
				expect(errores).toEqual([]);
				expect(await descuadresDePrendas()).toEqual([]);
				expect(await descuadresDeMaterial()).toEqual([]);
			}),
			{ numRuns: 60 },
		);
	});
});
