/**
 * Prueba de `inventario.diferencias`: las por contar, las de recepción con quién recibió, a cargo de quién y su espejo
 * para «Venía en otro», los motivos de ajuste, las resueltas por páginas con cómo se resolvieron, y que solo la piden
 * las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { abrirDiferenciaYExcepcion, pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Una diferencia por aclarar, en lo que revisa la prueba. */
interface PorAclarar {
	diferencia_id: string;
	recibio: string;
	a_cargo: string;
	espejos: { diferencia_id: string }[];
}

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Diferencias {
	por_contar: { diferencia_id: string; piezas: number; contada: boolean; ubicacion: string }[];
	de_recepcion: PorAclarar[];
	motivos_ajuste: { id: string; nombre: string }[];
	resueltas: { renglones: { folio: string; como: string }[]; cursor: string | null };
}

describe("Diferencias: por contar, de recepción, de material y resueltas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Bodega. */
	const diferencias = async (parametros: Record<string, string> = {}) =>
		(await pedir(servidor, "inventario.diferencias", parametros)) as unknown as Diferencias;

	/**
	 * Abre una DF- de recepción en Tránsito, a cargo de Aduana, del primer traspaso de prendas de la muestra.
	 * @param folio Su folio.
	 * @param piezas Con signo.
	 */
	const deRecepcion = (folio: string, piezas: number) =>
		valorDe(
			servidor,
			`INSERT INTO diferencias (id, folio, origen, ubicacion_id, variante_id, piezas, descripcion, sistema_decia,
				a_cargo_ubicacion_id, traspaso_id, estado)
			SELECT uuidv7(), $1, 'recepcion', tra.id, l.variante_id, $2, 'Aduana mandó 24 y Bodega recibió 22', 24, adu.id,
				t.id, 'por_aclarar'
			FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
			JOIN ubicaciones tra ON tra.tipo = 'transito' JOIN ubicaciones adu ON adu.tipo = 'aduana'
			WHERE l.variante_id IS NOT NULL ORDER BY t.folio, l.renglon LIMIT 1 RETURNING id`,
			folio,
			piezas,
		);

	it("las por contar; las de recepción con quién recibió y su espejo; los motivos de ajuste", async () => {
		const abiertas = await abrirDiferenciaYExcepcion(servidor);
		const falto = await deRecepcion("DF-PRUEBA-1", -2);
		const sobro = await deRecepcion("DF-PRUEBA-2", 2);
		try {
			const datos = await diferencias();
			expect(datos.por_contar).toEqual([
				expect.objectContaining({ diferencia_id: abiertas.diferencia, piezas: 2, contada: false, ubicacion: "Bodega" }),
			]);
			const suya = datos.de_recepcion.find((diferencia) => diferencia.diferencia_id === falto);
			expect(suya).toMatchObject({ a_cargo: "Aduana" });
			expect(suya?.recibio).toMatch(/^Recibió /);
			expect(suya?.espejos.map((espejo) => espejo.diferencia_id)).toEqual([sobro]);
			expect(datos.motivos_ajuste.length).toBeGreaterThan(0);
		} finally {
			await abiertas.quitar();
			await servidor.base.dueno.query("DELETE FROM diferencias WHERE id IN ($1, $2)", [falto, sobro]);
		}
	});

	it("las resueltas por páginas, con cómo se resolvió", async () => {
		const resuelta = await valorDe(
			servidor,
			`INSERT INTO diferencias (id, folio, origen, ubicacion_id, variante_id, piezas, descripcion, a_cargo_ubicacion_id,
				estado, resolucion, motivo_resolucion, resuelta_en)
			SELECT uuidv7(), 'DF-PRUEBA-3', 'cuadre', u.id, e.variante_id, -1, 'El cuadre halló −1', u.id, 'resuelta', 'cuadro',
				'Se encontró en el anaquel', now()
			FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.tipo = 'bodega' ORDER BY e.id LIMIT 1
			RETURNING id`,
		);
		try {
			const { resueltas } = await diferencias({ limite: "1" });
			expect(resueltas.renglones).toHaveLength(1);
			expect(resueltas.renglones[0]?.folio).toBe("DF-PRUEBA-3");
			expect(resueltas.renglones[0]?.como).toContain("Se encontró en el anaquel");
		} finally {
			await servidor.base.dueno.query("DELETE FROM diferencias WHERE id = $1", [resuelta]);
		}
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.diferencias");
	});
});
