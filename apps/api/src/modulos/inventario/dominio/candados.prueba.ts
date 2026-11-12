/**
 * Prueba del orden de los candados en toda una transacción: las variantes, luego los traspasos, luego las
 * existencias. Las situaciones que se bloqueaban entre sí, sin el reintento del núcleo.
 * Fase 9 · docs/cimientos/BASE-DE-DATOS.md («Candados») y la decisión 500
 */

import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearContexto } from "../../../nucleo/acciones/corredor.ts";
import { type Base, crearBase } from "../../../nucleo/base/conexion.ts";
import { codigoDePostgres } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedidoLineaDePrueba } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { tomarCandadosDeInventario } from "./candados.ts";
import { escribirMovimiento } from "./escribir-movimiento.ts";
import { cambiarEstadoTraspaso, repartirTraspaso } from "./traspasos.ts";

describe("Con varias conexiones al mismo tiempo no hay bloqueos cruzados: el orden de los candados vale para toda la transacción", () => {
	let servidor: ServidorDePrueba;
	let base: Base;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		base = crearBase(servidor.base.app);
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre algo en su propia transacción, sin el reintento del núcleo; regresa el código de Postgres si falla. */
	async function sinReintento(hacer: (contexto: ContextoDeAccion) => Promise<unknown>): Promise<string | undefined> {
		try {
			await base.transaction(async (transaccion) => {
				const { contexto } = crearContexto(
					servidor.modulos,
					transaccion,
					{ tipo: "sistema", trabajo: "prueba.candados" },
					"prueba.candados",
					Temporal.Now.instant(),
					undefined,
				);
				await hacer(contexto);
			});
			return undefined;
		} catch (error) {
			return codigoDePostgres(error) ?? String(error);
		}
	}

	/** Un ajuste de entrada de una variante. */
	function entra(contexto: ContextoDeAccion, varianteId: string, codigo = "BOD") {
		return escribirMovimiento(contexto, {
			tipo: "ajuste",
			documento: { tipo: "ajuste", id: uuidv7() },
			renglones: [{ origen: null, destino: ubicacion[codigo] ?? "", varianteId, piezas: 1 }],
			clave: uuidv7(),
		});
	}

	/** Una pausa dentro de la transacción, para que la otra llegue a la mitad. */
	function pausa(contexto: ContextoDeAccion) {
		return contexto.transaccion.execute(sql`SELECT pg_sleep(0.2)`);
	}

	it("dos acciones que escriben dos movimientos cada una, en orden contrario, toman al principio sus candados y no se cruzan", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			const [a = "", b = ""] = await variantesLibres(servidor, 2);
			// Cada una escribe en el orden contrario de la otra; sin `tomarCandadosDeInventario`, se cruzarían siempre.
			const dosMovimientos = (primera: string, segunda: string) =>
				sinReintento(async (contexto) => {
					await tomarCandadosDeInventario(contexto.transaccion, { varianteIds: [primera, segunda] });
					await entra(contexto, primera);
					await pausa(contexto);
					await entra(contexto, segunda);
				});
			expect(await Promise.all([dosMovimientos(b, a), dosMovimientos(a, b)])).toEqual([undefined, undefined]);
		}
	});

	it("apartar un W- de lo que hay en aduana reparte el lote sin pedir las demás variantes del lote: no se cruza con un movimiento de esas variantes", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			// Dos variantes del mismo lote; la que se aparta es la mayor, para que pedir la otra invirtiera el orden.
			const [menor = "", mayor = ""] = (await variantesLibres(servidor, 2)).sort();
			await nuevoTraspaso(servidor, {
				tipo: "lote_temporada",
				estado: "en_aduana",
				origen: { ubicacionId: ubicacion.TAL ?? "" },
				destino: { ubicacionId: ubicacion.BOD ?? "" },
				renglones: [
					{ varianteId: menor, piezas: 3 },
					{ varianteId: mayor, piezas: 3 },
				],
			});
			await meterPiezas(servidor, ubicacion.ADU ?? "", menor, 3);
			await meterPiezas(servidor, ubicacion.ADU ?? "", mayor, 3);
			const pedidoLinea = await pedidoLineaDePrueba(servidor);
			const errores = await Promise.all([
				// Un movimiento de las dos, en el orden fijo: toma la menor y espera.
				sinReintento(async (contexto) => {
					await tomarCandadosDeInventario(contexto.transaccion, { varianteIds: [menor] });
					await pausa(contexto);
					await escribirMovimiento(contexto, {
						tipo: "ajuste",
						documento: { tipo: "ajuste", id: uuidv7() },
						renglones: [menor, mayor].map((varianteId) => ({
							origen: null,
							destino: ubicacion.T2 ?? "",
							varianteId,
							piezas: 1,
						})),
						clave: uuidv7(),
					});
				}),
				// El W- de la mayor: sin pieza en Bodega, se aparta de la aduana y se reparte en un hijo.
				sinReintento((contexto) =>
					contexto.interna("inventario.reservar", {
						motivo: "pedido_linea",
						pedido_linea_id: pedidoLinea,
						renglones: [{ variante_id: mayor, piezas: 2 }],
					}),
				),
			]);
			expect(errores).toEqual([undefined, undefined]);
		}
	});

	it("cambiar el estado de un traspaso y escribir su movimiento no se cruza con repartirlo llevándose sus reservas", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			const [variante = ""] = await variantesLibres(servidor, 1);
			const lote = await nuevoTraspaso(servidor, {
				tipo: "lote_temporada",
				estado: "en_aduana",
				origen: { ubicacionId: ubicacion.TAL ?? "" },
				destino: { ubicacionId: ubicacion.BOD ?? "" },
				renglones: [{ varianteId: variante, piezas: 6 }],
			});
			await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 6);
			const { rows } = await servidor.base.dueno.query("SELECT id FROM traspaso_lineas WHERE traspaso_id = $1", [
				lote.traspasoId,
			]);
			const reserva = uuidv7();
			await servidor.base.dueno.query(
				`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, traspaso_id, estado)
				 VALUES ($1, $2, $3, 2, 'pedido_externo', $4, $5, 'activa')`,
				[reserva, ubicacion.ADU, variante, await pedidoDePrueba(servidor), lote.traspasoId],
			);
			const errores = await Promise.all([
				sinReintento(async (contexto) => {
					await cambiarEstadoTraspaso(contexto, lote.traspasoId, "en_transito");
					await pausa(contexto);
					await escribirMovimiento(contexto, {
						tipo: "despacho",
						documento: { tipo: "traspaso", id: lote.traspasoId },
						renglones: [
							{
								origen: ubicacion.ADU ?? "",
								destino: ubicacion.TRA ?? "",
								varianteId: variante,
								piezas: 6,
								traspasoId: lote.traspasoId,
							},
						],
						clave: uuidv7(),
					});
				}),
				sinReintento(async (contexto) => {
					await entra(contexto, variante, "ADU");
					await pausa(contexto);
					await repartirTraspaso(contexto, {
						padreId: lote.traspasoId,
						renglones: [{ lineaId: rows[0]?.id, piezas: 2 }],
						reservaIds: [reserva],
						hijo: { tipo: "pedido_linea", destino: { externo: "cliente_linea" } },
					});
				}),
			]);
			// Ninguna se cortó por bloqueo; la que llegó segunda pudo encontrar el traspaso ya fuera de aduana.
			expect(errores.filter((error) => error === "40P01")).toEqual([]);
		}
	});
});
