/**
 * Prueba con datos al azar del cuadre: existencias de prendas y de material alteradas al azar, y movimientos al
 * azar desde otra conexión mientras el cuadre corre. Al terminar, toda existencia es la suma del libro, y el cuadre
 * abrió una excepción por cada existencia alterada (con la diferencia que se le metió) y ninguna más.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 5)
 * Fase 14 · los negativos que dejan los movimientos abren su DF- del cuadre (paso 5), que también es residuo.
 */

import { join } from "node:path";
import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearContexto, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { type Base, crearBase } from "../../../nucleo/base/conexion.ts";
import { codigoDePostgres } from "../../../nucleo/base/transacciones.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { materialesDePrueba, rollosDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { type CuadreCorrido, correrCuadre } from "./correr-cuadre.ts";

/** Las ubicaciones donde se mueve y se altera. */
const codigos = ["ADU", "BOD", "T1"] as const;

/** Una existencia: de una variante (0 a 2) o de un material (3 y 4), en una ubicación. */
const lugar = fc.record({ cosa: fc.integer({ min: 0, max: 4 }), ubicacion: fc.constantFrom(...codigos) });

/** Una alteración: en piezas, o en milésimos si es material; nunca cero. */
const alteracion = fc.record({
	lugar,
	diferencia: fc.integer({ min: -500, max: 500 }).filter((numero) => numero !== 0),
});

/** Un movimiento de otra conexión: un ajuste que entra o sale. */
const movimiento = fc.record({ lugar, entra: fc.boolean(), cuanto: fc.integer({ min: 1, max: 900 }) });

/** Un movimiento ya generado. */
type MovimientoAlAzar = typeof movimiento extends fc.Arbitrary<infer T> ? T : never;

/** Una corrida: lo que se altera antes del cuadre (sin repetir lugar) y lo que se mueve mientras corre. */
const corrida = fc.record({
	alteraciones: fc.uniqueArray(alteracion, {
		maxLength: 6,
		selector: (suya) => `${suya.lugar.cosa}:${suya.lugar.ubicacion}`,
	}),
	movimientos: fc.array(movimiento, { maxLength: 10 }),
});

describe("El cuadre corrige desde el libro toda existencia alterada, aunque al mismo tiempo se muevan piezas y material, y abre una excepción por cada una", () => {
	let servidor: ServidorDePrueba;
	let base: Base;
	let ubicacion: Record<string, string>;
	let variantes: string[];
	let dia = Temporal.PlainDate.from("2031-01-01");
	/** Dos materiales, uno con rollo y otro sin él. */
	let materiales: { materialId: string; conRollo: boolean }[];
	/** El rollo de cada ubicación: un rollo tiene metros en un solo lugar (el paso 2 del cuadre lo revisa). */
	const rolloDe: Record<string, string> = {};
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		base = crearBase(servidor.base.app);
		ubicacion = await ubicacionesPorCodigo(servidor);
		variantes = await variantesLibres(servidor, 3);
		const [conRollo = "", sinRollo = ""] = await materialesDePrueba(servidor, 2, "tela");
		materiales = [
			{ materialId: conRollo, conRollo: true },
			{ materialId: sinRollo, conRollo: false },
		];
		for (const codigo of codigos) rolloDe[codigo] = (await rollosDePrueba(servidor, conRollo, 1))[0] ?? "";
		// Cada lugar empieza con algo, para que la alteración tenga existencia que alterar.
		for (const codigo of codigos)
			for (const cosa of [0, 1, 2, 3, 4]) await mover({ lugar: { cosa, ubicacion: codigo }, entra: true, cuanto: 50 });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El renglón de un ajuste que entra o sale de un lugar. */
	function renglon(suyo: MovimientoAlAzar) {
		const id = ubicacion[suyo.lugar.ubicacion] ?? "";
		const lados = suyo.entra ? { origen: null, destino: id } : { origen: id, destino: null };
		const material = materiales[suyo.lugar.cosa - 3];
		if (material === undefined)
			return {
				...lados,
				varianteId: variantes[suyo.lugar.cosa] ?? "",
				piezas: suyo.cuanto,
			} satisfies RenglonDeMovimiento;
		return {
			...lados,
			materialId: material.materialId,
			rolloId: material.conRollo ? (rolloDe[suyo.lugar.ubicacion] ?? null) : null,
			cantidad: (suyo.cuanto / 1000).toFixed(3),
		} satisfies RenglonDeMovimiento;
	}

	/** Escribe un ajuste en su propia transacción, sin el reintento del núcleo. */
	async function mover(suyo: MovimientoAlAzar) {
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
				renglones: [renglon(suyo)],
				clave: uuidv7(),
			});
		});
	}

	/** Altera una existencia por fuera del libro, como lo haría un error. */
	async function alterar(suya: { lugar: { cosa: number; ubicacion: string }; diferencia: number }) {
		const id = ubicacion[suya.lugar.ubicacion];
		const material = materiales[suya.lugar.cosa - 3];
		if (material === undefined)
			await servidor.base.dueno.query(
				"UPDATE existencias SET piezas = piezas + $3 WHERE ubicacion_id = $1 AND variante_id = $2",
				[id, variantes[suya.lugar.cosa], suya.diferencia],
			);
		else
			await servidor.base.dueno.query(
				`UPDATE existencias_material SET cantidad = cantidad + $4::numeric / 1000
				 WHERE ubicacion_id = $1 AND material_id = $2 AND rollo_id IS NOT DISTINCT FROM $3`,
				[id, material.materialId, material.conRollo ? (rolloDe[suya.lugar.ubicacion] ?? null) : null, suya.diferencia],
			);
	}

	/** Corre el cuadre de una fecha como lo corre el trabajo. */
	async function cuadrar(fecha: string): Promise<CuadreCorrido> {
		let corrido: CuadreCorrido | undefined;
		const registro = await cargarModulos(join(import.meta.dirname, "../.."));
		const pruebas = await cargarModulos(join(import.meta.dirname, "../../../nucleo/pruebas/modulos"));
		await correrTrabajo(
			{
				base,
				registro: { ...registro, lecturas: new Map([...registro.lecturas, ...pruebas.lecturas]) },
				servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
				avisarFalla: async () => undefined,
				enviarCorreo: async () => undefined,
				dominioWeb: "https://fabrica.prueba.invalid",
				reloj: () => Temporal.Now.instant(),
			},
			{
				nombre: "prueba.cuadre",
				correr: async (contexto) => {
					corrido = await correrCuadre(contexto, fecha);
				},
			},
			{},
		);
		if (corrido === undefined) throw new Error("el cuadre no regresó nada");
		return corrido;
	}

	/** Lo que el libro y lo guardado no tienen igual, de prendas y de material. */
	async function descuadres(): Promise<unknown[]> {
		const { rows } = await servidor.base.dueno.query(`
			WITH libro AS (
				SELECT destino_ubicacion_id AS u, variante_id AS v, NULL::uuid AS m, NULL::uuid AS r, piezas::numeric AS c
				FROM movimiento_lineas WHERE destino_ubicacion_id IS NOT NULL AND variante_id IS NOT NULL
				UNION ALL SELECT origen_ubicacion_id, variante_id, NULL, NULL, -piezas
				FROM movimiento_lineas WHERE origen_ubicacion_id IS NOT NULL AND variante_id IS NOT NULL
				UNION ALL SELECT destino_ubicacion_id, NULL, material_id, rollo_id, cantidad
				FROM movimiento_lineas WHERE destino_ubicacion_id IS NOT NULL AND material_id IS NOT NULL
				UNION ALL SELECT origen_ubicacion_id, NULL, material_id, rollo_id, -cantidad
				FROM movimiento_lineas WHERE origen_ubicacion_id IS NOT NULL AND material_id IS NOT NULL
			), suma AS (SELECT u, v, m, r, sum(c) AS c FROM libro GROUP BY 1, 2, 3, 4),
			guardada AS (
				SELECT ubicacion_id AS u, variante_id AS v, NULL::uuid AS m, NULL::uuid AS r, piezas::numeric AS c FROM existencias
				UNION ALL SELECT ubicacion_id, NULL, material_id, rollo_id, cantidad FROM existencias_material
			)
			SELECT * FROM guardada g FULL JOIN suma s ON s.u = g.u AND s.v IS NOT DISTINCT FROM g.v
				AND s.m IS NOT DISTINCT FROM g.m AND s.r IS NOT DISTINCT FROM g.r
			WHERE coalesce(g.c, 0) <> coalesce(s.c, 0)`);
		return rows;
	}

	/** Las excepciones de un cuadre, como «lugar → guardada menos libro», en piezas o milésimos. */
	async function excepcionesDe(cuadre: CuadreCorrido): Promise<Map<string, number>> {
		if ("yaCorrio" in cuadre) throw new Error("el cuadre ya había corrido");
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, ubicacion_id, variante_id, datos FROM excepciones WHERE cuadre_id = $1",
			[cuadre.cuadreId],
		);
		const codigoDe = new Map(Object.entries(ubicacion).map(([codigo, id]) => [id, codigo]));
		return new Map(
			rows.map((fila) => {
				expect(fila.tipo).toBe("cuadre_proyeccion");
				const cosa =
					fila.variante_id !== null
						? variantes.indexOf(fila.variante_id)
						: 3 + materiales.findIndex((material) => material.materialId === fila.datos.material_id);
				const diferencia =
					fila.variante_id !== null
						? fila.datos.guardada - fila.datos.libro
						: Math.round((Number(fila.datos.guardada) - Number(fila.datos.libro)) * 1000);
				return [`${cosa}:${codigoDe.get(fila.ubicacion_id)}`, diferencia];
			}),
		);
	}

	it("alteraciones y movimientos al azar, con el cuadre y otra conexión al mismo tiempo", async () => {
		await fc.assert(
			fc.asyncProperty(corrida, async ({ alteraciones, movimientos }) => {
				for (const suya of alteraciones) await alterar(suya);
				dia = dia.add({ days: 1 });
				const errores: unknown[] = [];
				const [cuadre] = await Promise.all([
					cuadrar(dia.toString()),
					(async () => {
						for (const suyo of movimientos)
							await mover(suyo).catch((error: unknown) => errores.push(codigoDePostgres(error) ?? error));
					})(),
				]);
				expect(errores).toEqual([]);
				expect(await descuadres()).toEqual([]);
				expect(Object.fromEntries(await excepcionesDe(cuadre))).toEqual(
					Object.fromEntries(
						alteraciones.map((suya) => [`${suya.lugar.cosa}:${suya.lugar.ubicacion}`, suya.diferencia]),
					),
				);
				// El paso 5: cada negativo sin explicar abrió su DF- del cuadre, con lo que halló (negativo).
				const { rows: abiertas } = await servidor.base.dueno.query(
					"SELECT origen, coalesce(piezas, cantidad)::numeric AS cuanto FROM diferencias WHERE cuadre_id = $1",
					["yaCorrio" in cuadre ? "" : cuadre.cuadreId],
				);
				for (const abierta of abiertas) expect([abierta.origen, Number(abierta.cuanto) < 0]).toEqual(["cuadre", true]);
				expect(cuadre).toMatchObject({
					estado: alteraciones.length > 0 || abiertas.length > 0 ? "con_residuo" : "cuadro",
				});
			}),
			{ numRuns: 40 },
		);
	});
});
