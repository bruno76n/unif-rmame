/**
 * Prueba de `compras.proveedor` con los datos de la muestra: su ficha para editar con su versión, su plazo y sus
 * entregas (las mismas de la lista de Proveedores), los materiales que surte con el habitual marcado y sus últimas 6
 * órdenes; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { proveedorDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El cajón de un proveedor: su plazo, sus entregas, lo que surte y sus órdenes", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada proveedor trae su ficha, el mismo plazo que la lista, lo que surte y sus últimas órdenes", async () => {
		const lista = await pedirConsulta(servidor, "compras.proveedores", {}, "compras");
		const deLaLista = (
			lista.cuerpo.resultado as {
				proveedores: { proveedor_id: string; tarda: number | null; a_tiempo: number; entregas: number }[];
			}
		).proveedores;
		for (const suyo of deLaLista) {
			const respuesta = await pedirConsulta(
				servidor,
				"compras.proveedor",
				{ proveedor_id: suyo.proveedor_id },
				"compras",
			);
			expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
			const leido = proveedorDeCompras.resultado.parse(respuesta.cuerpo.resultado);
			expect(leido.plazo).toMatchObject({ tarda: suyo.tarda, a_tiempo: suyo.a_tiempo, entregas: suyo.entregas });
			expect(leido.ordenes.length).toBeLessThanOrEqual(6);
			const { rows } = await servidor.base.dueno.query(
				"SELECT id FROM materiales WHERE proveedor_habitual_id = $1 AND baja_en IS NULL",
				[suyo.proveedor_id],
			);
			const habituales = (rows as { id: string }[]).map((fila) => fila.id).sort();
			expect(
				leido.materiales
					.filter((material) => material.habitual)
					.map((material) => material.material_id)
					.sort(),
			).toEqual(habituales);
		}
	});

	it("solo la piden las cuentas con Compras", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM proveedores LIMIT 1");
		for (const quien of ["aduana", "bodega", "contaduria"]) {
			const respuesta = await pedirConsulta(
				servidor,
				"compras.proveedor",
				{ proveedor_id: String(rows[0]?.id) },
				quien,
			);
			expect(respuesta.estado, quien).toBe(403);
		}
	});
});
