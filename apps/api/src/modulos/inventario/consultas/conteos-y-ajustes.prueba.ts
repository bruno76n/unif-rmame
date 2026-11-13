/**
 * Prueba de `inventario.conteos_y_ajustes` con los datos de la muestra: el AJ- que espera a Dirección con lo que se vio
 * al contar y su autorización, que solo la dueña puede decidir; los conteos (la carga inicial, el que cuadró y el que no)
 * y el ajuste rechazado con su razón, por páginas; y que solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios } from "./bodega-de-prueba.ts";

/** Un ajuste, en lo que revisa la prueba. */
interface Ajuste {
	folio: string;
	autorizacion_id: string | null;
	version: number | null;
	cambios: { prenda: string; texto: string }[];
	motivo: string;
	resultado: { texto: string; color: string } | null;
	detalle_resultado: string | null;
}

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface ConteosYAjustes {
	en_autorizacion: Ajuste[];
	puede_decidir: boolean;
	conteos: {
		renglones: { folio: string; seccion: string; resultado: { texto: string; color: string } }[];
		cursor: string | null;
	};
	resueltos: { renglones: Ajuste[] };
}

describe("Conteos y ajustes: lo que espera a Dirección, los conteos y los ajustes resueltos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta. */
	const conteos = async (parametros: Record<string, string> = {}, quien = "bodega") =>
		(await pedir(servidor, "inventario.conteos_y_ajustes", parametros, quien)) as unknown as ConteosYAjustes;

	it("el AJ- en autorización dice lo que se vio al contar, su motivo y su autorización; solo la dueña decide", async () => {
		const datos = await conteos();
		expect(datos.puede_decidir).toBe(false);
		expect((await conteos({}, "duena")).puede_decidir).toBe(true);
		expect(datos.en_autorizacion).toHaveLength(1);
		const [ajuste] = datos.en_autorizacion;
		expect(ajuste?.autorizacion_id).not.toBeNull();
		expect(ajuste?.version).not.toBeNull();
		expect(ajuste?.motivo).not.toBe("");
		expect(ajuste?.cambios.length).toBeGreaterThan(0);
		for (const cambio of ajuste?.cambios ?? []) {
			expect(cambio.texto).toMatch(/^Al contar: sistema -?\d+, contado \d+, diferencia [+−]\d+$/);
		}
	});

	it("los conteos: la carga inicial en gris, el que cuadró en verde y el que no en ámbar; por páginas", async () => {
		const { conteos: lista } = await conteos({ lista: "conteos", limite: "100" });
		const resultados = lista.renglones.map((conteo) => conteo.resultado);
		expect(resultados).toContainEqual({ texto: "Carga inicial", color: "gris" });
		expect(resultados).toContainEqual({ texto: "Cuadró", color: "verde" });
		expect(resultados.some((resultado) => resultado.color === "ambar" && /diferencias?$/.test(resultado.texto))).toBe(
			true,
		);
		const primera = await conteos({ lista: "conteos", limite: "1" });
		expect(primera.conteos.renglones).toHaveLength(1);
		expect(primera.conteos.cursor).not.toBeNull();
		const segunda = await conteos({ lista: "conteos", limite: "1", cursor: primera.conteos.cursor ?? "" });
		expect(segunda.conteos.renglones[0]?.folio).toBe(lista.renglones[1]?.folio);
	});

	it("el ajuste rechazado, en rojo con su razón", async () => {
		const { resueltos } = await conteos();
		const rechazado = resueltos.renglones.find((ajuste) => ajuste.resultado?.texto === "Rechazado");
		expect(rechazado?.resultado?.color).toBe("rojo");
		expect(rechazado?.detalle_resultado).not.toBeNull();
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.conteos_y_ajustes");
	});
});
