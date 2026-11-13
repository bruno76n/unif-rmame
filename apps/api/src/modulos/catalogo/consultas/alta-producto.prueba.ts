/**
 * Prueba de `catalogo.alta_producto` con los datos de la muestra: lo que pide el alta (secciones, escuelas, tallas,
 * listas, productos base y el siguiente código), el producto base con sus tallas y sus precios, y quién la lee:
 * Catálogo con cualquier origen, Ventas a externos solo desde un pedido, con la lista de su cliente.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor…») y docs/interfaz/fabrica/catalogo.md («Nuevo producto»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Alta {
	siguiente_codigo: string | null;
	secciones: { nombre: string; lleva_receta: boolean }[];
	escuelas: { id: string }[];
	categorias: { nombre: string; defecto_para: string | null }[];
	grupos: { nombre: string; tallas: { nombre: string }[] }[];
	listas: { id: string; tipo: string; nombre: string }[];
	productos_base: { id: string; nombre: string }[];
	base: {
		nombre: string;
		tallas: { talla_id: string; es_pedido_especial: boolean }[];
		precios: { lista_id: string; precio_centavos: number }[];
		canales: Record<string, boolean>;
	} | null;
	cliente: { id: string; nombre: string; lista_id: string | null } | null;
}

describe("catalogo.alta_producto: lo que necesita el alta de un producto", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide el alta. */
	async function alta(parametros: Record<string, string>, quien = "catalogo") {
		return await pedirConsulta(servidor, "catalogo.alta_producto", parametros, quien);
	}

	it("desde cero: el siguiente código, las secciones, los grupos, las tres listas generales y los posibles base", async () => {
		const respuesta = await alta({ origen: "catalogo" });
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const resultado = respuesta.cuerpo.resultado as Alta;
		expect(resultado.siguiente_codigo).toMatch(/^\d{6}$/);
		expect(resultado.secciones).toHaveLength(7);
		expect(resultado.grupos.map((grupo) => grupo.nombre)).toEqual([
			"Infantil",
			"Juvenil y adulto",
			"Pantalón por cintura",
			"Talla única",
		]);
		expect(resultado.listas.map((lista) => lista.tipo)).toEqual(["mostrador", "mayoreo", "en_linea"]);
		expect(resultado.categorias.find((categoria) => categoria.defecto_para === "sin_escuela")?.nombre).toBe("Básico");
		const nombres = resultado.productos_base.map((producto) => producto.nombre);
		// Ni los servicios ni los descontinuados son base.
		expect(nombres).not.toContain("Bordado de nombre");
		expect(nombres).not.toContain("Playera polo gris lisa");
		expect(nombres).toContain("Playera polo blanca lisa");
		expect(resultado.base).toBeNull();
		expect(resultado.escuelas).toHaveLength(6);
	});

	it("a partir de otro: el base con sus tallas, normales y de pedido especial, sus canales y sus precios base", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM productos WHERE nombre = 'Playera polo blanca lisa'",
		);
		const respuesta = await alta({ origen: "catalogo", producto_base_id: String(rows[0]?.id) });
		const { base } = respuesta.cuerpo.resultado as Alta;
		expect(base?.nombre).toBe("Playera polo blanca lisa");
		expect(base?.tallas).toHaveLength(14);
		expect(base?.tallas.filter((talla) => talla.es_pedido_especial)).toHaveLength(3);
		expect(base?.canales).toEqual({ mostrador: true, en_linea: true, externos: true });
		expect(base?.precios.map((precio) => precio.precio_centavos).sort()).toEqual([15_000, 17_500, 17_500]);
	});

	it("Ventas a externos solo la lee desde un pedido, con la lista de su cliente; Bodega nunca", async () => {
		expect((await alta({ origen: "catalogo" }, "ventas")).estado).toBe(403);
		const { rows } = await servidor.base.dueno.query(
			"SELECT c.id, l.id AS lista FROM clientes c JOIN listas_precios l ON l.cliente_id = c.id LIMIT 1",
		);
		const respuesta = await alta({ origen: "pedido", cliente_id: String(rows[0]?.id) }, "ventas");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const resultado = respuesta.cuerpo.resultado as Alta;
		expect(resultado.cliente?.lista_id).toBe(rows[0]?.lista);
		expect(resultado.listas.map((lista) => lista.id)).toContain(rows[0]?.lista);
		expect((await alta({ origen: "catalogo" }, "bodega")).estado).toBe(403);
	});
});
