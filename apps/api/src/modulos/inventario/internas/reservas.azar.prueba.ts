/**
 * Prueba con datos al azar de las reservas: varias conexiones a la vez meten piezas a Bodega, apartan para pedidos
 * externos y liberan todo o una parte. Nunca se aparta en Bodega más de lo que hay, lo apartado es siempre lo que
 * cada conexión apartó menos lo que liberó, y ninguna se corta por un bloqueo: cada paso corre en su propia
 * transacción, sin el reintento del núcleo.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 3)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearContexto } from "../../../nucleo/acciones/corredor.ts";
import { type Base, crearBase } from "../../../nucleo/base/conexion.ts";
import { codigoDePostgres } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";

/** Lo que hace una conexión en un paso: meter piezas, apartar un pedido nuevo, o liberar uno suyo (todo o una parte). */
const paso = fc.oneof(
	fc.record({
		hace: fc.constant("meter" as const),
		variante: fc.integer({ min: 0, max: 1 }),
		piezas: fc.integer({ min: 1, max: 4 }),
	}),
	fc.record({
		hace: fc.constant("apartar" as const),
		renglones: fc.uniqueArray(
			fc.record({ variante: fc.integer({ min: 0, max: 1 }), piezas: fc.integer({ min: 1, max: 5 }) }),
			{ minLength: 1, maxLength: 2, selector: (renglon) => renglon.variante },
		),
	}),
	fc.record({
		hace: fc.constant("liberar" as const),
		cual: fc.nat(),
		parte: fc.option(fc.integer({ min: 1, max: 5 })),
	}),
);

/** Un paso ya generado. */
type Paso = typeof paso extends fc.Arbitrary<infer T> ? T : never;

/** Lo que cada conexión lleva apartado: por pedido, las piezas de cada variante. */
type Apartado = Map<string, Map<number, number>>;

describe("Con reservas al azar y varias conexiones al mismo tiempo, nunca se aparta de más en Bodega y lo apartado cuadra con lo pedido", () => {
	let servidor: ServidorDePrueba;
	let base: Base;
	let bodega: string;
	let variantes: string[];
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		base = crearBase(servidor.base.app);
		bodega = (await ubicacionesPorCodigo(servidor)).BOD ?? "";
		variantes = await variantesLibres(servidor, 2);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre algo en su propia transacción, sin el reintento del núcleo: un `40P01` sale como error. */
	function sinReintento<T>(hacer: (contexto: ContextoDeAccion) => Promise<T>): Promise<T> {
		return base.transaction((transaccion) =>
			hacer(
				crearContexto(
					servidor.modulos,
					transaccion,
					{ tipo: "sistema", trabajo: "prueba.azar" },
					"prueba.azar",
					Temporal.Now.instant(),
					undefined,
				).contexto,
			),
		);
	}

	/**
	 * Hace un paso y anota lo que apartó o liberó la conexión.
	 * @returns El error que no se esperaba, si lo hubo (`sin_libres` sí se espera).
	 */
	async function hacer(suyo: Paso, apartado: Apartado): Promise<unknown> {
		try {
			if (suyo.hace === "meter") {
				await sinReintento((contexto) =>
					escribirMovimiento(contexto, {
						tipo: "ajuste",
						documento: { tipo: "ajuste", id: uuidv7() },
						renglones: [
							{ origen: null, destino: bodega, varianteId: variantes[suyo.variante] ?? "", piezas: suyo.piezas },
						],
						clave: uuidv7(),
					}),
				);
			} else if (suyo.hace === "apartar") {
				const pedido = await pedidoDePrueba(servidor);
				await sinReintento((contexto) =>
					contexto.interna("inventario.reservar", {
						motivo: "pedido_externo",
						pedido_id: pedido,
						renglones: suyo.renglones.map((renglon) => ({
							variante_id: variantes[renglon.variante],
							piezas: renglon.piezas,
						})),
					}),
				);
				apartado.set(pedido, new Map(suyo.renglones.map((renglon) => [renglon.variante, renglon.piezas])));
			} else {
				await liberar(suyo, apartado);
			}
			return undefined;
		} catch (error) {
			if (error instanceof ErrorDeApi && error.cuerpo().codigo === "sin_libres") return undefined;
			return codigoDePostgres(error) ?? error;
		}
	}

	/** Libera un pedido de la conexión: todo, o unas piezas de una de sus variantes. */
	async function liberar(suyo: Extract<Paso, { hace: "liberar" }>, apartado: Apartado) {
		const pedidos = [...apartado.keys()];
		const pedido = pedidos[suyo.cual % Math.max(pedidos.length, 1)];
		const suyas = pedido === undefined ? undefined : apartado.get(pedido);
		if (pedido === undefined || suyas === undefined) return;
		const [variante, tiene] = [...suyas.entries()][0] ?? [0, 0];
		const piezas = suyo.parte === null ? undefined : Math.min(suyo.parte, tiene);
		await sinReintento((contexto) =>
			contexto.interna("inventario.liberar_reservas", {
				motivo: "pedido_externo",
				documento_id: pedido,
				motivo_fin: "quitada_del_pedido",
				documento_cancelado: false,
				...(piezas === undefined ? {} : { piezas: [{ variante_id: variantes[variante], piezas }] }),
			}),
		);
		if (piezas === undefined || piezas === tiene) suyas.delete(variante);
		else suyas.set(variante, tiene - piezas);
		if (piezas === undefined || suyas.size === 0) apartado.delete(pedido);
	}

	/** Por variante: lo que hay en Bodega y lo apartado en las reservas activas. */
	async function enBodega(): Promise<{ hay: number; apartado: number }[]> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.id,
				coalesce((SELECT piezas FROM existencias WHERE ubicacion_id = $1 AND variante_id = v.id), 0)::int AS hay,
				coalesce((SELECT sum(piezas) FROM reservas WHERE estado = 'activa' AND ubicacion_id = $1 AND variante_id = v.id), 0)::int AS apartado
			 FROM unnest($2::uuid[]) AS v(id) ORDER BY array_position($2::uuid[], v.id)`,
			[bodega, variantes],
		);
		return rows.map((fila) => ({ hay: fila.hay, apartado: fila.apartado }));
	}

	it("cuatro conexiones a la vez, cada una con su lista de pasos al azar", async () => {
		const apartados: Apartado[] = [new Map(), new Map(), new Map(), new Map()];
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.array(paso, { maxLength: 8 }), { minLength: 4, maxLength: 4 }),
				async (conexiones) => {
					const errores: unknown[] = [];
					await Promise.all(
						conexiones.map(async (pasos, numero) => {
							const apartado = apartados[numero] ?? new Map();
							for (const suyo of pasos) {
								const error = await hacer(suyo, apartado);
								if (error !== undefined) errores.push(error);
							}
						}),
					);
					expect(errores).toEqual([]);
					const esperado = [0, 1].map((variante) =>
						apartados
							.flatMap((apartado) => [...apartado.values()])
							.reduce((suma, suyas) => suma + (suyas.get(variante) ?? 0), 0),
					);
					const hoy = await enBodega();
					expect(hoy.map((variante) => variante.apartado)).toEqual(esperado);
					for (const variante of hoy) expect(variante.apartado).toBeLessThanOrEqual(variante.hay);
				},
			),
			{ numRuns: 40 },
		);
		// La prueba no pasa en vacío: hubo reservas activas, liberadas y partidas al liberar una parte.
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, count(*)::int AS n FROM reservas WHERE variante_id = ANY($1) GROUP BY estado ORDER BY estado",
			[variantes],
		);
		expect(rows.map((fila) => fila.estado)).toEqual(["activa", "liberada", "transferida"]);
	});
});
