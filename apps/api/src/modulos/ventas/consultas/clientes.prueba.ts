/**
 * Prueba de `ventas.clientes` y `ventas.cliente` con la muestra: las seis fichas con su crédito sin montos, el
 * detenido, los dados de baja con su motivo, los datos de un cliente para editarlos, las escuelas que todavía no son
 * cliente para el alta, y que solo Ventas los pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … saldos sin Contaduría…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { darDeAltaClienteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { clienteDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la pestaña. */
interface Clientes {
	fichas: {
		nombre: string;
		descripcion: string;
		credito: { texto: string; color: string };
		detenido: boolean;
		pedidos_abiertos: number;
		borradores: number;
	}[];
	de_baja: { cliente_id: string; nombre: string; motivo: string }[];
}

describe("Clientes: las fichas con su crédito sin montos, los dados de baja y el cajón del cliente", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("las seis fichas de la muestra con su crédito, sin saldos ni límites", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.clientes");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const clientes = respuesta.cuerpo.resultado as Clientes;
		expect(clientes.fichas).toHaveLength(6);
		expect(JSON.stringify(clientes)).not.toMatch(/centavos|saldo|limite/);
		expect(clientes.fichas.find((ficha) => ficha.nombre === "Uniformes El Bajío")).toMatchObject({
			detenido: true,
			credito: { texto: "Detenido por crédito", color: "rojo" },
		});
		expect(clientes.fichas.find((ficha) => ficha.nombre === "Instituto Juan Pablo II")).toMatchObject({
			descripcion: expect.stringMatching(/^Escuela en La Piedad, cliente desde \d{4}$/),
			borradores: 1,
		});
		expect(clientes.de_baja).toEqual([]);
	});

	it("un cliente dado de baja sale abajo con su motivo", async () => {
		const nuevo = await darDeAltaClienteDePrueba(servidor);
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM clientes WHERE id = $1", [
			nuevo.cliente_id,
		]);
		const baja = await mandarAccion(
			servidor,
			"ventas.dar_baja_cliente",
			{ datos: { cliente_id: nuevo.cliente_id, motivo: "Cerró su tienda" }, version: rows[0]?.v },
			"ventas",
		);
		expect(baja.estado, JSON.stringify(baja.cuerpo)).toBe(200);
		const clientes = (await pedirConsulta(servidor, "ventas.clientes")).cuerpo.resultado as Clientes;
		expect(clientes.de_baja).toEqual([
			expect.objectContaining({ cliente_id: nuevo.cliente_id, motivo: "Cerró su tienda" }),
		]);
		expect(clientes.fichas).toHaveLength(6);
	});

	it("el cajón: los datos de un cliente, o las escuelas que no son cliente para el alta", async () => {
		const morelos = await clienteDeLaMuestra(servidor, "Colegio Morelos");
		const datos = await pedirConsulta(servidor, "ventas.cliente", { cliente_id: morelos });
		expect(datos.estado, JSON.stringify(datos.cuerpo)).toBe(200);
		expect((datos.cuerpo.resultado as { cliente: unknown }).cliente).toMatchObject({
			nombre: "Colegio Morelos",
			tipo: "escuela",
			escuela: "Colegio Morelos",
			credito: { texto: "Crédito al corriente" },
		});
		const alta = (await pedirConsulta(servidor, "ventas.cliente")).cuerpo.resultado as {
			escuelas: { nombre: string }[];
			cliente: null;
		};
		expect(alta.cliente).toBeNull();
		expect(alta.escuelas.map((escuela) => escuela.nombre)).not.toContain("Colegio Morelos");
	});

	it("solo Ventas los pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.clientes", {}, "contaduria")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "ventas.cliente", {}, "bodega")).estado).toBe(403);
	});
});
