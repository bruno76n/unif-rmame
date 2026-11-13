/**
 * Prueba de `catalogo.listas_precios` con los datos de la muestra: Mostrador al abrir con En línea de referencia, qué
 * productos entran en cada lista (regla 7), la lista de un cliente con sus modelos sin precio, el buscador, y que los
 * precios no viajan a quien no es de Catálogo.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…») y docs/interfaz/fabrica/catalogo.md
 * («Listas de precios»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Listas {
	listas: { id: string; nombre: string; tipo: string }[];
	lista: {
		id: string;
		tipo: string;
		nombre: string;
		descripcion: string | null;
		cliente: { tipo: string; municipio: string } | null;
		modelos_sin_precio: number;
		referencia: string;
	};
	secciones: {
		nombre: string;
		productos: {
			id: string;
			nombre: string;
			escuela: string | null;
			precio_centavos: number | null;
			referencia_centavos: number | null;
			diferencia_centavos: number | null;
			vigente_desde: string | null;
			antes_centavos: number | null;
		}[];
	}[];
	total: number;
}

describe("catalogo.listas_precios: cada lista con sus productos y su referencia, solo para Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide una lista como Catálogo. */
	async function listas(parametros: Record<string, string> = {}): Promise<Listas> {
		const respuesta = await pedirConsulta(servidor, "catalogo.listas_precios", parametros, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Listas;
	}

	/** Todos los productos de la respuesta. */
	const productos = (resultado: Listas) => resultado.secciones.flatMap((seccion) => seccion.productos);

	it("abre en Mostrador: los activos que se venden en mostrador, con En línea de referencia", async () => {
		const resultado = await listas();
		expect(resultado.lista).toMatchObject({
			tipo: "mostrador",
			nombre: "Mostrador",
			descripcion: "La que cobran las dos tiendas en el mostrador.",
			cliente: null,
			referencia: "En línea",
		});
		expect(resultado.listas.slice(0, 3).map((lista) => lista.tipo)).toEqual(["mostrador", "mayoreo", "en_linea"]);
		expect(resultado.listas.some((lista) => lista.tipo === "cliente")).toBe(true);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM productos WHERE baja_en IS NULL AND canal_mostrador",
		);
		expect(productos(resultado)).toHaveLength(rows[0]?.n);
		expect(resultado.total).toBe(rows[0]?.n);
		const lisa = productos(resultado).find((producto) => producto.nombre === "Playera polo blanca lisa");
		expect(lisa).toMatchObject({
			precio_centavos: 17_500,
			referencia_centavos: 17_500,
			diferencia_centavos: 0,
			antes_centavos: null,
		});
		expect(lisa?.vigente_desde).not.toBeNull();
	});

	it("en Mayoreo la referencia es Mostrador y la diferencia es su resta", async () => {
		const inicio = await listas();
		const mayoreo = inicio.listas.find((lista) => lista.tipo === "mayoreo");
		const resultado = await listas({ lista_id: mayoreo?.id ?? "" });
		expect(resultado.lista.referencia).toBe("Mostrador");
		const lisa = productos(resultado).find((producto) => producto.nombre === "Playera polo blanca lisa");
		expect(lisa).toMatchObject({ precio_centavos: 15_000, referencia_centavos: 17_500, diferencia_centavos: -2_500 });
	});

	it("la lista de un cliente escuela: sus productos a externos con precio o de su escuela, y sus modelos sin precio", async () => {
		const { rows } = await servidor.base.dueno.query(
			`SELECT l.id, l.nombre, c.municipio, c.escuela_id FROM listas_precios l JOIN clientes c ON c.id = l.cliente_id
			 WHERE c.tipo = 'escuela' AND l.baja_en IS NULL ORDER BY l.nombre LIMIT 1`,
		);
		const cliente = rows[0];
		const resultado = await listas({ lista_id: String(cliente?.id) });
		expect(resultado.lista).toMatchObject({
			tipo: "cliente",
			nombre: cliente?.nombre,
			cliente: { tipo: "escuela", municipio: cliente?.municipio },
			referencia: "Mostrador",
		});
		const { rows: esperados } = await servidor.base.dueno.query(
			`SELECT p.id FROM productos p WHERE p.baja_en IS NULL AND p.canal_externos AND (p.escuela_id = $1
			   OR EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = $2 AND pr.vigente_hasta IS NULL))`,
			[cliente?.escuela_id, cliente?.id],
		);
		expect(
			productos(resultado)
				.map((producto) => producto.id)
				.sort(),
		).toEqual(esperados.map((fila) => String(fila.id)).sort());
		expect(resultado.lista.modelos_sin_precio).toBe(
			productos(resultado).filter((producto) => producto.precio_centavos === null).length,
		);
	});

	it("el buscador deja solo los productos que lo tienen en su nombre o en su escuela", async () => {
		const resultado = await listas({ buscar: "suéter" });
		expect(productos(resultado).length).toBeGreaterThan(0);
		expect(productos(resultado).every((producto) => producto.nombre.toLowerCase().includes("suéter"))).toBe(true);
	});

	it("las listas son precios: Bodega, Aduana y Calidad no la leen", async () => {
		for (const quien of ["bodega", "aduana", "calidad"]) {
			const respuesta = await pedirConsulta(servidor, "catalogo.listas_precios", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
		}
	});
});
