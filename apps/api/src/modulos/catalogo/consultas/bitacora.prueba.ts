/**
 * Prueba de `catalogo.bitacora` con los datos de la muestra: los cambios de los productos, lo más reciente arriba, con
 * su tipo de cambio, su producto y su detalle; los filtros por tipo, por lista y el buscador; las páginas; y solo
 * Catálogo la lee.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor…») y docs/interfaz/fabrica/catalogo.md («Bitácora»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Bitacora {
	renglones: {
		id: string;
		ocurrido_en: string;
		quien: string;
		tipo_cambio: string | null;
		producto: string | null;
		detalle: string;
	}[];
	total: number;
	cursor: string | null;
	hay_mas: boolean;
	listas: { id: string; tipo: string }[];
}

describe("catalogo.bitacora: los cambios de los productos, lo más reciente arriba", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la bitácora como Catálogo. */
	async function bitacora(parametros: Record<string, string> = {}): Promise<Bitacora> {
		const respuesta = await pedirConsulta(servidor, "catalogo.bitacora", parametros, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Bitacora;
	}

	it("trae los renglones de los productos en orden, con quién y su producto", async () => {
		const resultado = await bitacora();
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE entidad = 'productos' AND tipo = 'cambio'",
		);
		expect(resultado.total).toBe(rows[0]?.n);
		const fechas = resultado.renglones.map((renglon) => renglon.ocurrido_en);
		expect([...fechas].sort().reverse()).toEqual(fechas);
		expect(resultado.renglones.every((renglon) => renglon.quien !== "" && renglon.producto !== null)).toBe(true);
	});

	it("el tipo de cambio filtra: productos nuevos, tallas dadas de baja y descontinuados", async () => {
		const nuevos = await bitacora({ tipo_cambio: "producto_nuevo" });
		expect(nuevos.total).toBeGreaterThanOrEqual(32);
		expect(nuevos.renglones.every((renglon) => renglon.detalle.startsWith("Producto nuevo con"))).toBe(true);
		expect(nuevos.renglones.every((renglon) => renglon.tipo_cambio === "producto_nuevo")).toBe(true);
		const bajas = await bitacora({ tipo_cambio: "variante_baja" });
		expect(bajas.renglones.map((renglon) => renglon.producto).sort()).toEqual(["Jumper cuadros", "Pants marino liso"]);
		expect(bajas.renglones.every((renglon) => renglon.detalle.startsWith("Talla "))).toBe(true);
		const descontinuados = await bitacora({ tipo_cambio: "descontinuado" });
		expect(descontinuados.renglones.map((renglon) => renglon.producto).sort()).toEqual([
			"Playera polo gris lisa",
			"Suéter marino liso",
		]);
	});

	it("la lista deja los cambios de precio de esa lista y el buscador encuentra por producto", async () => {
		const { rows } = await servidor.base.dueno.query(
			`SELECT b.despues->>'lista_id' AS lista FROM bitacora b WHERE b.entidad = 'productos'
			 AND b.descripcion LIKE 'Precio %' AND b.despues ? 'lista_id' LIMIT 1`,
		);
		if (rows[0] !== undefined) {
			const deLaLista = await bitacora({ lista_id: String(rows[0].lista) });
			expect(deLaLista.total).toBeGreaterThan(0);
			expect(deLaLista.renglones.every((renglon) => renglon.tipo_cambio === "precio")).toBe(true);
		}
		const jumper = await bitacora({ buscar: "Jumper cuadros" });
		expect(jumper.total).toBeGreaterThan(0);
		expect(jumper.renglones.every((renglon) => renglon.producto === "Jumper cuadros")).toBe(true);
	});

	it("va por páginas: la siguiente sigue donde quedó la primera", async () => {
		const primera = await bitacora({ limite: "5" });
		expect(primera.renglones).toHaveLength(5);
		expect(primera.hay_mas).toBe(true);
		const segunda = await bitacora({ limite: "5", cursor: primera.cursor ?? "" });
		expect(segunda.renglones[0]?.id).not.toBe(primera.renglones[4]?.id);
		expect((segunda.renglones[0]?.ocurrido_en ?? "") <= (primera.renglones[4]?.ocurrido_en ?? "")).toBe(true);
	});

	it("solo Catálogo la lee: Aduana, Bodega y Ventas no", async () => {
		for (const quien of ["aduana", "bodega", "ventas"]) {
			expect((await pedirConsulta(servidor, "catalogo.bitacora", {}, quien)).estado, quien).toBe(403);
		}
	});
});
