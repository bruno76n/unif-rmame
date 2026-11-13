/**
 * Prueba de `catalogo.etiquetas` con los datos de la muestra: las variantes nuevas sin etiqueta por producto; por
 * variante, sus códigos y el estado de su etiqueta sin las tallas dadas de baja; el precio de la vista previa solo con
 * `catalogo.etiqueta_lleva_precio` (con el recargo en una talla de pedido especial); y solo Catálogo la lee.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/catalogo.md («Etiquetas»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Etiquetas {
	nuevas: { producto_id: string; nombre: string; escuela: string | null; variantes: number }[];
	productos: { id: string; nombre: string }[];
	producto: {
		nombre: string;
		variantes: {
			talla: string;
			codigo: string;
			es_pedido_especial: boolean;
			estado_etiqueta: string;
			precio_centavos: number | null;
		}[];
	} | null;
	maximo_por_talla: number;
	lleva_precio: boolean;
}

describe("catalogo.etiquetas: las nuevas por producto y cada variante con su código, solo para Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Etiquetas como Catálogo. */
	async function etiquetas(parametros: Record<string, string> = {}): Promise<Etiquetas> {
		const respuesta = await pedirConsulta(servidor, "catalogo.etiquetas", parametros, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Etiquetas;
	}

	/** El id de un producto por su nombre (el primero). */
	async function idDe(nombre: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM productos WHERE nombre = $1 LIMIT 1", [nombre]);
		return String(rows[0]?.id);
	}

	it("las nuevas sin etiqueta van por producto, con cuántas variantes; sin producto no hay «Por variante»", async () => {
		const resultado = await etiquetas();
		expect(resultado.nuevas.map((nueva) => [nueva.nombre, nueva.variantes]).sort()).toEqual([
			["Playera polo blanca con escudo", 9],
			["Suéter verde con escudo", 8],
		]);
		expect(resultado.producto).toBeNull();
		expect(resultado.maximo_por_talla).toBe(999);
		expect(resultado.lleva_precio).toBe(false);
		expect(resultado.productos.length).toBeGreaterThan(20);
	});

	it("por variante: sus tallas vivas con código y el estado de su etiqueta; sin precio mientras no lo lleve", async () => {
		const resultado = await etiquetas({ producto_id: await idDe("Pants marino liso") });
		const tallas = resultado.producto?.variantes.map((variante) => variante.talla) ?? [];
		// La talla 3 se dio de baja: su código ya no se imprime.
		expect(tallas).not.toContain("3");
		expect(tallas.slice(0, 2)).toEqual(["4", "6"]);
		const dieciocho = resultado.producto?.variantes.find((variante) => variante.talla === "18");
		expect(dieciocho).toMatchObject({
			es_pedido_especial: true,
			estado_etiqueta: "al_fabricar",
			precio_centavos: null,
		});
		expect(resultado.producto?.variantes.every((variante) => /^\d{6}$/.test(variante.codigo))).toBe(true);
	});

	it("con `catalogo.etiqueta_lleva_precio` la vista previa trae Mostrador, con el recargo en pedido especial", async () => {
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'catalogo.etiqueta_lleva_precio'",
		);
		try {
			const id = await idDe("Pants marino liso");
			const resultado = await etiquetas({ producto_id: id });
			expect(resultado.lleva_precio).toBe(true);
			const { rows } = await servidor.base.dueno.query(
				"SELECT recargo_pedido_especial_centavos::int AS recargo FROM productos WHERE id = $1",
				[id],
			);
			const variantes = resultado.producto?.variantes ?? [];
			expect(variantes.find((variante) => variante.talla === "4")?.precio_centavos).toBe(41_000);
			expect(variantes.find((variante) => variante.talla === "18")?.precio_centavos).toBe(41_000 + rows[0]?.recargo);
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_booleano = false WHERE clave = 'catalogo.etiqueta_lleva_precio'",
			);
		}
	});

	it("solo Catálogo la lee: Aduana, Bodega y Ventas no", async () => {
		for (const quien of ["aduana", "bodega", "ventas"]) {
			expect((await pedirConsulta(servidor, "catalogo.etiquetas", {}, quien)).estado, quien).toBe(403);
		}
	});
});
