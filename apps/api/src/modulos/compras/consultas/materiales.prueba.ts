/**
 * Prueba de `compras.materiales` con los datos de la muestra: los activos con su proveedor, su último precio, lo libre
 * y su estado; «Dados de baja» con los dados de baja; lo que pide «Nuevo material» (las unidades de Configuración, los
 * proveedores y los días que propone); la búsqueda; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, en lo que se revisa. */
interface Materiales {
	materiales: {
		material_id: string;
		version: number;
		nombre: string;
		tipo: string;
		ultimo_precio_centavos: number | null;
		estado: { texto: string; abajo: string | null };
		dado_de_baja: boolean;
	}[];
	para_nuevo: { unidades: { clave: string }[]; proveedores: unknown[]; dias_cubre_inicial: number };
}

describe("Materiales: los activos con su existencia y su estado, los dados de baja y lo de «Nuevo material»", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Materiales como Compras. */
	async function materiales(parametros: Record<string, string> = {}): Promise<Materiales> {
		const respuesta = await pedirConsulta(servidor, "compras.materiales", parametros, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Materiales;
	}

	it("trae los activos con su último precio y su estado, y lo que pide «Nuevo material»", async () => {
		const resultado = await materiales();
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM materiales WHERE baja_en IS NULL");
		expect(resultado.materiales).toHaveLength(Number(rows[0]?.n));
		for (const material of resultado.materiales) {
			expect(material.dado_de_baja).toBe(false);
			expect(material.ultimo_precio_centavos).toBeGreaterThan(0);
			expect(["Sin tiempo de entrega", "Pedir esta semana", "Alcanza"]).toContain(material.estado.texto);
		}
		expect(resultado.para_nuevo.unidades.map((unidad) => unidad.clave)).toEqual(
			expect.arrayContaining(["m", "pza", "conos", "cajas"]),
		);
		expect(resultado.para_nuevo.proveedores.length).toBeGreaterThan(0);
		expect(resultado.para_nuevo.dias_cubre_inicial).toBe(60);
		const gabardinas = await materiales({ buscar: "gabardina" });
		expect(gabardinas.materiales.every((material) => /gabardina/i.test(material.nombre))).toBe(true);
	});

	it("«Dados de baja» muestra solo los dados de baja", async () => {
		const nuevo = await mandarAccion(
			servidor,
			"compras.crear_material",
			{
				datos: {
					nombre: "Etiqueta de prueba para baja",
					tipo: "avio",
					unidad: "pza",
					proveedor_id: ((await materiales()).para_nuevo.proveedores[0] as { proveedor_id: string }).proveedor_id,
					costo_centavos: 50,
					minimo: 0,
					multiplo_compra: 1,
					dias_cubre: 60,
				},
			},
			"compras",
		);
		expect(nuevo.estado, JSON.stringify(nuevo.cuerpo)).toBe(200);
		const id = (nuevo.cuerpo.resultado as { material_id: string }).material_id;
		const creado = (await materiales()).materiales.find((material) => material.material_id === id);
		const baja = await mandarAccion(
			servidor,
			"compras.dar_baja_material",
			{ datos: { material_id: id, motivo: "Ya no se usa" }, version: creado?.version ?? 0 },
			"compras",
		);
		expect(baja.estado, JSON.stringify(baja.cuerpo)).toBe(200);
		expect((await materiales()).materiales.some((material) => material.material_id === id)).toBe(false);
		const bajas = await materiales({ incluir_bajas: "si" });
		expect(bajas.materiales.map((material) => material.material_id)).toContain(id);
		expect(bajas.materiales.every((material) => material.dado_de_baja)).toBe(true);
	});

	it("solo la piden las cuentas con Compras: Aduana y Bodega nunca reciben precios", async () => {
		for (const quien of ["aduana", "bodega", "patronaje"]) {
			const respuesta = await pedirConsulta(servidor, "compras.materiales", {}, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/precio/);
		}
	});
});
