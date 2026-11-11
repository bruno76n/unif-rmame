/**
 * Prueba de `inventario.reservar`: nunca se aparta de más en Bodega aunque dos lo pidan a la vez; un pedido en
 * línea se parte en el orden de surtido y, sin pieza, queda reservado en Bodega en negativo.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import {
	llamarInterna,
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("las reservas nacen sin apartar de más", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las libres de una variante en una ubicación. */
	async function libres(codigo: string, varianteId: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT coalesce((SELECT piezas FROM existencias WHERE ubicacion_id = $1 AND variante_id = $2), 0)
				- coalesce((SELECT sum(piezas) FROM reservas WHERE estado = 'activa' AND ubicacion_id = $1 AND variante_id = $2), 0) AS libres`,
			[ubicacion[codigo], varianteId],
		);
		return Number(rows[0]?.libres);
	}

	it("Dos acciones que quieren las últimas piezas de Bodega para un pedido externo: una aparta y la otra recibe `sin_libres`; nunca se aparta de más", async () => {
		// Diez rondas, cada una con su variante: una carrera que se gana por suerte no pasa diez veces.
		for (const variante of await variantesLibres(servidor, 10)) {
			await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
			const apartar = () =>
				llamarInterna(servidor, "inventario.reservar", {
					motivo: "pedido_externo",
					pedido_id: uuidv7(),
					renglones: [{ variante_id: variante, piezas: 4 }],
				}).then(
					() => "aparto",
					(error: unknown) => (error instanceof ErrorDeApi ? error.cuerpo() : error),
				);
			const resultados = await Promise.all([apartar(), apartar()]);
			expect(resultados.filter((resultado) => resultado === "aparto")).toHaveLength(1);
			expect(resultados.find((resultado) => resultado !== "aparto")).toMatchObject({
				codigo: "sin_libres",
				mensaje: expect.stringMatching(/: solo hay 1 libres en bodega$/),
			});
			expect(await libres("BOD", variante)).toBe(1);
		}
	});

	it("un apartado de tienda nunca se rechaza, aunque deje sus libres en negativo", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const apartado = await llamarInterna(servidor, "inventario.reservar", {
			motivo: "apartado_tienda",
			apartado_tienda_id: uuidv7(),
			renglones: [{ variante_id: variante, piezas: 2, ubicacion_id: ubicacion.T1 }],
		});
		expect(apartado).toMatchObject({ renglones: [{ reservas: [{ ubicacion_id: ubicacion.T1, piezas: 2 }] }] });
		expect(await libres("T1", variante)).toBe(-2);
	});

	it("un pedido en línea se parte: primero Bodega, luego lo que en aduana va a Bodega (en un hijo `pedido_linea`), luego la tienda", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 2);
		// Un lote de temporada en aduana con destino a Bodega: 3 piezas.
		const lote = await nuevoTraspaso(servidor, {
			tipo: "lote_temporada",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.TAL ?? "" },
			destino: { ubicacionId: ubicacion.BOD ?? "" },
			renglones: [{ varianteId: variante, piezas: 3 }],
		});
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 3);
		// La Tienda 2 ya sincroniza y surte en línea, con 4 libres.
		await servidor.base.dueno.query("UPDATE ubicaciones SET existencia_desde = now() WHERE codigo = 'T2'");
		await meterPiezas(servidor, ubicacion.T2 ?? "", variante, 4);
		try {
			const pedido = uuidv7();
			const apartado = (await llamarInterna(servidor, "inventario.reservar", {
				motivo: "pedido_linea",
				pedido_linea_id: pedido,
				renglones: [{ variante_id: variante, piezas: 7 }],
				pago_pendiente: true,
			})) as { renglones: { reservas: { ubicacion_id: string; piezas: number }[]; promesa: string }[] };
			const [renglon] = apartado.renglones;
			expect(renglon?.reservas.map((reserva) => [reserva.ubicacion_id, reserva.piezas])).toEqual([
				[ubicacion.BOD, 2],
				[ubicacion.ADU, 3],
				[ubicacion.T2, 2],
			]);
			expect(renglon?.promesa).toBe("sale_manana");
			// Lo de aduana se repartió a un hijo `pedido_linea` del lote, y la reserva apunta a él.
			const { rows } = await servidor.base.dueno.query(
				`SELECT t.folio, t.tipo, t.destino_externo, l.pedido_linea_id, r.piezas, r.vence_en > now() + interval '23 hours' AS vence
				 FROM reservas r JOIN traspasos t ON t.id = r.traspaso_id JOIN traspaso_lineas l ON l.traspaso_id = t.id
				 WHERE r.pedido_linea_id = $1`,
				[pedido],
			);
			expect(rows).toEqual([
				{
					folio: `${lote.folio}-1`,
					tipo: "pedido_linea",
					destino_externo: "cliente_linea",
					pedido_linea_id: pedido,
					piezas: 3,
					vence: true,
				},
			]);
		} finally {
			await servidor.base.dueno.query("UPDATE ubicaciones SET existencia_desde = NULL WHERE codigo = 'T2'");
		}
	});

	it("Un pedido en línea sin pieza en ningún lado queda reservado en Bodega, en negativo, con su excepción", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = uuidv7();
		const apartado = await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_linea",
			pedido_linea_id: pedido,
			renglones: [{ variante_id: variante, piezas: 2 }],
		});
		expect(apartado).toMatchObject({
			renglones: [{ reservas: [{ ubicacion_id: ubicacion.BOD, piezas: 2 }], promesa: "sale_hoy", sin_pieza: true }],
		});
		expect(await libres("BOD", variante)).toBe(-2);
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, area, estado, ubicacion_id, documento_tipo FROM excepciones WHERE variante_id = $1 AND documento_id = $2",
			[variante, pedido],
		);
		expect(rows).toEqual([
			{
				tipo: "pedido_linea_sin_pieza",
				area: "bodega",
				estado: "por_revisar",
				ubicacion_id: ubicacion.BOD,
				documento_tipo: "pedido_linea",
			},
		]);
	});
});
