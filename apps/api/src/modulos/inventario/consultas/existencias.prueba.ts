/**
 * Prueba de `inventario.existencias` con los datos de la muestra: el resumen de lo filtrado, la búsqueda por prenda y
 * talla o por código, los filtros, las páginas por producto, los colores de cada celda contra su mínimo, y que solo la
 * piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { apartarEnBodega, pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Una variante de la tabla, en lo que revisa la prueba. */
interface Variante {
	variante_id: string;
	prenda: string;
	talla: string;
	codigo: string | null;
	celdas: { codigo: string; piezas: number; minimo: number | null; tono: string | null }[];
	total: number;
	comprometido: number;
	libre: number;
}

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Existencias {
	resumen: { variantes: number; piezas: number };
	columnas: { codigo: string; nombre: string }[];
	renglones: {
		producto_id: string;
		prenda: string;
		suma: { celdas: { codigo: string; piezas: number }[]; total: number; comprometido: number; libre: number };
		variantes: Variante[];
	}[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("Existencias: por producto y variante, con sus filtros y sus páginas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Bodega. */
	const existencias = async (parametros: Record<string, string> = {}) =>
		(await pedir(servidor, "inventario.existencias", { limite: "200", ...parametros })) as unknown as Existencias;

	it("el resumen suma las piezas de lo filtrado, y cada variante cuadra: total, comprometido y libre", async () => {
		const todas = await existencias();
		const variantes = todas.renglones.flatMap((renglon) => renglon.variantes);
		expect(todas.resumen.variantes).toBe(variantes.length);
		expect(todas.resumen.piezas).toBe(variantes.reduce((suma, variante) => suma + variante.total, 0));
		const enBodega = Number(
			await valorDe(
				servidor,
				"SELECT sum(e.piezas) FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id WHERE u.tipo = 'bodega'",
			),
		);
		const sumaBodega = variantes.reduce(
			(suma, variante) => suma + (variante.celdas.find((celda) => celda.codigo === "BOD")?.piezas ?? 0),
			0,
		);
		expect(sumaBodega).toBe(enBodega);
		for (const variante of variantes) expect(variante.libre).toBe(variante.total - variante.comprometido);
		// El renglón de cada producto llega con la suma de sus variantes: la pantalla no suma.
		for (const producto of todas.renglones) {
			const deSusVariantes = (valor: (variante: Variante) => number) =>
				producto.variantes.reduce((suma, variante) => suma + valor(variante), 0);
			expect(producto.suma.total).toBe(deSusVariantes((variante) => variante.total));
			expect(producto.suma.libre).toBe(deSusVariantes((variante) => variante.libre));
			expect(producto.suma.celdas.find((celda) => celda.codigo === "BOD")?.piezas).toBe(
				deSusVariantes((variante) => variante.celdas.find((celda) => celda.codigo === "BOD")?.piezas ?? 0),
			);
		}
		// Las columnas llegan con el nombre de su ubicación.
		const nombres = await valorDe(
			servidor,
			"SELECT string_agg(nombre, ',' ORDER BY orden) FROM ubicaciones WHERE codigo IN ('ADU', 'BOD', 'T1', 'T2', 'TAL')",
		);
		expect(todas.columnas.map((columna) => columna.nombre).join(",")).toBe(nombres);
	});

	it("la celda de Bodega lleva su mínimo y su color: rojo en cero, ámbar bajo el mínimo, sin color arriba", async () => {
		const { renglones } = await existencias();
		for (const variante of renglones.flatMap((renglon) => renglon.variantes)) {
			const bodega = variante.celdas.find((celda) => celda.codigo === "BOD");
			expect(bodega?.minimo).toBeGreaterThan(0);
			const minimo = bodega?.minimo ?? 0;
			const piezas = bodega?.piezas ?? 0;
			const libres = piezas;
			const esperado = libres <= 0 ? "rojo" : libres < minimo ? "ambar" : null;
			expect(bodega?.tono, `${variante.prenda} ${variante.talla}`).toBe(esperado);
		}
	});

	it("busca por prenda y talla («polo 12») y por el código que empieza así", async () => {
		const polo = await existencias({ texto: "polo 12" });
		const variantes = polo.renglones.flatMap((renglon) => renglon.variantes);
		expect(variantes.length).toBeGreaterThan(0);
		for (const variante of variantes) {
			expect(variante.prenda.toLowerCase()).toContain("polo");
			expect(variante.talla).toBe("12");
		}
		const codigo = variantes[0]?.codigo ?? "";
		const porCodigo = await existencias({ texto: codigo.slice(0, 5) });
		expect(porCodigo.renglones.flatMap((renglon) => renglon.variantes).map((variante) => variante.codigo)).toContain(
			codigo,
		);
		expect((await existencias({ texto: "zzzz inexistente" })).renglones).toEqual([]);
	});

	it("los filtros: en cero, bajo mínimo y con comprometido", async () => {
		for (const variante of (await existencias({ filtro: "en_cero" })).renglones.flatMap(
			(renglon) => renglon.variantes,
		)) {
			expect(variante.celdas.some((celda) => celda.tono === "rojo")).toBe(true);
		}
		for (const variante of (await existencias({ filtro: "bajo_minimo" })).renglones.flatMap((r) => r.variantes)) {
			expect(variante.celdas.some((celda) => celda.tono === "ambar")).toBe(true);
		}
		const apartado = await apartarEnBodega(servidor);
		try {
			const comprometidas = (await existencias({ filtro: "con_comprometido" })).renglones.flatMap((r) => r.variantes);
			expect(comprometidas).toHaveLength(1);
			expect(comprometidas[0]?.comprometido).toBe(2);
		} finally {
			await apartado.quitar();
		}
	});

	it("pagina por producto: con el cursor llegan todos, sin repetir", async () => {
		const todas = await existencias();
		const vistos: string[] = [];
		let pagina = await existencias({ limite: "3" });
		expect(pagina.renglones).toHaveLength(3);
		vistos.push(...pagina.renglones.map((renglon) => renglon.producto_id));
		while (pagina.cursor !== null) {
			pagina = await existencias({ limite: "3", cursor: pagina.cursor });
			vistos.push(...pagina.renglones.map((renglon) => renglon.producto_id));
		}
		expect(vistos).toEqual(todas.renglones.map((renglon) => renglon.producto_id));
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.existencias", { limite: "5" });
	});
});
