/**
 * Prueba de `compras.por_pedir` con los datos de la muestra: cada material activo con su estado y su línea, de lo más
 * urgente a lo menos; la búsqueda por todas las palabras y el filtro por proveedor; los dos horizontes con sus
 * parámetros; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, en lo que se revisa. */
interface PorPedir {
	horizonte: { tipo: string; hasta: string; semanas: number; regreso_clases: string };
	meses: { inicio: string; factor: string }[];
	proveedores: { proveedor_id: string; nombre: string }[];
	materiales: { nombre: string; proveedor: string; estado: string; linea: string; dias_sin_material: number }[];
	hoy: string;
}

describe("Por pedir: la línea de tiempo de cada material, de lo más urgente a lo menos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Por pedir como Compras. */
	async function porPedir(parametros: Record<string, string> = {}): Promise<PorPedir> {
		const respuesta = await pedirConsulta(servidor, "compras.por_pedir", parametros, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as PorPedir;
	}

	it("trae todos los materiales activos, de lo más urgente a lo menos, con su estado y su línea", async () => {
		const { materiales } = await porPedir();
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM materiales WHERE baja_en IS NULL");
		expect(materiales).toHaveLength(Number(rows[0]?.n));
		const orden = ["sin_tiempo_de_entrega", "pedir_esta_semana", "alcanza"];
		const lugares = materiales.map((material) => orden.indexOf(material.estado));
		expect(lugares).toEqual([...lugares].sort((uno, otro) => uno - otro));
		for (const material of materiales.filter((uno) => uno.estado === "sin_tiempo_de_entrega")) {
			expect(material.linea).toMatch(/^Faltará material \d+ días?$/);
			expect(material.dias_sin_material).toBeGreaterThan(0);
		}
	});

	it("busca por todas las palabras y filtra por proveedor", async () => {
		const todos = await porPedir();
		const gabardinas = await porPedir({ buscar: "gabardina marino" });
		expect(gabardinas.materiales.length).toBeGreaterThan(0);
		expect(gabardinas.materiales.every((material) => /gabardina/i.test(material.nombre))).toBe(true);
		const [proveedor] = todos.proveedores;
		if (proveedor === undefined) throw new Error("la muestra no trae proveedores");
		const suyos = await porPedir({ proveedor_id: proveedor.proveedor_id });
		expect(suyos.materiales.length).toBeGreaterThan(0);
		expect(suyos.materiales.length).toBeLessThanOrEqual(todos.materiales.length);
		expect((await porPedir({ buscar: "nada que se llame así" })).materiales).toHaveLength(0);
	});

	it("el horizonte corto son las semanas del parámetro; el largo llega al fin del mes del regreso a clases", async () => {
		const corto = await porPedir();
		expect(corto.horizonte.semanas).toBe(12);
		expect(corto.horizonte.hasta).toBe(
			new Date(new Date(`${corto.hoy}T12:00:00Z`).getTime() + 84 * 86_400_000).toISOString().slice(0, 10),
		);
		const largo = await porPedir({ horizonte: "regreso_clases" });
		expect(largo.horizonte.regreso_clases).toBe("2027-08-17");
		expect(largo.horizonte.hasta).toBe("2027-08-31");
		expect(largo.meses.at(-1)?.factor).toBe("2.2");
		expect(largo.meses[0]?.inicio).toBe(largo.hoy);
	});

	it("solo la piden las cuentas con Compras", async () => {
		for (const quien of ["aduana", "bodega", "contaduria"]) {
			expect((await pedirConsulta(servidor, "compras.por_pedir", {}, quien)).estado, quien).toBe(403);
		}
	});
});
