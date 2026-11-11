/**
 * Prueba de los traspasos: la tabla de transiciones, lo que pone cada estado, los CHECK de la tabla y la vista
 * `partidas_aduana`.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 2)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevoTraspaso, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import type { EstadoDeTraspaso } from "../tablas.ts";
import { cambiarEstadoTraspaso, crearTraspaso, transicionesDeTraspaso } from "./traspasos.ts";

describe("Una transición de estado que no está en la tabla de traspasos es un error; la vista `partidas_aduana` da lo que queda en aduana y su antigüedad", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let variante: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		variante = (await servidor.base.dueno.query("SELECT id FROM variantes LIMIT 1")).rows[0]?.id;
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pasa un traspaso a otro estado. */
	function cambiar(traspasoId: string, estado: EstadoDeTraspaso, motivo?: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			cambiarEstadoTraspaso(contexto, traspasoId, estado, motivo === undefined ? undefined : { motivo }),
		);
	}

	/** Un surtido de Bodega a la Tienda 1, en camino a aduana. */
	function surtido() {
		return nuevoTraspaso(servidor, {
			tipo: "solicitud_tienda",
			estado: "en_camino_aduana",
			origen: { ubicacionId: ubicacion.BOD ?? "" },
			destino: { ubicacionId: ubicacion.T1 ?? "" },
			renglones: [{ varianteId: variante, piezas: 12 }],
		});
	}

	/** Un traspaso por id, con lo que importa. */
	async function leer(traspasoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT folio, estado, enviado_en IS NOT NULL AS enviado, llego_aduana_en IS NOT NULL AS llego,
				terminado_en IS NOT NULL AS terminado, motivo_cancelacion FROM traspasos WHERE id = $1`,
			[traspasoId],
		);
		return rows[0];
	}

	it("de camino a aduana, a tránsito y recibido; cada paso pone su hora y el final, `terminado_en`", async () => {
		const { traspasoId, folio } = await surtido();
		expect(folio).toMatch(/^A-\d{2,}$/);
		expect(await leer(traspasoId)).toMatchObject({ estado: "en_camino_aduana", enviado: true, llego: false });
		await cambiar(traspasoId, "en_aduana");
		expect(await leer(traspasoId)).toMatchObject({ estado: "en_aduana", llego: true, terminado: false });
		await cambiar(traspasoId, "en_transito");
		await cambiar(traspasoId, "recibido");
		expect(await leer(traspasoId)).toMatchObject({ estado: "recibido", terminado: true });
		// De un estado final ya no se sale.
		await expect(cambiar(traspasoId, "en_transito")).rejects.toThrow("no pasa de recibido a en_transito");
	});

	it("una transición que no está en la tabla es un error y no cambia nada; cancelar pide su motivo", async () => {
		const { traspasoId } = await surtido();
		await expect(cambiar(traspasoId, "recibido")).rejects.toThrow("no pasa de en_camino_aduana a recibido");
		await expect(cambiar(traspasoId, "en_transito")).rejects.toThrow("no pasa de en_camino_aduana a en_transito");
		expect(await leer(traspasoId)).toMatchObject({ estado: "en_camino_aduana" });
		await expect(cambiar(traspasoId, "cancelado")).rejects.toThrow("cancelar pide su motivo");
		await cambiar(traspasoId, "cancelado", "La tienda canceló la salida");
		expect(await leer(traspasoId)).toMatchObject({
			estado: "cancelado",
			terminado: true,
			motivo_cancelacion: "La tienda canceló la salida",
		});
		// Toda transición posible sale de la tabla: cada estado final no tiene salida.
		for (const final of ["recibido", "con_diferencia", "salio", "repartido", "cancelado"] as const) {
			expect(transicionesDeTraspaso[final]).toEqual([]);
		}
	});

	it("los CHECK: un destino que no se decide después no puede faltar; `esperado` solo en devoluciones", async () => {
		const insertar = (tipo: string, estado: string, destino: string | null) =>
			servidor.base.dueno.query(
				"INSERT INTO traspasos (id, folio, tipo, origen_ubicacion_id, destino_ubicacion_id, estado) VALUES ($1, $2, $3, $4, $5, $6)",
				[uuidv7(), `X-${uuidv7()}`, tipo, ubicacion.BOD, destino, estado],
			);
		await expect(insertar("reabasto", "en_camino_aduana", null)).rejects.toMatchObject({ code: "23514" });
		await expect(insertar("reabasto", "esperado", ubicacion.T1 ?? null)).rejects.toMatchObject({ code: "23514" });
		await insertar("otro_de_tienda", "en_camino_aduana", null);
		// Lo de más rechazado que espera en Bodega para regresar al proveedor.
		await servidor.base.dueno.query(
			"INSERT INTO traspasos (id, folio, tipo, origen_ubicacion_id, destino_externo, estado) VALUES ($1, $2, 'devolucion_proveedor', $3, 'proveedor', 'esperado')",
			[uuidv7(), `X-${uuidv7()}`, ubicacion.BOD],
		);
	});

	it("la vista da por renglón lo que queda en aduana, sus horas, su color y si sale hoy o mañana", async () => {
		const hoy = (
			await servidor.base.dueno.query("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS hoy")
		).rows[0]?.hoy;
		const crear = (horasAtras: number, fecha: string | null) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				crearTraspaso(contexto, {
					tipo: "lote_temporada",
					estado: "en_aduana",
					origen: { ubicacionId: ubicacion.TAL ?? "" },
					destino: { ubicacionId: ubicacion.BOD ?? "" },
					renglones: [
						{ varianteId: variante, piezas: 10 },
						{ materialId: uuidv7(), cantidad: "4.250" },
					],
					llegoAduanaEn: contexto.ahora.subtract({ hours: horasAtras }).toString(),
					fechaSalidaEsperada: fecha,
				}),
			);
		const verde = await crear(1, null);
		const ambar = await crear(50, hoy);
		const rojo = await crear(80, null);
		const { rows } = await servidor.base.dueno.query(
			`SELECT traspaso_id, renglon, piezas, cantidad, color, sale, horas_en_aduana::float AS horas
			 FROM partidas_aduana WHERE traspaso_id = ANY($1::uuid[]) ORDER BY horas_en_aduana, renglon`,
			[[verde.traspasoId, ambar.traspasoId, rojo.traspasoId]],
		);
		expect(
			rows.map((fila) => [fila.traspaso_id, fila.renglon, fila.piezas, fila.cantidad, fila.color, fila.sale]),
		).toEqual([
			[verde.traspasoId, 1, 10, null, "verde", null],
			[verde.traspasoId, 2, null, "4.250", "verde", null],
			[ambar.traspasoId, 1, 10, null, "ambar", "hoy"],
			[ambar.traspasoId, 2, null, "4.250", "ambar", "hoy"],
			[rojo.traspasoId, 1, 10, null, "rojo", null],
			[rojo.traspasoId, 2, null, "4.250", "rojo", null],
		]);
		expect(Math.round(rows[4]?.horas)).toBe(80);
		// Un traspaso que ya salió de aduana no está en la vista.
		await cambiar(rojo.traspasoId, "en_transito");
		const { rows: quedan } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM partidas_aduana WHERE traspaso_id = $1",
			[rojo.traspasoId],
		);
		expect(quedan[0]?.n).toBe(0);
	});
});
