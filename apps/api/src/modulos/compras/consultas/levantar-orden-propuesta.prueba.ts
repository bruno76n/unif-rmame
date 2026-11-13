/**
 * Prueba de `compras.levantar_orden_propuesta` con los datos de la muestra: sin escoger, propone los materiales sin
 * tiempo de entrega y los de esta semana con su pedido sugerido; con escogidos, esos con sus cantidades; cada material
 * con los proveedores que lo surten y su último precio, y cada proveedor con su borrador; y que solo la piden las
 * cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta, en lo que se revisa. */
interface Propuesta {
	escogidos: { material_id: string; cantidad: number }[];
	materiales: {
		material_id: string;
		estado: string;
		sugerido: number;
		multiplo: number;
		proveedor_habitual_id: string;
		surtidores: { proveedor_id: string; ultimo_precio_centavos: number; habitual: boolean }[];
	}[];
	proveedores: { proveedor_id: string; borrador: string | null }[];
	umbral_cambio_precio_pct: number;
}

describe("Levantar orden: lo que se propone pedir, con quién y a qué precio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la propuesta como Compras. */
	async function propuesta(parametros: Record<string, string> = {}): Promise<Propuesta> {
		const respuesta = await pedirConsulta(servidor, "compras.levantar_orden_propuesta", parametros, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Propuesta;
	}

	it("sin escoger, propone lo sin tiempo de entrega y lo de esta semana con su pedido sugerido", async () => {
		const resultado = await propuesta();
		const porPedir = resultado.materiales.filter((material) => material.estado !== "alcanza");
		expect(resultado.escogidos).toEqual(
			porPedir.map((material) => ({ material_id: material.material_id, cantidad: material.sugerido })),
		);
		for (const material of resultado.materiales) {
			expect(material.sugerido % material.multiplo).toBe(0);
			const habitual = material.surtidores.find((surtidor) => surtidor.habitual);
			expect(habitual?.proveedor_id).toBe(material.proveedor_habitual_id);
			expect(material.surtidores.every((surtidor) => surtidor.ultimo_precio_centavos > 0)).toBe(true);
		}
		expect(resultado.umbral_cambio_precio_pct).toBe(15);
		const { rows } = await servidor.base.dueno.query(
			"SELECT proveedor_id, folio FROM ordenes_compra WHERE estado = 'borrador'",
		);
		for (const borrador of rows as { proveedor_id: string; folio: string }[]) {
			expect(resultado.proveedores.find((uno) => uno.proveedor_id === borrador.proveedor_id)?.borrador).toBe(
				borrador.folio,
			);
		}
	});

	it("con escogidos, trae esos con sus cantidades, en su orden", async () => {
		const { materiales } = await propuesta();
		const [uno, otro] = materiales.slice(-2);
		if (uno === undefined || otro === undefined) throw new Error("la muestra no trae materiales");
		const resultado = await propuesta({
			material_ids: `${uno.material_id},${otro.material_id}`,
			cantidades: "100,200",
		});
		expect(resultado.escogidos).toEqual([
			{ material_id: uno.material_id, cantidad: 100 },
			{ material_id: otro.material_id, cantidad: 200 },
		]);
		const sinCantidades = await propuesta({ material_ids: uno.material_id });
		expect(sinCantidades.escogidos).toEqual([{ material_id: uno.material_id, cantidad: uno.sugerido }]);
	});

	it("solo la piden las cuentas con Compras", async () => {
		for (const quien of ["aduana", "bodega"]) {
			expect((await pedirConsulta(servidor, "compras.levantar_orden_propuesta", {}, quien)).estado, quien).toBe(403);
		}
	});
});
