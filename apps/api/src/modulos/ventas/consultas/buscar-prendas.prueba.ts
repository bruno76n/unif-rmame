/**
 * Prueba de `ventas.buscar_prendas` y `ventas.precio_sugerido` con la muestra: los modelos de la escuela del cliente
 * con el precio de su lista, el buscador con todas sus palabras, una prenda con su sugerido y sus tallas, y que solo
 * Ventas los pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { clienteDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee del buscador. */
interface Buscador {
	grupos: {
		clave: string;
		titulo: string;
		productos: { producto_id: string; nombre: string; precio_centavos: number | null; origen: string | null }[];
	}[];
}

describe("El buscador de prendas y el precio sugerido para un cliente", () => {
	let servidor: ServidorDePrueba;
	let morelos: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		morelos = await clienteDeLaMuestra(servidor, "Colegio Morelos");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los modelos de su escuela primero, con el precio de su lista; el buscador pide todas sus palabras", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos });
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const buscador = respuesta.cuerpo.resultado as Buscador;
		expect(buscador.grupos[0]).toMatchObject({ clave: "cliente", titulo: "Modelos de Colegio Morelos" });
		expect(buscador.grupos[0]?.productos.some((producto) => producto.origen === "su lista")).toBe(true);
		const nada = await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos, buscar: "zzzz" });
		expect((nada.cuerpo.resultado as Buscador).grupos).toEqual([]);
		// Con todo el nombre de una prenda, sale esa prenda y solo las que llevan todas sus palabras.
		const primera = buscador.grupos[0]?.productos[0];
		const conNombre = (
			await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos, buscar: primera?.nombre ?? "" })
		).cuerpo.resultado as Buscador;
		const encontradas = conNombre.grupos.flatMap((grupo) => grupo.productos);
		expect(encontradas.map((producto) => producto.producto_id)).toContain(primera?.producto_id);
		expect(encontradas.length).toBeLessThan(buscador.grupos.flatMap((grupo) => grupo.productos).length);
	});

	it("una prenda con su sugerido para el cliente y sus tallas vigentes", async () => {
		const buscador = (await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos })).cuerpo
			.resultado as Buscador;
		const producto = buscador.grupos[0]?.productos[0];
		const respuesta = await pedirConsulta(servidor, "ventas.precio_sugerido", {
			cliente_id: morelos,
			producto_id: producto?.producto_id ?? "",
		});
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { prenda } = respuesta.cuerpo.resultado as {
			prenda: { sugerido_centavos: number | null; tallas: { cantidad: number }[] };
		};
		expect(prenda.sugerido_centavos).toBe(producto?.precio_centavos);
		expect(prenda.tallas.length).toBeGreaterThan(0);
		expect(prenda.tallas.every((talla) => talla.cantidad === 0)).toBe(true);
	});

	it("solo Ventas los pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos }, "bodega")).estado).toBe(
			403,
		);
		expect((await pedirConsulta(servidor, "ventas.buscar_prendas", { cliente_id: morelos }, "aduana")).estado).toBe(
			403,
		);
	});
});
