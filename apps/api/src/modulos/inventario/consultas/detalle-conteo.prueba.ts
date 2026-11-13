/**
 * Prueba de `inventario.detalle_conteo`: el conteo ciego de una sección trae sus variantes sin lo que dice el sistema;
 * el de una diferencia, solo su variante en su ubicación (y `422` si ya no está por contar); la carga inicial dice qué
 * variantes ya tienen movimientos; Aduana solo cuenta en Aduana; y las demás cuentas no lo piden.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/modulos/inventario/conteos.md (regla 1: el conteo es ciego)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { abrirDiferenciaYExcepcion, pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	ubicaciones: { id: string; nombre: string }[];
	secciones: { id: string }[];
	motivos_ajuste: unknown[];
	diferencia: { folio: string; ubicacion: string } | null;
	variantes: { variante_id: string; prenda: string; con_movimientos: boolean }[];
}

describe("El conteo ciego: las variantes que se cuentan, sin lo que dice el sistema", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta. */
	const detalle = async (parametros: Record<string, string>, quien = "bodega") =>
		(await pedir(servidor, "inventario.detalle_conteo", parametros, quien)) as unknown as Detalle;

	it("una sección: sus variantes sin piezas del sistema; Bodega cuenta en Bodega o en Aduana, Aduana solo en Aduana", async () => {
		const seccion = await valorDe(
			servidor,
			"SELECT p.seccion_id FROM existencias e JOIN variantes v ON v.id = e.variante_id JOIN productos p ON p.id = v.producto_id ORDER BY e.id LIMIT 1",
		);
		const datos = await detalle({ seccion_id: seccion });
		expect(datos.variantes.length).toBeGreaterThan(0);
		expect(JSON.stringify(datos.variantes)).not.toMatch(/piezas|sistema|existencia/);
		expect(datos.ubicaciones.map((ubicacion) => ubicacion.nombre)).toEqual(["Aduana", "Bodega"]);
		expect(datos.motivos_ajuste.length).toBeGreaterThan(0);
		expect((await detalle({ seccion_id: seccion }, "aduana")).ubicaciones.map((ubicacion) => ubicacion.nombre)).toEqual(
			["Aduana"],
		);
	});

	it("la de una diferencia: solo su variante en su ubicación; ya contada, 422", async () => {
		const abiertas = await abrirDiferenciaYExcepcion(servidor);
		try {
			const datos = await detalle({ diferencia_id: abiertas.diferencia });
			expect(datos.diferencia).toMatchObject({ folio: "DF-PRUEBA", ubicacion: "Bodega" });
			expect(datos.variantes).toHaveLength(1);
			await servidor.base.dueno.query(
				"UPDATE diferencias SET estado = 'resuelta', resolucion = 'cuadro', resuelta_en = now() WHERE id = $1",
				[abiertas.diferencia],
			);
			const respuesta = await pedirConsulta(
				servidor,
				"inventario.detalle_conteo",
				{ diferencia_id: abiertas.diferencia },
				"bodega",
			);
			expect(respuesta.estado).toBe(422);
		} finally {
			await abiertas.quitar();
		}
	});

	it("la carga inicial de todo en Bodega dice qué variantes ya tienen movimientos ahí", async () => {
		const bodega = await valorDe(servidor, "SELECT id FROM ubicaciones WHERE tipo = 'bodega'");
		const datos = await detalle({ ubicacion_id: bodega, carga_inicial: "true" });
		expect(datos.variantes.some((variante) => variante.con_movimientos)).toBe(true);
	});

	it("solo la piden las cuentas con Bodega o Aduana, y no lleva precios ni costos", async () => {
		const seccion = await valorDe(servidor, "SELECT id FROM secciones ORDER BY orden LIMIT 1");
		await soloBodegaYSinPrecios(servidor, "inventario.detalle_conteo", { seccion_id: seccion }, ["aduana"]);
	});
});
