/**
 * Prueba de `inventario.mover_a_tienda` e `inventario.sugerir_fabricar`: «Mover» nunca pasa de lo disponible en Bodega,
 * aun con dos conexiones; los del día a una tienda comparten su RB- y cada uno es su A-; Aduana lo recibe y lo despacha
 * como cualquier otro; Bodega sugiere fabricar solo para donde hay mínimo.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { despacharDePrueba, versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { libroPorUbicacion } from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import {
	meterPiezas,
	trabasDeLaBase,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("«Mover» nunca pasa de lo disponible; los del día a una tienda comparten RB- y cada uno es su A-", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Bodega mueve a las tiendas. */
	function mover(renglones: { variante_id: string; ubicacion_destino_id: string | undefined; piezas: number }[]) {
		return mandarAccion(servidor, "inventario.mover_a_tienda", { datos: { renglones } }, "bodega");
	}

	/** Los A- que regresó un «Mover». */
	function hechos(respuesta: { cuerpo: { resultado?: unknown } }) {
		return z
			.object({ traspasos: z.array(z.object({ traspaso_id: z.uuid(), folio: z.string(), folio_rb: z.string() })) })
			.passthrough()
			.parse(respuesta.cuerpo.resultado).traspasos;
	}

	// Va primero: así ninguna tienda tiene todavía su RB- de hoy y los dos «Mover» buscan y crean el suyo a la vez, con
	// el candado del reabasto de cada tienda.
	it("dos «Mover» de variantes distintas a la vez: a la misma tienda comparten su RB-; uno a dos tiendas y otro a una de ellas no se traban", async () => {
		const [v1 = "", v2 = "", v3 = "", v4 = ""] = await variantesLibres(servidor, 4);
		for (const variante of [v1, v2, v3, v4]) await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		const { rows: sinRb } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM traspasos WHERE tipo = 'reabasto' AND folio_rb IS NOT NULL",
		);
		expect(sinRb).toEqual([{ n: 0 }]);
		const deadlocks = await trabasDeLaBase(servidor);
		const [uno, dos] = await Promise.all([
			mover([{ variante_id: v1, ubicacion_destino_id: ubicacion.T1, piezas: 1 }]),
			mover([{ variante_id: v2, ubicacion_destino_id: ubicacion.T1, piezas: 1 }]),
		]);
		expect(new Set([...hechos(uno), ...hechos(dos)].map((hecho) => hecho.folio_rb)).size).toBe(1);
		const [varias, una] = await Promise.all([
			mover([
				{ variante_id: v3, ubicacion_destino_id: ubicacion.T1, piezas: 1 },
				{ variante_id: v3, ubicacion_destino_id: ubicacion.T2, piezas: 1 },
			]),
			mover([{ variante_id: v4, ubicacion_destino_id: ubicacion.T2, piezas: 1 }]),
		]);
		expect([varias.estado, una.estado]).toEqual([200, 200]);
		const aT2 = [...hechos(varias), ...hechos(una)].filter((hecho) => hecho.folio_rb !== hechos(uno)[0]?.folio_rb);
		expect(new Set(aT2.map((hecho) => hecho.folio_rb)).size).toBe(1);
		// Ninguno se trabó con el otro (el núcleo habría reintentado sin que se viera en la respuesta).
		expect(await trabasDeLaBase(servidor)).toBe(deadlocks);
	});

	it("cada «Mover» es su A- `reabasto` en camino a aduana; los del día a una tienda comparten su RB-; a otra tienda, otro", async () => {
		const [variante = "", otra = ""] = await variantesLibres(servidor, 2);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 10);
		await meterPiezas(servidor, ubicacion.BOD ?? "", otra, 10);
		const primero = await mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.T1, piezas: 3 }]);
		expect(primero.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^Traspaso a Tienda 1: 3 .+ enviado a aduana$/),
		});
		const segundo = await mover([
			{ variante_id: otra, ubicacion_destino_id: ubicacion.T1, piezas: 2 },
			{ variante_id: variante, ubicacion_destino_id: ubicacion.T2, piezas: 1 },
		]);
		expect(segundo.cuerpo.resultado).toMatchObject({ mensaje: "3 piezas pasan a aduana para las tiendas" });
		const [a1] = hechos(primero);
		const [a2, a3] = hechos(segundo);
		expect(a1?.folio_rb).toMatch(/^RB-\d{3}$/);
		expect(a2?.folio_rb).toBe(a1?.folio_rb);
		expect(a3?.folio_rb).not.toBe(a1?.folio_rb);
		expect(new Set([a1?.folio, a2?.folio, a3?.folio]).size).toBe(3);
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.tipo, t.estado, o.codigo AS origen, d.codigo AS destino, t.enviado_en IS NOT NULL AS enviado
			 FROM traspasos t JOIN ubicaciones o ON o.id = t.origen_ubicacion_id JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
			 WHERE t.id = $1`,
			[a1?.traspaso_id],
		);
		expect(rows).toEqual([
			{ tipo: "reabasto", estado: "en_camino_aduana", origen: "BOD", destino: "T1", enviado: true },
		]);
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([
			{ codigo: "BOD", piezas: 6 },
			{ codigo: "ECA", piezas: 4 },
		]);
		// Aduana lo recibe y lo despacha a su tienda como cualquier otro.
		const recibido = await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{
				datos: { traspaso_id: a1?.traspaso_id, modo: "completo" },
				version: await versionDeTraspaso(servidor, a1?.traspaso_id ?? ""),
			},
			"aduana",
		);
		expect(recibido.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/recibido en aduana: 3 piezas para Tienda 1$/),
		});
		expect((await despacharDePrueba(servidor, [a1?.traspaso_id ?? ""])).estado).toBe(200);
	});

	it("nunca pasa de lo disponible: mueve lo que hay y avisa; sin nada, `sin_libres`; solo a una tienda", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 4);
		const respuesta = await mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.T1, piezas: 7 }]);
		expect(respuesta.cuerpo).toMatchObject({ avisos: [expect.stringMatching(/: solo se movieron 4$/)] });
		const otra = await mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.T1, piezas: 1 }]);
		expect(otra.cuerpo).toMatchObject({
			codigo: "sin_libres",
			mensaje: expect.stringMatching(/: solo hay 0 libres en bodega\.$/),
		});
		expect(
			(await mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.ADU, piezas: 1 }])).cuerpo,
		).toMatchObject({ codigo: "destino_no_tienda" });
		expect(
			(
				await mandarAccion(
					servidor,
					"inventario.mover_a_tienda",
					{ datos: { renglones: [{ variante_id: variante, ubicacion_destino_id: ubicacion.T1, piezas: 1 }] } },
					"aduana",
				)
			).estado,
		).toBe(403);
	});

	it("dos «Mover» de la misma variante a la vez nunca pasan de lo disponible; dos a la misma tienda comparten su RB-", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		const [uno, dos] = await Promise.all([
			mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.T2, piezas: 4 }]),
			mover([{ variante_id: variante, ubicacion_destino_id: ubicacion.T2, piezas: 4 }]),
		]);
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "ECA", piezas: 5 }]);
		const folios = [...hechos(uno), ...hechos(dos)].map((hecho) => hecho.folio_rb);
		expect(folios).toHaveLength(2);
		expect(new Set(folios).size).toBe(1);
	});

	it("Bodega sugiere fabricar para Bodega o una tienda, no para donde no hay mínimo", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const sugerir = (ubicacionId: string | undefined) =>
			mandarAccion(
				servidor,
				"inventario.sugerir_fabricar",
				{ datos: { renglones: [{ variante_id: variante, ubicacion_id: ubicacionId, piezas: 4 }] } },
				"bodega",
			);
		const respuesta = await sugerir(ubicacion.T1);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^Sugerencia enviada a producción: 4 .+/),
		});
		const { sugerencia_ids } = z.object({ sugerencia_ids: z.array(z.uuid()) }).parse(respuesta.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, piezas FROM sugerencias_reabasto WHERE id = ANY($1::uuid[])",
			[sugerencia_ids],
		);
		expect(rows).toEqual([{ estado: "por_decidir", piezas: 4 }]);
		expect((await sugerir(ubicacion.ADU)).cuerpo).toMatchObject({
			codigo: "ubicacion_sin_minimo",
			mensaje: "Aduana no lleva mínimo.",
		});
	});
});
