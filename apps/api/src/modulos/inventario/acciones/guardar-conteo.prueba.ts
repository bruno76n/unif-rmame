/**
 * Prueba de `inventario.guardar_conteo`: guarda lo que decía el sistema a la hora del conteo (con movimientos antes y
 * después de esa hora), pide un AJ- con motivo si no cuadra y cierra las DF- por contar de esa ubicación y esa
 * variante; Bodega cuenta en Bodega y en Aduana, Aduana solo en Aduana.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	contarDePrueba,
	decidirAjusteDePrueba,
	libroPorUbicacion,
	motivoDeAjuste,
	salidaDe,
	seccionDe,
} from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";

describe("El conteo guarda lo que decía el sistema a su hora, pide un AJ- si no cuadra y cierra las DF- por contar", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let motivo: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		motivo = await motivoDeAjuste(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un ajuste de entrada o salida en Bodega a una hora dada. */
	function moverA(variante: string, piezas: number, entra: boolean, ocurridoEn: Temporal.Instant) {
		const bodega = ubicacion.BOD ?? "";
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: [{ origen: entra ? null : bodega, destino: entra ? bodega : null, varianteId: variante, piezas }],
				ocurridoEn,
				clave: uuidv7(),
			}),
		);
	}

	/** Una DF- por contar en una ubicación. */
	function porContar(ubicacionId: string, variante: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			abrirDiferencia(contexto, {
				origen: "cuadre",
				ubicacionId,
				aCargoUbicacionId: ubicacionId,
				hueco: { varianteId: variante, piezas: -1 },
				descripcion: "El cuadre halló −1",
			}),
		);
	}

	it("lo que decía el sistema sale del libro hasta la hora del conteo: lo que pasó después no se pisa", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const ahora = Temporal.Now.instant();
		await moverA(variante, 30, true, ahora.subtract({ hours: 2 }));
		// A media cuenta salieron 4: después de la hora del conteo.
		await moverA(variante, 4, false, ahora.subtract({ minutes: 30 }));
		const respuesta = await contarDePrueba(servidor, {
			ubicacion_id: ubicacion.BOD,
			seccion_id: await seccionDe(servidor, variante),
			contado_en: ahora.subtract({ hours: 1 }).toString(),
			renglones: [{ variante_id: variante, piezas: 28 }],
			motivo_id: motivo,
		});
		const salida = salidaDe(respuesta);
		expect(salida.mensaje).toMatch(/^AJ-\d{4}: 1 diferencia espera autorización de Dirección$/);
		expect(
			await consultar(
				`SELECT c.tipo, c.estado, l.piezas_sistema, l.piezas_contadas, l.diferencia FROM conteos c
				 JOIN conteo_lineas l ON l.conteo_id = c.id WHERE c.id = $1`,
				[salida.conteo_id],
			),
		).toEqual([{ tipo: "nuevo", estado: "contado", piezas_sistema: 30, piezas_contadas: 28, diferencia: -2 }]);
		expect(
			await consultar(
				`SELECT a.origen, l.piezas_sistema, l.piezas_contadas, l.piezas_diferencia, l.conteo_linea_id IS NOT NULL AS con_renglon
				 FROM ajustes a JOIN ajuste_lineas l ON l.ajuste_id = a.id WHERE a.id = $1`,
				[salida.ajuste_id],
			),
		).toEqual([
			{ origen: "conteo", piezas_sistema: 30, piezas_contadas: 28, piezas_diferencia: -2, con_renglon: true },
		]);
		// La existencia no cambia hasta que Dirección autoriza; al autorizar salen 2 y quedan 24, lo que de verdad hay.
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "BOD", piezas: 26 }]);
		await decidirAjusteDePrueba(servidor, salida.ajuste_id ?? "", { decision: "autorizar" });
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "BOD", piezas: 24 }]);
	});

	it("si cuadra, no hay AJ- y las DF- por contar de esa ubicación y esa variante quedan resueltas; las de otra ubicación, no", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 6);
		const enBodega = await porContar(ubicacion.BOD ?? "", variante);
		const enAduana = await porContar(ubicacion.ADU ?? "", variante);
		const respuesta = await contarDePrueba(servidor, {
			ubicacion_id: ubicacion.BOD,
			seccion_id: await seccionDe(servidor, variante),
			renglones: [{ variante_id: variante, piezas: 6 }],
		});
		const salida = salidaDe(respuesta);
		expect(salida.mensaje).toMatch(/^CN-\d{3}: 1 prenda contada, todo cuadra$/);
		expect(salida).not.toHaveProperty("ajuste_id");
		expect(
			await consultar(
				"SELECT id, estado, resolucion, conteo_id FROM diferencias WHERE id = ANY($1::uuid[]) ORDER BY folio",
				[[enBodega.diferenciaId, enAduana.diferenciaId]],
			),
		).toEqual([
			{ id: enBodega.diferenciaId, estado: "resuelta", resolucion: "cuadro", conteo_id: salida.conteo_id },
			{ id: enAduana.diferenciaId, estado: "por_contar", resolucion: null, conteo_id: null },
		]);
	});

	it("si no cuadra pide el motivo; con él, las DF- por contar esperan con el AJ-", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 6);
		const df = await porContar(ubicacion.BOD ?? "", variante);
		const datos = {
			ubicacion_id: ubicacion.BOD,
			seccion_id: await seccionDe(servidor, variante),
			renglones: [{ variante_id: variante, piezas: 5 }],
		};
		expect((await contarDePrueba(servidor, datos)).cuerpo).toMatchObject({
			error: "validacion",
			campos: { motivo_id: "Todo ajuste necesita motivo" },
		});
		const salida = salidaDe(await contarDePrueba(servidor, { ...datos, motivo_id: motivo }));
		expect(await consultar("SELECT estado, ajuste_id FROM diferencias WHERE id = $1", [df.diferenciaId])).toEqual([
			{ estado: "esperando_autorizacion", ajuste_id: salida.ajuste_id },
		]);
	});

	it("el conteo de una DF-: solo su variante y donde está; si cuadra, la aclara; una que ya no está por contar, no", async () => {
		const [variante = "", otra = ""] = await variantesLibres(servidor, 2);
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 4);
		const df = await porContar(ubicacion.ADU ?? "", variante);
		expect(
			(
				await contarDePrueba(
					servidor,
					{
						ubicacion_id: ubicacion.ADU,
						diferencia_id: df.diferenciaId,
						renglones: [{ variante_id: otra, piezas: 1 }],
					},
					"aduana",
				)
			).cuerpo,
		).toMatchObject({
			codigo: "variante_ajena",
			mensaje: expect.stringMatching(new RegExp(`no es de ${df.folio}\\.$`)),
		});
		expect(
			(
				await contarDePrueba(servidor, {
					ubicacion_id: ubicacion.BOD,
					diferencia_id: df.diferenciaId,
					renglones: [{ variante_id: variante, piezas: 4 }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "ubicacion_no_contable" });
		const delConteo = {
			ubicacion_id: ubicacion.ADU,
			diferencia_id: df.diferenciaId,
			renglones: [{ variante_id: variante, piezas: 4 }],
		};
		const respuesta = await contarDePrueba(servidor, delConteo, "aduana");
		expect(salidaDe(respuesta).mensaje).toBe(`${df.folio} aclarada: el conteo cuadra con el sistema`);
		expect((await contarDePrueba(servidor, delConteo, "aduana")).cuerpo).toMatchObject({
			codigo: "diferencia_no_por_contar",
			mensaje: `${df.folio} ya no está por contar.`,
		});
	});

	it("Aduana cuenta solo en Aduana; solo se cuenta en Bodega o Aduana; nunca después de ahora; solo prendas de la sección", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const seccion = await seccionDe(servidor, variante);
		const datos = { seccion_id: seccion, renglones: [{ variante_id: variante, piezas: 0 }] };
		expect((await contarDePrueba(servidor, { ...datos, ubicacion_id: ubicacion.BOD }, "aduana")).estado).toBe(403);
		expect((await contarDePrueba(servidor, { ...datos, ubicacion_id: ubicacion.ADU }, "aduana")).estado).toBe(200);
		expect((await contarDePrueba(servidor, { ...datos, ubicacion_id: ubicacion.ADU }, "ventas")).estado).toBe(403);
		expect((await contarDePrueba(servidor, { ...datos, ubicacion_id: ubicacion.T1 })).cuerpo).toMatchObject({
			codigo: "ubicacion_no_contable",
			mensaje: "Aquí solo se cuenta en Bodega o en Aduana.",
		});
		expect(
			(
				await contarDePrueba(servidor, {
					...datos,
					ubicacion_id: ubicacion.BOD,
					contado_en: Temporal.Now.instant().add({ hours: 1 }).toString(),
				})
			).cuerpo,
		).toMatchObject({ campos: { contado_en: "La hora del conteo no puede ser después de ahora." } });
		expect(
			(await contarDePrueba(servidor, { ...datos, seccion_id: undefined, ubicacion_id: ubicacion.BOD })).cuerpo,
		).toMatchObject({
			campos: { seccion_id: "Elige la sección que vas a contar." },
		});
		expect(
			(await contarDePrueba(servidor, { ubicacion_id: ubicacion.BOD, seccion_id: seccion, renglones: [] })).cuerpo,
		).toMatchObject({
			campos: { renglones: "Cuenta al menos una prenda." },
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.id FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE p.seccion_id <> $1 LIMIT 1`,
			[seccion],
		);
		expect(
			(
				await contarDePrueba(servidor, {
					ubicacion_id: ubicacion.BOD,
					seccion_id: seccion,
					renglones: [{ variante_id: rows[0]?.id, piezas: 1 }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "variante_ajena" });
	});
});
