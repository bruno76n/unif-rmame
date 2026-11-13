/**
 * Prueba de `ventas.pendientes` y de la pastilla de Ventas a externos con la muestra: los cinco indicadores, los
 * renglones por grupo (los borradores, el cliente detenido), la pastilla que cuenta los mismos renglones y se pone
 * roja con uno rojo, y que solo Ventas la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver» y «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Pendientes {
	cifras: { clave: string; nombre: string; numero: number; contexto: { texto: string; tono: string }[] }[];
	conteos: Record<string, number>;
	renglones: {
		grupo: string;
		tipo: string;
		titulo: string;
		estado: { texto: string; color: string };
		accion: { tipo: string; texto: string };
	}[];
	rojo: boolean;
}

describe("Pendientes de Ventas a externos: indicadores, renglones por grupo y la pastilla", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los cinco indicadores y los renglones de la muestra: los borradores y el cliente detenido", async () => {
		const respuesta = await pedirConsulta(servidor, "ventas.pendientes");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const pendientes = respuesta.cuerpo.resultado as Pendientes;
		expect(pendientes.cifras.map((cifra) => cifra.clave)).toEqual([
			"pedidos_abiertos",
			"piezas_por_entregar",
			"entregas_proximas",
			"notas_entrega",
			"clientes",
		]);
		expect(pendientes.cifras[2]?.nombre).toBe("Entregas en 7 días");
		expect(pendientes.cifras[4]?.contexto[0]).toEqual({ texto: "1 detenido por crédito", tono: "rojo" });
		const borradores = pendientes.renglones.filter((renglon) => renglon.tipo === "borrador");
		// Los folios de la muestra siguen al contador: los borradores son los dos que la muestra no confirmó.
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio FROM pedidos WHERE estado = 'borrador' ORDER BY folio",
		);
		expect(rows).toHaveLength(2);
		expect(borradores.map((renglon) => renglon.titulo.split(" · ")[0]).sort()).toEqual(
			rows.map((fila: { folio: string }) => fila.folio),
		);
		expect(
			borradores.every((renglon) => renglon.estado.texto === "Borrador" && renglon.accion.tipo === "revisar"),
		).toBe(true);
		const credito = pendientes.renglones.filter((renglon) => renglon.tipo === "credito");
		expect(credito.map((renglon) => renglon.titulo)).toEqual(["Uniformes El Bajío"]);
		expect(credito[0]).toMatchObject({
			grupo: "clientes",
			estado: { texto: "Detenido por crédito", color: "rojo" },
			accion: { tipo: "ver_cliente", texto: "Ver cliente" },
		});
		expect(pendientes.conteos.todos).toBe(pendientes.renglones.length);
		expect(pendientes.conteos.clientes).toBe(1);
		expect(pendientes.rojo).toBe(true);
	});

	it("un grupo solo trae sus renglones, con los mismos conteos", async () => {
		const todos = (await pedirConsulta(servidor, "ventas.pendientes")).cuerpo.resultado as Pendientes;
		const clientes = (await pedirConsulta(servidor, "ventas.pendientes", { grupo: "clientes" })).cuerpo
			.resultado as Pendientes;
		expect(clientes.renglones.every((renglon) => renglon.grupo === "clientes")).toBe(true);
		expect(clientes.renglones).toHaveLength(1);
		expect(clientes.conteos).toEqual(todos.conteos);
	});

	it("la pastilla de Ventas cuenta los renglones de Pendientes y va roja si alguno es rojo", async () => {
		const pendientes = (await pedirConsulta(servidor, "ventas.pendientes")).cuerpo.resultado as Pendientes;
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "ventas");
		const ventas = (armazon.cuerpo.resultado as { departamentos: { clave: string; conteo: number; rojo: boolean }[] })
			.departamentos;
		expect(ventas).toEqual([
			expect.objectContaining({ clave: "ventas", conteo: pendientes.conteos.todos, rojo: true }),
		]);
	});

	it("solo Ventas la pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.pendientes", {}, "bodega")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "ventas.pendientes", {}, "aduana")).estado).toBe(403);
	});
});
