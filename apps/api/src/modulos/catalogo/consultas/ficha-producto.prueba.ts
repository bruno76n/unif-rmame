/**
 * Prueba de `catalogo.ficha_producto` con los datos de la muestra: las columnas de listas, los precios vigentes, cada
 * talla con su código, su estado y su existencia en toda la fábrica; la talla dada de baja con quién y por qué; las
 * tallas que se pueden agregar; la receta y su resumen; los últimos cambios; si la cuenta tiene Patronaje; y solo
 * Catálogo la lee.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/catalogo.md («Ficha de producto»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface Ficha {
	producto: { nombre: string; version: number; seccion: { lleva_receta: boolean }; canales: Record<string, boolean> };
	listas: { id: string; tipo: string; nombre: string }[];
	otras_listas: { id: string; nombre: string }[];
	precios: { lista_id: string; variante_id: string | null; precio_centavos: number }[];
	variantes: {
		id: string;
		talla: string;
		codigo: string;
		es_pedido_especial: boolean;
		estado: string;
		existencia: number | null;
		baja: { en: string; por: string; motivo: string } | null;
	}[];
	pocas_piezas: number;
	agregar: { tallas: { talla: string; tuvo_baja: boolean }[]; siguiente_codigo: string | null };
	receta: { estado: string; version: number | null } | null;
	cambios: { descripcion: string }[];
	puede_patronaje: boolean;
}

describe("catalogo.ficha_producto: la ficha de un producto, solo para Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El id de un producto por su nombre (el primero). */
	async function idDe(nombre: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM productos WHERE nombre = $1 LIMIT 1", [nombre]);
		return String(rows[0]?.id);
	}

	/** Pide la ficha de un producto. */
	async function ficha(nombre: string, quien = "catalogo"): Promise<Ficha> {
		const respuesta = await pedirConsulta(
			servidor,
			"catalogo.ficha_producto",
			{ producto_id: await idDe(nombre) },
			quien,
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Ficha;
	}

	it("las columnas de las listas, los precios base y cada talla con su código y su existencia total", async () => {
		const resultado = await ficha("Playera polo blanca lisa");
		expect(resultado.listas.slice(0, 3).map((lista) => lista.tipo)).toEqual(["mostrador", "mayoreo", "en_linea"]);
		const mostrador = resultado.listas[0]?.id;
		expect(
			resultado.precios.find((precio) => precio.lista_id === mostrador && precio.variante_id === null)?.precio_centavos,
		).toBe(17_500);
		expect(resultado.variantes).toHaveLength(14);
		expect(resultado.variantes.filter((variante) => variante.es_pedido_especial)).toHaveLength(3);
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.id, sum(e.piezas)::int AS piezas FROM variantes v JOIN productos p ON p.id = v.producto_id
			 LEFT JOIN existencias e ON e.variante_id = v.id WHERE p.nombre = 'Playera polo blanca lisa'
			 GROUP BY v.id`,
		);
		for (const variante of resultado.variantes) {
			const fila = rows.find((una) => una.id === variante.id);
			expect(variante.existencia, variante.talla).toBe(fila?.piezas ?? null);
		}
		expect(resultado.pocas_piezas).toBe(5);
		expect(resultado.agregar.tallas).toEqual([]);
		expect(resultado.agregar.siguiente_codigo).toMatch(/^\d{6}$/);
	});

	it("una talla dada de baja dice cuándo, quién y por qué, y se puede volver a agregar con código nuevo", async () => {
		const resultado = await ficha("Pants marino liso");
		const tres = resultado.variantes.find((variante) => variante.talla === "3");
		expect(tres?.estado).toBe("baja");
		expect(tres?.baja?.motivo.length).toBeGreaterThan(4);
		expect(tres?.baja?.por).not.toBe("");
		expect(resultado.agregar.tallas).toContainEqual(expect.objectContaining({ talla: "3", tuvo_baja: true }));
	});

	it("la receta sale en una sección que la lleva y no en Accesorios y servicios", async () => {
		const playera = await ficha("Playera polo blanca lisa");
		expect(playera.receta).not.toBeNull();
		const { rows } = await servidor.base.dueno.query(
			`SELECT r.estado FROM recetas r JOIN productos p ON p.id = r.producto_id WHERE p.nombre = 'Playera polo blanca lisa'`,
		);
		expect(playera.receta?.estado).toBe(rows[0]?.estado ?? "sin_receta");
		expect((await ficha("Calcetas blancas (par)")).receta).toBeNull();
	});

	it("los cambios recientes son los últimos 5 de su historial", async () => {
		const resultado = await ficha("Pants marino liso");
		expect(resultado.cambios.length).toBeGreaterThan(0);
		expect(resultado.cambios.length).toBeLessThanOrEqual(5);
	});

	it("dice si la cuenta tiene Patronaje: Catálogo sola no, la dueña sí", async () => {
		expect((await ficha("Pants marino liso")).puede_patronaje).toBe(false);
		expect((await ficha("Pants marino liso", "duena")).puede_patronaje).toBe(true);
	});

	it("solo Catálogo la lee: Bodega y Aduana no reciben precios; un producto que no existe es 404", async () => {
		const id = await idDe("Pants marino liso");
		for (const quien of ["bodega", "aduana"]) {
			const respuesta = await pedirConsulta(servidor, "catalogo.ficha_producto", { producto_id: id }, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toContain("centavos");
		}
		const ninguno = await pedirConsulta(servidor, "catalogo.ficha_producto", { producto_id: uuidv7() }, "catalogo");
		expect(ninguno.estado).toBe(404);
	});
});
