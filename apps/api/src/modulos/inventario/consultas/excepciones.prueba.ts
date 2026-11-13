/**
 * Prueba de `inventario.excepciones`: las de Bodega por resolver (de la más vieja) y las resueltas por páginas, con
 * cuántas hay de cada una; «Lo que llegó» solo para la dueña; y que solo la piden las cuentas con Bodega, sin precios.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Excepciones {
	conteos: { por_revisar: number; resueltas: number };
	puede_aplicar: boolean;
	renglones: { excepcion_id: string; descripcion: string; lo_que_llego: string | null; resolucion: string | null }[];
}

describe("Excepciones: las por resolver y las resueltas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta. */
	const excepciones = async (parametros: Record<string, string> = {}, quien = "bodega") =>
		(await pedir(servidor, "inventario.excepciones", parametros, quien)) as unknown as Excepciones;

	/**
	 * Abre una excepción de un área.
	 * @param area `bodega` o `contaduria`.
	 * @param minutos Hace cuántos minutos se detectó.
	 */
	const abrir = (area: string, minutos: number) =>
		valorDe(
			servidor,
			`INSERT INTO excepciones (id, tipo, area, estado, descripcion, datos, detectada_en)
			VALUES (uuidv7(), 'cuadre_proyeccion', $1, 'por_revisar', 'La existencia no era la del libro',
				'{"libro": 10, "existencia": 8}', now() - make_interval(mins => $2::int)) RETURNING id`,
			area,
			minutos,
		);

	it("las de Bodega por resolver, de la más vieja; «Lo que llegó» solo a la dueña; las resueltas aparte", async () => {
		const nueva = await abrir("bodega", 1);
		const vieja = await abrir("bodega", 60);
		const ajena = await abrir("contaduria", 5);
		try {
			const datos = await excepciones();
			expect(datos.renglones.map((excepcion) => excepcion.excepcion_id)).toEqual([vieja, nueva]);
			expect(datos.conteos.por_revisar).toBe(2);
			expect(datos.puede_aplicar).toBe(false);
			expect(datos.renglones[0]?.lo_que_llego).toBeNull();
			const deLaDuena = await excepciones({}, "duena");
			expect(deLaDuena.puede_aplicar).toBe(true);
			expect(deLaDuena.renglones[0]?.lo_que_llego).toContain("libro");
			await servidor.base.dueno.query(
				"UPDATE excepciones SET estado = 'resuelta', resolucion = 'Se corrigió el conteo', resuelta_en = now() WHERE id = $1",
				[vieja],
			);
			const resueltas = await excepciones({ estado: "resuelta" });
			expect(resueltas.conteos).toEqual({ por_revisar: 1, resueltas: 1 });
			expect(resueltas.renglones).toEqual([
				expect.objectContaining({ excepcion_id: vieja, resolucion: "Se corrigió el conteo" }),
			]);
		} finally {
			await servidor.base.dueno.query("DELETE FROM excepciones WHERE id IN ($1, $2, $3)", [nueva, vieja, ajena]);
		}
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.excepciones");
	});
});
