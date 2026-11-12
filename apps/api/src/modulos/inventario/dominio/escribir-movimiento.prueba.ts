/**
 * Prueba de `escribirMovimiento` y `revertirMovimiento`: el renglón y la existencia en la misma transacción, los
 * caminos de cada tipo, la existencia negativa, las claves derivadas y la reversión única; y las lecturas de las
 * existencias.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 1)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { materialesDePrueba, rollosDePrueba } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { llaveDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { nuevoTraspaso, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { claveDerivada, escribirMovimiento, revertirMovimiento } from "./escribir-movimiento.ts";

describe("el libro de movimientos", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let variantes: string[];
	let traspaso: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = Object.fromEntries(
			(await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones")).rows.map((fila) => [
				fila.codigo,
				fila.id,
			]),
		);
		// Variantes de la muestra del catálogo sin existencias ni reservas (la muestra ya tiene piezas en el Taller).
		variantes = await variantesLibres(servidor, 6);
		// El traspaso que llevan los renglones que tocan Tránsito.
		({ traspasoId: traspaso } = await nuevoTraspaso(servidor, {
			tipo: "solicitud_tienda",
			estado: "en_camino_aduana",
			origen: { ubicacionId: ubicacion.BOD ?? "" },
			destino: { ubicacionId: ubicacion.T1 ?? "" },
			renglones: [{ varianteId: variante(1), piezas: 2 }],
		}));
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre algo con el contexto de una acción. */
	function enAccion<T>(hacer: (contexto: ContextoDeAccion) => Promise<T>): Promise<T> {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, hacer);
	}

	/** La existencia de una variante en una ubicación. */
	async function existencia(codigo: string, varianteId: string): Promise<number | undefined> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT piezas FROM existencias WHERE ubicacion_id = $1 AND variante_id = $2",
			[ubicacion[codigo], varianteId],
		);
		return rows[0]?.piezas;
	}

	/** La variante número `n`. */
	function variante(n: number): string {
		const id = variantes[n];
		if (id === undefined) throw new Error("faltan variantes de la muestra");
		return id;
	}

	it("Un movimiento escribe sus renglones y suma la existencia en la misma transacción; si algo falla, no queda nada", async () => {
		const ocurrido = Temporal.Instant.from("2026-11-11T05:30:00Z");
		const escrito = await enAccion((contexto) =>
			escribirMovimiento(contexto, {
				tipo: "carga_inicial",
				documento: { tipo: "carga_inicial", id: uuidv7(), folio: "CI-1" },
				renglones: [
					{ origen: null, destino: ubicacion.BOD ?? "", varianteId: variante(0), piezas: 10 },
					{ origen: null, destino: ubicacion.ADU ?? "", varianteId: variante(0), piezas: 3 },
				],
				ocurridoEn: ocurrido,
				clave: uuidv7(),
			}),
		);
		expect(escrito).toMatchObject({ nuevo: true, tablas: ["movimientos", "movimiento_lineas", "existencias"] });
		expect(await existencia("BOD", variante(0))).toBe(10);
		expect(await existencia("ADU", variante(0))).toBe(3);
		const { rows } = await servidor.base.dueno.query(
			"SELECT fecha::text, documento_folio, (SELECT count(*)::int FROM movimiento_lineas WHERE movimiento_id = m.id) AS renglones FROM movimientos m WHERE id = $1",
			[escrito.movimientoId],
		);
		// Las 23:30 del 10 de noviembre en México son el 11 a las 05:30 UTC: el día de negocio es el 10.
		expect(rows[0]).toEqual({ fecha: "2026-11-10", documento_folio: "CI-1", renglones: 2 });
		const { rows: ultimos } = await servidor.base.dueno.query(
			"SELECT ultimo_movimiento_id FROM existencias WHERE variante_id = $1 AND ubicacion_id = $2",
			[variante(0), ubicacion.BOD],
		);
		expect(ultimos[0]?.ultimo_movimiento_id).toBe(escrito.movimientoId);

		// Si la acción falla después, no queda nada: ni el movimiento ni la suma.
		const clave = uuidv7();
		await expect(
			enAccion(async (contexto) => {
				await escribirMovimiento(contexto, {
					tipo: "ajuste",
					documento: { tipo: "ajuste", id: uuidv7() },
					renglones: [{ origen: null, destino: ubicacion.BOD ?? "", varianteId: variante(0), piezas: 50 }],
					clave,
				});
				throw new Error("falla después");
			}),
		).rejects.toThrow("falla después");
		expect(await existencia("BOD", variante(0))).toBe(10);
		const { rows: nada } = await servidor.base.dueno.query("SELECT 1 FROM movimientos WHERE clave_idempotencia = $1", [
			clave,
		]);
		expect(nada).toEqual([]);
	});

	it("Un renglón que no va del origen al destino de su tipo, o que toca Tránsito o En camino a aduana sin su traspaso, no se escribe", async () => {
		const intentar = (
			renglon: Parameters<typeof escribirMovimiento>[1]["renglones"][number],
			tipo = "despacho" as const,
		) =>
			enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo,
					documento: { tipo: "despacho", id: uuidv7() },
					renglones: [renglon],
					clave: uuidv7(),
				}),
			);
		// Un despacho sale de Aduana, no de Bodega.
		await expect(
			intentar({
				origen: ubicacion.BOD ?? "",
				destino: ubicacion.TRA ?? "",
				varianteId: variante(1),
				piezas: 1,
				traspasoId: traspaso,
			}),
		).rejects.toThrow("despacho no va de bodega a transito");
		// A Tránsito, sin su traspaso.
		await expect(
			intentar({ origen: ubicacion.ADU ?? "", destino: ubicacion.TRA ?? "", varianteId: variante(1), piezas: 1 }),
		).rejects.toThrow("lleva su traspaso");
		// Una venta de tienda no lleva material.
		await expect(
			enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo: "venta_tienda",
					documento: { tipo: "venta_tienda", id: uuidv7() },
					renglones: [{ origen: ubicacion.T1 ?? "", destino: null, materialId: uuidv7(), cantidad: "1.000" }],
					clave: uuidv7(),
				}),
			),
		).rejects.toThrow("tipo de material");
		// Piezas en cero.
		await expect(
			enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo: "venta_tienda",
					documento: { tipo: "venta_tienda", id: uuidv7() },
					renglones: [{ origen: ubicacion.T1 ?? "", destino: null, varianteId: variante(1), piezas: 0 }],
					clave: uuidv7(),
				}),
			),
		).rejects.toThrow("piezas enteras");
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM existencias WHERE variante_id = $1",
			[variante(1)],
		);
		expect(rows[0]?.n).toBe(0);
		// Con su traspaso, sí.
		await intentar({
			origen: ubicacion.ADU ?? "",
			destino: ubicacion.TRA ?? "",
			varianteId: variante(1),
			piezas: 2,
			traspasoId: traspaso,
		});
		expect(await existencia("TRA", variante(1))).toBe(2);
	});

	it("Nunca se rechaza por existencia: queda negativa", async () => {
		await enAccion((contexto) =>
			escribirMovimiento(contexto, {
				tipo: "venta_tienda",
				documento: { tipo: "venta_tienda", id: uuidv7() },
				renglones: [{ origen: ubicacion.T1 ?? "", destino: null, varianteId: variante(2), piezas: 5 }],
				clave: uuidv7(),
			}),
		);
		expect(await existencia("T1", variante(2))).toBe(-5);
	});

	it("La misma acción repetida no duplica un movimiento, también cuando crea varios con claves derivadas", async () => {
		const clave = uuidv7();
		const datos = { ubicacion_id: ubicacion.BOD, variante_id: variante(3), piezas: 4, repetir: true };
		const respuesta = await mandarAccion(servidor, "prueba.mover_inventario", { clave, datos });
		expect(respuesta.estado).toBe(200);
		const { movimiento_ids: ids } = respuesta.cuerpo.resultado as { movimiento_ids: string[] };
		// Pidió cuatro, pero el tercero y el cuarto son los mismos dos.
		expect(ids).toHaveLength(4);
		expect(ids.slice(2)).toEqual(ids.slice(0, 2));
		const { rows } = await servidor.base.dueno.query(
			"SELECT clave_idempotencia FROM movimientos WHERE id = ANY($1::uuid[]) ORDER BY clave_idempotencia",
			[ids.slice(0, 2)],
		);
		expect(rows.map((fila) => fila.clave_idempotencia)).toEqual(
			[claveDerivada(clave, "ajuste", 1), claveDerivada(clave, "ajuste", 2)].sort(),
		);
		expect(await existencia("BOD", variante(3))).toBe(8);
		// La acción completa otra vez, con la misma clave: el corredor contesta lo mismo y nada se duplica.
		const otraVez = await mandarAccion(servidor, "prueba.mover_inventario", { clave, datos });
		expect(otraVez.cuerpo.resultado).toEqual(respuesta.cuerpo.resultado);
		expect(await existencia("BOD", variante(3))).toBe(8);
		// Y escribirlo directo con una clave ya usada regresa el que estaba…
		const repetido = await enAccion((contexto) =>
			escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: ubicacion.BOD ?? "" },
				renglones: [{ origen: null, destino: ubicacion.BOD ?? "", varianteId: variante(3), piezas: 4 }],
				clave: claveDerivada(clave, "ajuste", 1),
			}),
		);
		expect(repetido).toEqual({ movimientoId: ids[0], nuevo: false, tablas: [] });
		// …pero otro movimiento con esa clave (otro tipo u otro documento) es un error, no se pierde en silencio.
		await expect(
			enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo: "carga_inicial",
					documento: { tipo: "carga_inicial", id: uuidv7() },
					renglones: [{ origen: null, destino: ubicacion.BOD ?? "", varianteId: variante(3), piezas: 7 }],
					clave: claveDerivada(clave, "ajuste", 1),
				}),
			),
		).rejects.toThrow("ya es de otro movimiento");
		expect(await existencia("BOD", variante(3))).toBe(8);
	});

	it("Un movimiento se revierte una sola vez, con los renglones al revés", async () => {
		const original = await enAccion((contexto) =>
			escribirMovimiento(contexto, {
				tipo: "despacho",
				documento: { tipo: "despacho", id: uuidv7(), folio: "D-1" },
				renglones: [
					{
						origen: ubicacion.ADU ?? "",
						destino: ubicacion.TRA ?? "",
						varianteId: variante(4),
						piezas: 7,
						traspasoId: traspaso,
					},
				],
				clave: uuidv7(),
			}),
		);
		expect([await existencia("ADU", variante(4)), await existencia("TRA", variante(4))]).toEqual([-7, 7]);
		const reversion = await enAccion((contexto) =>
			revertirMovimiento(contexto, { movimientoId: original.movimientoId, clave: uuidv7() }),
		);
		expect([await existencia("ADU", variante(4)), await existencia("TRA", variante(4))]).toEqual([0, 0]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT m.tipo, m.revierte_movimiento_id, m.documento_folio, l.origen_ubicacion_id, l.destino_ubicacion_id, l.traspaso_id IS NOT NULL AS con_traspaso
			 FROM movimientos m JOIN movimiento_lineas l ON l.movimiento_id = m.id WHERE m.id = $1`,
			[reversion.movimientoId],
		);
		expect(rows).toEqual([
			{
				tipo: "reversion",
				revierte_movimiento_id: original.movimientoId,
				documento_folio: "D-1",
				origen_ubicacion_id: ubicacion.TRA,
				destino_ubicacion_id: ubicacion.ADU,
				con_traspaso: true,
			},
		]);
		await expect(
			enAccion((contexto) => revertirMovimiento(contexto, { movimientoId: original.movimientoId, clave: uuidv7() })),
		).rejects.toThrow("ya se revirtió");
		await expect(
			enAccion((contexto) => revertirMovimiento(contexto, { movimientoId: reversion.movimientoId, clave: uuidv7() })),
		).rejects.toThrow("una reversión no se revierte");
	});

	it("el material se suma en su unidad sin perder un milésimo; las lecturas de material y de piezas", async () => {
		const [material = ""] = await materialesDePrueba(servidor, 1, "tela");
		const [rollo = ""] = await rollosDePrueba(servidor, material, 1);
		for (const [cantidad, rolloId] of [
			["12.500", rollo],
			["0.125", rollo],
			["3.000", null],
		] as const) {
			await enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo: "carga_inicial",
					documento: { tipo: "carga_inicial", id: uuidv7() },
					renglones: [{ origen: null, destino: ubicacion.BOD ?? "", materialId: material, rolloId, cantidad }],
					clave: uuidv7(),
				}),
			);
		}
		expect(
			await enAccion((contexto) =>
				contexto.lectura("inventario.existencia_material", { material_id: material, ubicacion_id: ubicacion.BOD }),
			),
		).toMatchObject({ cantidad: "15.625" });
		// En todas: la suma, y dónde hay (lo que se movió de Bodega a Aduana).
		await enAccion((contexto) =>
			escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: [
					{ origen: null, destino: ubicacion.ADU ?? "", materialId: material, rolloId: null, cantidad: "1.000" },
				],
				clave: uuidv7(),
			}),
		);
		expect(
			await enAccion((contexto) => contexto.lectura("inventario.existencia_material", { material_id: material })),
		).toEqual({
			cantidad: "16.625",
			por_ubicacion: [
				{ ubicacion_id: ubicacion.ADU, ubicacion: expect.any(String), cantidad: "1.000" },
				{ ubicacion_id: ubicacion.BOD, ubicacion: expect.any(String), cantidad: "15.625" },
			],
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT rollo_id, cantidad FROM existencias_material WHERE material_id = $1 AND ubicacion_id = $2 ORDER BY cantidad",
			[material, ubicacion.BOD],
		);
		expect(rows).toEqual([
			{ rollo_id: null, cantidad: "3.000" },
			{ rollo_id: rollo, cantidad: "12.625" },
		]);
		// Las piezas de una variante: solo lo que no es cero, también lo negativo, en el orden de las ubicaciones.
		const piezas = await enAccion((contexto) =>
			contexto.lectura("inventario.piezas_de_variante", { variante_id: variante(0), bloquear: true }),
		);
		expect(piezas).toEqual({
			existencias: [
				{ ubicacion_id: ubicacion.ADU, ubicacion: "Aduana", piezas: 3 },
				{ ubicacion_id: ubicacion.BOD, ubicacion: "Bodega", piezas: 10 },
			],
			reservas: [],
		});
	});

	it("Una reserva viaja con su pieza en cada movimiento: cambia de lugar, deja su traspaso al llegar y se cumple al salir con una entrega; una pérdida no la toca", async () => {
		const [suya = ""] = await variantesLibres(servidor, 1);
		const { traspasoId } = await nuevoTraspaso(servidor, {
			tipo: "reabasto",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.BOD ?? "" },
			destino: { ubicacionId: ubicacion.T1 ?? "" },
			renglones: [{ varianteId: suya, piezas: 5 }],
		});
		const pedido = await pedidoDePrueba(servidor);
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, traspaso_id, estado)
			 VALUES ($1, $2, $3, 5, 'pedido_externo', $4, $5, 'activa')`,
			[uuidv7(), ubicacion.ADU, suya, pedido, traspasoId],
		);
		const mover = (
			tipo: "despacho" | "recepcion_despacho" | "entrega_cliente_externo" | "ajuste",
			de: string,
			a: string | null,
			piezas: number,
		) =>
			enAccion((contexto) =>
				escribirMovimiento(contexto, {
					tipo,
					documento: { tipo: "traspaso", id: traspasoId },
					renglones: [
						{
							origen: ubicacion[de] ?? "",
							destino: a === null ? null : (ubicacion[a] ?? ""),
							varianteId: suya,
							piezas,
							traspasoId,
						},
					],
					clave: uuidv7(),
				}),
			);
		const activas = async () =>
			(
				await servidor.base.dueno.query(
					`SELECT u.codigo, r.piezas, r.traspaso_id IS NOT NULL AS con_traspaso FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id
					 WHERE r.pedido_id = $1 AND r.estado = 'activa' ORDER BY u.codigo`,
					[pedido],
				)
			).rows;
		expect((await mover("despacho", "ADU", "TRA", 5)).tablas).toContain("reservas");
		expect(await activas()).toEqual([{ codigo: "TRA", piezas: 5, con_traspaso: true }]);
		// Llegan 3 a la tienda, el destino del traspaso: esas dejan el traspaso; 2 siguen en Tránsito.
		await mover("recepcion_despacho", "TRA", "T1", 3);
		expect(await activas()).toEqual([
			{ codigo: "T1", piezas: 3, con_traspaso: false },
			{ codigo: "TRA", piezas: 2, con_traspaso: true },
		]);
		// Una pérdida en el camino no la cumple ni la parte: la reserva se queda entera donde estaba.
		const cuantas = async () =>
			(await servidor.base.dueno.query("SELECT count(*)::int AS n FROM reservas WHERE pedido_id = $1", [pedido]))
				.rows[0]?.n;
		const antes = await cuantas();
		await mover("ajuste", "TRA", null, 1);
		expect(await activas()).toEqual([
			{ codigo: "T1", piezas: 3, con_traspaso: false },
			{ codigo: "TRA", piezas: 2, con_traspaso: true },
		]);
		expect(await cuantas()).toBe(antes);
		// Las 2 que quedaban salen a Fuera con la entrega: se cumplen con el movimiento.
		const salida = await mover("entrega_cliente_externo", "TRA", null, 2);
		expect(await activas()).toEqual([{ codigo: "T1", piezas: 3, con_traspaso: false }]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT piezas, motivo_fin FROM reservas WHERE pedido_id = $1 AND estado = 'consumida' AND consumida_por_movimiento_id = $2",
			[pedido, salida.movimientoId],
		);
		expect(rows).toEqual([{ piezas: 2, motivo_fin: "cumplida" }]);
	});

	it("por la cola de la tablet también: la tanda se aplica, y repetirla (o un comando que llega dos veces) no duplica sus movimientos", async () => {
		const [suya = ""] = await variantesLibres(servidor, 1);
		const comando = {
			clave_idempotencia: uuidv7(),
			accion: "prueba.mover_inventario",
			datos: { ubicacion_id: ubicacion.TAL, variante_id: suya, piezas: 3, repetir: true },
			ocurrido_en: new Date(Date.now() - 60_000).toISOString(),
		};
		const subir = async (comandos: (typeof comando)[]) =>
			(
				await servidor.app.inject({
					method: "POST",
					url: "/v1/sync/subir",
					headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
					payload: { enviado_en: new Date().toISOString(), pendientes_por_subir: comandos.length, comandos },
				})
			).json();
		const primera = await subir([comando]);
		expect(primera).toMatchObject({ detenido: false, respuestas: [{ resultado: "aplicado" }] });
		const otraVez = await subir([comando, comando]);
		expect(otraVez.respuestas.map((respuesta: { resultado: string }) => respuesta.resultado)).toEqual([
			"repetido",
			"repetido",
		]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT m.clave_idempotencia, c.clave_idempotencia AS del_comando FROM movimientos m
			 JOIN movimiento_lineas l ON l.movimiento_id = m.id JOIN comandos_recibidos c ON c.id = m.comando_id
			 WHERE l.variante_id = $1 ORDER BY m.clave_idempotencia`,
			[suya],
		);
		expect(rows.map((fila) => fila.clave_idempotencia)).toEqual(
			[
				claveDerivada(comando.clave_idempotencia, "ajuste", 1),
				claveDerivada(comando.clave_idempotencia, "ajuste", 2),
			].sort(),
		);
		expect(rows.every((fila) => fila.del_comando === comando.clave_idempotencia)).toBe(true);
		expect(await existencia("TAL", suya)).toBe(6);
	});
});
