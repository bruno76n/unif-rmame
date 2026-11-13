/**
 * Prueba de `catalogo.pendientes` y de la pastilla de Catálogo, con los datos de la muestra: los modelos sin precio de
 * cada cliente, las etiquetas nuevas por producto, las que se reimprimen solo con `catalogo.etiqueta_lleva_precio`, las
 * cifras de la barra; solo Catálogo la lee; la pastilla cuenta productos distintos y nunca va roja.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «El menú solo muestra… cada pastilla cuenta lo que dice su
 * archivo») y docs/interfaz/fabrica/catalogo.md («Pendientes», «Quién entra»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, lo que mira la prueba. */
interface Pendientes {
	cifras: {
		productos_activos: number;
		modelos_sin_precio: number;
		listas: number;
		siguiente_codigo: string | null;
		cambios_por_semana: number[];
		cambios_esta_semana: number;
		variantes_sin_etiqueta: number;
		productos_con_etiquetas_nuevas: number;
	};
	renglones: {
		tipo: string;
		grupo: string;
		producto_id: string;
		producto: string;
		escuela: string | null;
		lista: string | null;
		tallas: string[];
	}[];
	conteos: { todos: number; productos: number; etiquetas: number };
}

describe("catalogo.pendientes: lo que Catálogo tiene por hacer, solo para Catálogo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Pide Pendientes como Catálogo. */
	async function pendientes(parametros: Record<string, string> = {}): Promise<Pendientes> {
		const respuesta = await pedirConsulta(servidor, "catalogo.pendientes", parametros, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	it("las etiquetas nuevas van por producto con sus tallas en orden, y las cifras salen de la muestra", async () => {
		const resultado = await pendientes();
		const etiquetas = resultado.renglones.filter((renglon) => renglon.tipo === "etiquetas");
		// La muestra deja por imprimir las tallas normales de dos productos nuevos de la Secundaria Técnica 12.
		expect(etiquetas.map((renglon) => [renglon.producto, renglon.escuela]).sort()).toEqual([
			["Playera polo blanca con escudo", "Secundaria Técnica 12"],
			["Suéter verde con escudo", "Secundaria Técnica 12"],
		]);
		const playera = etiquetas.find((renglon) => renglon.producto.startsWith("Playera"));
		expect(playera?.tallas).toEqual(["8", "10", "12", "14", "16", "CH", "M", "G", "XG"]);
		const [porImprimir] = await consultar(
			`SELECT count(*)::int AS n, count(DISTINCT v.producto_id)::int AS productos FROM variantes v
			 JOIN productos p ON p.id = v.producto_id
			 WHERE v.estado_etiqueta = 'por_imprimir' AND v.baja_en IS NULL AND p.baja_en IS NULL`,
		);
		expect(resultado.cifras.variantes_sin_etiqueta).toBe(porImprimir?.n);
		expect(resultado.cifras.productos_con_etiquetas_nuevas).toBe(porImprimir?.productos);
		const [activos] = await consultar("SELECT count(*)::int AS n FROM productos WHERE baja_en IS NULL");
		expect(resultado.cifras.productos_activos).toBe(activos?.n);
		expect(resultado.cifras.siguiente_codigo).toMatch(/^\d{6}$/);
		expect(resultado.cifras.cambios_por_semana).toHaveLength(6);
		expect(resultado.cifras.cambios_esta_semana).toBe(resultado.cifras.cambios_por_semana.at(-1));
		expect(resultado.conteos).toEqual({
			todos: resultado.renglones.length,
			productos: resultado.renglones.filter((renglon) => renglon.grupo === "productos").length,
			etiquetas: etiquetas.length,
		});
	});

	it("un modelo de la escuela de un cliente, a externos y sin precio base en su lista, es «Modelo sin precio»", async () => {
		const resultado = await pendientes();
		const modelos = resultado.renglones.filter((renglon) => renglon.tipo === "modelo_sin_precio");
		expect(resultado.cifras.modelos_sin_precio).toBe(modelos.length);
		// Cada uno: activo, a externos, de la escuela del cliente dueño de la lista, sin precio base vigente en ella.
		for (const modelo of modelos) {
			const filas = await consultar(
				`SELECT 1 FROM productos p JOIN clientes c ON c.escuela_id = p.escuela_id
				 JOIN listas_precios l ON l.cliente_id = c.id
				 WHERE p.id = $1 AND l.nombre = $2 AND p.baja_en IS NULL AND p.canal_externos AND l.baja_en IS NULL
				   AND NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = l.id
				     AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL)`,
				[modelo.producto_id, modelo.lista],
			);
			expect(filas, `${modelo.producto} · ${modelo.lista}`).toHaveLength(1);
			expect(modelo.grupo).toBe("productos");
		}
		// Y al revés: todo modelo así sale.
		const [esperados] = await consultar(
			`SELECT count(*)::int AS n FROM productos p JOIN clientes c ON c.escuela_id = p.escuela_id
			 JOIN listas_precios l ON l.cliente_id = c.id
			 WHERE p.baja_en IS NULL AND p.canal_externos AND l.baja_en IS NULL AND c.baja_en IS NULL
			   AND NOT EXISTS (SELECT 1 FROM precios pr WHERE pr.producto_id = p.id AND pr.lista_id = l.id
			     AND pr.variante_id IS NULL AND pr.vigente_hasta IS NULL)`,
		);
		expect(modelos.length).toBe(esperados?.n);
		expect(modelos.length).toBeGreaterThan(0);
	});

	it("el grupo filtra los renglones y los conteos siguen siendo de todos", async () => {
		const todos = await pendientes();
		const etiquetas = await pendientes({ grupo: "etiquetas" });
		expect(etiquetas.renglones.every((renglon) => renglon.grupo === "etiquetas")).toBe(true);
		expect(etiquetas.renglones).toHaveLength(todos.conteos.etiquetas);
		expect(etiquetas.conteos).toEqual(todos.conteos);
	});

	it("«Reimprimir» sale solo con `catalogo.etiqueta_lleva_precio` encendido", async () => {
		const [impresa] = await consultar(
			`SELECT v.id, p.nombre FROM variantes v JOIN productos p ON p.id = v.producto_id
			 WHERE v.estado_etiqueta = 'impresa' AND p.baja_en IS NULL AND p.nombre = 'Pants marino liso' LIMIT 1`,
		);
		await consultar("UPDATE variantes SET estado_etiqueta = 'por_reimprimir', reimprimir_desde = now() WHERE id = $1", [
			impresa?.id,
		]);
		try {
			expect((await pendientes()).renglones.some((renglon) => renglon.tipo === "reimprimir")).toBe(false);
			await consultar("UPDATE parametros SET valor_booleano = true WHERE clave = 'catalogo.etiqueta_lleva_precio'");
			const conPrecio = await pendientes({ grupo: "etiquetas" });
			const reimprimir = conPrecio.renglones.filter((renglon) => renglon.tipo === "reimprimir");
			expect(reimprimir.map((renglon) => renglon.producto)).toEqual(["Pants marino liso"]);
			expect(reimprimir[0]?.tallas).toHaveLength(1);
		} finally {
			await consultar("UPDATE parametros SET valor_booleano = false WHERE clave = 'catalogo.etiqueta_lleva_precio'");
			await consultar("UPDATE variantes SET estado_etiqueta = 'impresa', reimprimir_desde = NULL WHERE id = $1", [
				impresa?.id,
			]);
		}
	});

	it("solo Catálogo (y la dueña) la leen: Bodega, Aduana y Ventas no", async () => {
		for (const quien of ["bodega", "aduana", "ventas"]) {
			const respuesta = await pedirConsulta(servidor, "catalogo.pendientes", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
		}
		expect((await pedirConsulta(servidor, "catalogo.pendientes", {}, "duena")).estado).toBe(200);
	});

	it("la pastilla del menú cuenta los productos distintos con algo pendiente y nunca va roja", async () => {
		const resultado = await pendientes();
		const distintos = new Set(resultado.renglones.map((renglon) => renglon.producto_id)).size;
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "catalogo");
		const catalogo = (
			armazon.cuerpo.resultado as { departamentos: { clave: string; conteo: number | null; rojo: boolean }[] }
		).departamentos.find((departamento) => departamento.clave === "catalogo");
		expect(catalogo).toMatchObject({ conteo: distintos === 0 ? null : distintos, rojo: false });
	});
});
