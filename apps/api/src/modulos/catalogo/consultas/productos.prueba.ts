/**
 * Prueba de `catalogo.productos` con los datos de la muestra: por sección, con su rango de tallas, sus variantes, su
 * precio de Mostrador y lo que lo detiene; los filtros, el buscador (también por código) y las píldoras; y que los
 * precios no viajan a quien no es de Catálogo.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…») y docs/interfaz/fabrica/catalogo.md
 * («Productos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un producto como lo regresa la consulta. */
interface Producto {
	id: string;
	nombre: string;
	escuela: { nombre: string } | null;
	categoria: string;
	canales: { mostrador: boolean; en_linea: boolean; externos: boolean };
	tallas: string;
	variantes: number;
	por_pedido: number;
	mostrador_centavos: number | null;
	descontinuado: boolean;
	detiene: { tipo: string; cuantas?: number; lista?: string }[];
}

/** Lo que regresa la consulta. */
interface Productos {
	secciones: { nombre: string; productos: Producto[] }[];
	total: number;
	pildoras: { todo: number; sin_foto: number; sin_etiqueta: number; sin_precio_cliente: number };
	filtros: { secciones: { id: string; nombre: string }[]; escuelas: { id: string; nombre: string }[] };
}

describe("catalogo.productos: los productos por sección con sus filtros, solo para Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Productos como Catálogo. */
	async function productos(parametros: Record<string, string> = {}): Promise<Productos> {
		const respuesta = await pedirConsulta(servidor, "catalogo.productos", parametros, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Productos;
	}

	/** Todos los productos de la respuesta. */
	const todos = (resultado: Productos) => resultado.secciones.flatMap((seccion) => seccion.productos);

	it("abre con los activos por sección, en su orden, con tallas, variantes, Mostrador y lo que los detiene", async () => {
		const resultado = await productos();
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM productos WHERE baja_en IS NULL AND nombre <> 'Playera de prueba'",
		);
		expect(todos(resultado).filter((producto) => producto.nombre !== "Playera de prueba")).toHaveLength(rows[0]?.n);
		expect(resultado.total).toBe(todos(resultado).length);
		expect(resultado.secciones[0]?.nombre).toBe("Playeras");
		expect(todos(resultado).every((producto) => !producto.descontinuado)).toBe(true);
		const lisa = todos(resultado).find((producto) => producto.nombre === "Playera polo blanca lisa");
		expect(lisa).toMatchObject({
			escuela: null,
			categoria: "Básico",
			canales: { mostrador: true, en_linea: true, externos: true },
			tallas: "4 a 16 y CH a XG",
			variantes: 14,
			por_pedido: 3,
			mostrador_centavos: 17_500,
			detiene: [{ tipo: "sin_foto" }],
		});
		const nueva = todos(resultado).find(
			(producto) =>
				producto.nombre === "Playera polo blanca con escudo" && producto.escuela?.nombre === "Secundaria Técnica 12",
		);
		expect(nueva?.detiene).toContainEqual({ tipo: "sin_etiqueta", cuantas: 9 });
	});

	it("los filtros: descontinuados, básicos, por canal y por sección", async () => {
		const descontinuados = todos(await productos({ estado: "descontinuados" }));
		expect(descontinuados.map((producto) => producto.nombre).sort()).toEqual([
			"Playera polo gris lisa",
			"Suéter marino liso",
		]);
		expect(descontinuados.every((producto) => producto.detiene[0]?.tipo === "descontinuado")).toBe(true);
		expect(todos(await productos({ escuela: "basico" })).every((producto) => producto.escuela === null)).toBe(true);
		expect(todos(await productos({ canal: "externos" })).every((producto) => producto.canales.externos)).toBe(true);
		const filtros = (await productos()).filtros;
		const pantalones = filtros.secciones.find((seccion) => seccion.nombre === "Pantalones");
		const soloPantalones = await productos({ seccion_id: pantalones?.id ?? "" });
		expect(soloPantalones.secciones.map((seccion) => seccion.nombre)).toEqual(["Pantalones"]);
		expect(filtros.escuelas).toHaveLength(6);
	});

	it("el buscador encuentra por producto, por escuela y, con 4 cifras o más, por el principio del código", async () => {
		expect(
			todos(await productos({ buscar: "jumper" }))
				.map((producto) => producto.nombre)
				.sort(),
		).toEqual(["Jumper azul marino", "Jumper cuadros"]);
		expect(
			todos(await productos({ buscar: "Gabriela" })).every((producto) => producto.escuela?.nombre.includes("Gabriela")),
		).toBe(true);
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.codigo, p.nombre FROM variantes v JOIN productos p ON p.id = v.producto_id
			 WHERE p.nombre = 'Pants marino liso' ORDER BY v.codigo LIMIT 1`,
		);
		const codigo = String(rows[0]?.codigo);
		const porCodigo = todos(await productos({ buscar: codigo }));
		expect(porCodigo.map((producto) => producto.nombre)).toEqual(["Pants marino liso"]);
	});

	it("las píldoras cuentan lo que dicen y escoger una filtra", async () => {
		const resultado = await productos();
		expect(resultado.pildoras.todo).toBe(resultado.total);
		const sinEtiqueta = todos(await productos({ pildora: "sin_etiqueta" }));
		expect(sinEtiqueta).toHaveLength(resultado.pildoras.sin_etiqueta);
		expect(sinEtiqueta.every((producto) => producto.detiene.some((uno) => uno.tipo === "sin_etiqueta"))).toBe(true);
		const sinPrecio = todos(await productos({ pildora: "sin_precio_cliente" }));
		expect(sinPrecio).toHaveLength(resultado.pildoras.sin_precio_cliente);
		expect(sinPrecio.every((producto) => producto.detiene.some((uno) => uno.tipo === "sin_precio"))).toBe(true);
		const sinFoto = todos(await productos({ pildora: "sin_foto" }));
		expect(sinFoto).toHaveLength(resultado.pildoras.sin_foto);
		expect(sinFoto.every((producto) => producto.canales.en_linea)).toBe(true);
	});

	it("los precios no viajan: Bodega, Aduana y Producción no la leen", async () => {
		for (const quien of ["bodega", "aduana", "produccion"]) {
			const respuesta = await pedirConsulta(servidor, "catalogo.productos", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toContain("centavos");
		}
	});
});
