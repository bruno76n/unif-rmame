/**
 * Prueba de `inventario.ultimo_cuadre`: Dirección y Bodega ven el último cuadre, igual que la lectura del mismo nombre;
 * nadie más lo ve.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cada consulta revisa el departamento en el servidor: el último cuadre, solo para Dirección y Bodega", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("sin cuadres no hay último cuadre; con dos, regresa el de la fecha más nueva con sus contadores", async () => {
		const vacia = await pedirConsulta(servidor, "inventario.ultimo_cuadre", {}, "direccion");
		expect(vacia.estado, JSON.stringify(vacia.cuerpo)).toBe(200);
		expect(vacia.cuerpo.resultado).toEqual({ cuadre: null });
		const viejo = uuidv7();
		const nuevo = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO cuadres (id, fecha, iniciado_en, terminado_en, estado, diferencias_creadas, excepciones_creadas)
			 VALUES ($1, '2099-12-30', now(), now(), 'cuadro', 0, 0),
			        ($2, '2099-12-31', '2099-12-31T08:00:00Z', '2099-12-31T08:15:00Z', 'con_residuo', 2, 1)`,
			[viejo, nuevo],
		);
		for (const quien of ["direccion", "bodega", "duena"]) {
			const leido = await pedirConsulta(servidor, "inventario.ultimo_cuadre", {}, quien);
			expect(leido.estado).toBe(200);
			expect(leido.cuerpo.resultado).toMatchObject({
				cuadre: {
					cuadre_id: nuevo,
					fecha: "2099-12-31",
					estado: "con_residuo",
					diferencias_creadas: 2,
					excepciones_creadas: 1,
					error: null,
				},
			});
		}
	});

	it("una cuenta sin Dirección ni Bodega no lo ve", async () => {
		for (const quien of ["aduana", "ventas", "contaduria"]) {
			const leido = await pedirConsulta(servidor, "inventario.ultimo_cuadre", {}, quien);
			expect(leido.estado).toBe(403);
		}
	});
});
