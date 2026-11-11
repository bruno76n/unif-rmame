/**
 * Prueba del orden de los candados en toda una transacción: las variantes, luego los traspasos, luego las
 * existencias. Las dos situaciones que antes se bloqueaban entre sí, sin el reintento del núcleo.
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
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
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

	it("una acción que escribe dos movimientos toma al principio sus candados: no se cruza con otra que mueve las mismas variantes al revés", async () => {
		for (let ronda = 0; ronda < 5; ronda++) {
			const [a = "", b = ""] = await variantesLibres(servidor, 2);
			const errores = await Promise.all([
				sinReintento(async (contexto) => {
					await tomarCandadosDeInventario(contexto.transaccion, { varianteIds: [a, b] });
					await entra(contexto, b);
					await pausa(contexto);
					await entra(contexto, a);
				}),
				sinReintento(async (contexto) => {
					await entra(contexto, a);
					await pausa(contexto);
					await entra(contexto, b);
				}),
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
				[reserva, ubicacion.ADU, variante, uuidv7(), lote.traspasoId],
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
