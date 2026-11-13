/**
 * Prueba de `compras.proveedores` con los datos de la muestra: los activos con lo que dicen y lo que tardan (con el
 * tono de la regla: verde, ámbar a un día, rojo a más; gris sin entregas), sus entregas a tiempo, su condición y su
 * teléfono legible; la búsqueda; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { tonoDeEntregas, tonoDelPlazo } from "./proveedores.ts";

/** Un proveedor de la lista, en lo que se revisa. */
interface ProveedorDeLaLista {
	nombre: string;
	ciudad: string;
	dice: number;
	tarda: number | null;
	tono_plazo: string;
	a_tiempo: number;
	entregas: number;
	tono_entregas: string;
	condicion: string;
	telefono: string;
}

describe("Proveedores: lo que dicen que tardan contra lo que tardan, y sus entregas a tiempo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los tonos del plazo y de las entregas siguen la regla de la pantalla", () => {
		expect([tonoDelPlazo(12, null), tonoDelPlazo(12, 12), tonoDelPlazo(12, 13), tonoDelPlazo(12, 14)]).toEqual([
			"gris",
			"verde",
			"ambar",
			"rojo",
		]);
		expect([tonoDeEntregas(0, 0), tonoDeEntregas(5, 12), tonoDeEntregas(6, 8), tonoDeEntregas(8, 10)]).toEqual([
			"gris",
			"rojo",
			"ambar",
			"verde",
		]);
	});

	it("trae los activos con su plazo, sus entregas, su condición y su teléfono", async () => {
		const respuesta = await pedirConsulta(servidor, "compras.proveedores", {}, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { proveedores } = respuesta.cuerpo.resultado as { proveedores: ProveedorDeLaLista[] };
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM proveedores WHERE baja_en IS NULL",
		);
		expect(proveedores).toHaveLength(Number(rows[0]?.n));
		for (const proveedor of proveedores) {
			expect(proveedor.tono_plazo).toBe(tonoDelPlazo(proveedor.dice, proveedor.tarda));
			expect(proveedor.tono_entregas).toBe(tonoDeEntregas(proveedor.a_tiempo, proveedor.entregas));
			expect(proveedor.condicion).toMatch(/^(Contado|Crédito \d+ días?)$/);
			expect(proveedor.telefono).toMatch(/^\d{2,3} \d{3,4} \d{4}$/);
		}
		const aurora = await pedirConsulta(servidor, "compras.proveedores", { buscar: "león" }, "compras");
		const deLeon = (aurora.cuerpo.resultado as { proveedores: ProveedorDeLaLista[] }).proveedores;
		expect(deLeon.map((proveedor) => proveedor.nombre)).toEqual(["Textiles Aurora"]);
	});

	it("solo la piden las cuentas con Compras", async () => {
		for (const quien of ["aduana", "bodega", "contaduria"]) {
			expect((await pedirConsulta(servidor, "compras.proveedores", {}, quien)).estado, quien).toBe(403);
		}
	});
});
