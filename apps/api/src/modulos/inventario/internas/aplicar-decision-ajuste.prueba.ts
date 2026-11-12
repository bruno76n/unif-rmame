/**
 * Prueba de `inventario.aplicar_decision_ajuste`: un ajuste autorizado mueve la diferencia guardada aunque después hubo
 * movimientos; rechazado, la existencia no cambia y sus DF- regresan a como estaban. Lo decide Dirección, o la dueña
 * desde Bodega; Bodega no.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	aclararDePrueba,
	contarDePrueba,
	decidirAjusteDePrueba,
	diferenciaEnCamino,
	libroPorUbicacion,
	motivoDeAjuste,
	sacarPiezas,
	salidaDe,
	seccionDe,
} from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un ajuste autorizado mueve la diferencia guardada; rechazado, nada cambia y sus DF- regresan", () => {
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

	/** Bodega cuenta una variante en Bodega y lo que no cuadre pide su AJ-. */
	async function contarEnBodega(variante: string, piezas: number) {
		const respuesta = await contarDePrueba(servidor, {
			ubicacion_id: ubicacion.BOD,
			seccion_id: await seccionDe(servidor, variante),
			renglones: [{ variante_id: variante, piezas }],
			motivo_id: motivo,
		});
		if (respuesta.estado !== 200) throw new Error(JSON.stringify(respuesta.cuerpo));
		return salidaDe(respuesta);
	}

	it("autorizado: mueve lo que se vio al contar, aunque después salieron piezas; el AJ- queda autorizado con su movimiento", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 10);
		const { ajuste_id: ajusteId = "" } = await contarEnBodega(variante, 8);
		// Después de contar salen 4: el ajuste no se calcula contra los 6 de ahora.
		await sacarPiezas(servidor, ubicacion.BOD ?? "", variante, 4);
		const decision = await decidirAjusteDePrueba(servidor, ajusteId, { decision: "autorizar" });
		expect(decision.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^AJ-\d{4} autorizado: se movió la diferencia$/),
		});
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "BOD", piezas: 4 }]);
		expect(
			await consultar(
				`SELECT a.estado, a.decidido_en IS NOT NULL AS decidido, m.tipo, l.piezas, l.destino_ubicacion_id IS NULL AS sale
				 FROM ajustes a JOIN movimientos m ON m.id = a.movimiento_id JOIN movimiento_lineas l ON l.movimiento_id = m.id
				 WHERE a.id = $1`,
				[ajusteId],
			),
		).toEqual([{ estado: "autorizado", decidido: true, tipo: "ajuste", piezas: 2, sale: true }]);
		// La AU- se decide una sola vez.
		expect((await decidirAjusteDePrueba(servidor, ajusteId, { decision: "autorizar" })).cuerpo).toMatchObject({
			codigo: "ya_decidida",
		});
	});

	it("autorizado en una DF- de recepción: saca lo pendiente del tramo, con su traspaso, y la DF- queda resuelta por ajuste", async () => {
		const { diferencia, variante, traspasoId } = await diferenciaEnCamino(servidor, 3, 1);
		const aclarada = await aclararDePrueba(servidor, diferencia, { aclaracion: "perdida", motivo_id: motivo });
		await decidirAjusteDePrueba(servidor, salidaDe(aclarada).ajuste_id ?? "", { decision: "autorizar" });
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "ADU", piezas: 1 }]);
		expect(
			await consultar(
				"SELECT l.traspaso_id FROM movimiento_lineas l JOIN movimientos m ON m.id = l.movimiento_id WHERE m.tipo = 'ajuste' AND l.variante_id = $1 AND m.documento_id IN (SELECT id FROM ajustes)",
				[variante],
			),
		).toEqual([{ traspaso_id: traspasoId }]);
		expect(
			await consultar("SELECT estado, resolucion, aclaracion FROM diferencias WHERE id = $1", [diferencia]),
		).toEqual([{ estado: "resuelta", resolucion: "ajuste", aclaracion: null }]);
	});

	it("rechazado: la existencia no cambia, el AJ- guarda el motivo y sus DF- regresan a por contar o por aclarar", async () => {
		const { diferencia, variante } = await diferenciaEnCamino(servidor, 3, 1);
		const aclarada = await aclararDePrueba(servidor, diferencia, { aclaracion: "perdida", motivo_id: motivo });
		const ajusteId = salidaDe(aclarada).ajuste_id ?? "";
		const antes = await libroPorUbicacion(servidor, [variante]);
		const decision = await decidirAjusteDePrueba(servidor, ajusteId, {
			decision: "rechazar",
			motivo: "Búsquenlas otra vez",
		});
		expect(decision.cuerpo.resultado).toMatchObject({ mensaje: expect.stringMatching(/^AJ-\d{4} rechazado$/) });
		expect(await libroPorUbicacion(servidor, [variante])).toEqual(antes);
		expect(
			await consultar("SELECT estado, motivo_rechazo, movimiento_id FROM ajustes WHERE id = $1", [ajusteId]),
		).toEqual([{ estado: "rechazado", motivo_rechazo: "Búsquenlas otra vez", movimiento_id: null }]);
		expect(await consultar("SELECT estado, ajuste_id FROM diferencias WHERE id = $1", [diferencia])).toEqual([
			{ estado: "por_aclarar", ajuste_id: null },
		]);
		// Una DF- por contar que cerró un conteo con diferencias regresa a por contar.
		const [otra = ""] = await variantesLibres(servidor, 1);
		await sacarPiezas(servidor, ubicacion.BOD ?? "", otra, 2);
		await servidor.base.dueno.query(
			`INSERT INTO diferencias (id, folio, origen, ubicacion_id, variante_id, piezas, descripcion, a_cargo_ubicacion_id, estado)
			 VALUES (gen_random_uuid(), 'DF-PRUEBA-' || floor(random() * 1e9)::text, 'cuadre', $1, $2, -2, 'El cuadre halló −2 en Bodega', $1, 'por_contar')`,
			[ubicacion.BOD, otra],
		);
		const { ajuste_id: delConteo = "" } = await contarEnBodega(otra, 0);
		expect(await consultar("SELECT estado FROM diferencias WHERE variante_id = $1", [otra])).toEqual([
			{ estado: "esperando_autorizacion" },
		]);
		await decidirAjusteDePrueba(servidor, delConteo, { decision: "rechazar", motivo: "Cuenten otra vez" });
		expect(await consultar("SELECT estado FROM diferencias WHERE variante_id = $1", [otra])).toEqual([
			{ estado: "por_contar" },
		]);
	});

	it("lo decide Dirección o la dueña desde Bodega; Bodega no", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		const { ajuste_id: ajusteId = "" } = await contarEnBodega(variante, 4);
		const [au] = await consultar(
			"SELECT a.autorizacion_id, au.version::int AS v FROM ajustes a JOIN autorizaciones au ON au.id = a.autorizacion_id WHERE a.id = $1",
			[ajusteId],
		);
		const decidir = (quien: string) =>
			mandarAccion(
				servidor,
				"direccion.decidir_autorizacion",
				{ datos: { autorizacion_id: au?.autorizacion_id, desde: "bodega", decision: "autorizar" }, version: au?.v },
				quien,
				conGoogle(),
			);
		expect((await decidir("bodega")).estado).toBe(403);
		expect((await decidir("duena")).estado).toBe(200);
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "BOD", piezas: 4 }]);
	});
});
