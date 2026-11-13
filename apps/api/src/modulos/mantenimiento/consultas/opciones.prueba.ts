/**
 * Prueba de `mantenimiento.opciones` con los datos de la muestra: las listas de las ventanas (los tipos, las áreas del
 * taller, la gente activa del Taller, los técnicos, los motivos de falla en su orden con si detienen la máquina y las
 * máquinas activas con su versión y si tienen falla abierta); y solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { numeroDe } from "./de-prueba.ts";

/** Algo de una lista. */
interface DeLaLista {
	id: string;
	nombre: string;
}

/** Lo que regresa la consulta. */
interface Opciones {
	tipos: DeLaLista[];
	areas: DeLaLista[];
	personas: DeLaLista[];
	tecnicos: DeLaLista[];
	motivos: (DeLaLista & { detiene: boolean })[];
	maquinas: (DeLaLista & { folio: string; version: number; con_falla_abierta: boolean })[];
}

describe("Las listas de las ventanas de Mantenimiento", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los tipos, las áreas, la gente del Taller, los técnicos, los motivos en su orden y las máquinas activas", async () => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.opciones", {}, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const opciones = respuesta.cuerpo.resultado as Opciones;
		expect(opciones.tipos.map((tipo) => tipo.nombre)).toEqual(expect.arrayContaining(["Recta", "Overlock"]));
		expect(opciones.areas.map((area) => area.nombre)).toEqual(
			expect.arrayContaining(["Costura", "Ojal y botón", "Planchado", "Corte"]),
		);
		expect(opciones.personas).toHaveLength(
			await numeroDe(servidor, "SELECT count(*) FROM personas WHERE area = 'taller' AND baja_en IS NULL"),
		);
		expect(opciones.tecnicos.map((tecnico) => tecnico.nombre)).toEqual(
			expect.arrayContaining(["Servicio Industrial del Bajío", "Técnica de Costura Juárez"]),
		);
		expect(opciones.motivos.slice(0, 2)).toEqual([
			expect.objectContaining({ nombre: "No prende", detiene: true }),
			expect.objectContaining({ nombre: "Rompe el hilo", detiene: false }),
		]);
		expect(opciones.maquinas).toHaveLength(
			await numeroDe(servidor, "SELECT count(*) FROM maquinas WHERE baja_en IS NULL"),
		);
		expect(
			opciones.maquinas
				.filter((maquina) => maquina.con_falla_abierta)
				.map((maquina) => maquina.nombre)
				.sort(),
		).toEqual(["Collareta 3", "Recta 7"]);
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.opciones", {}, quien)).estado, quien).toBe(403);
		}
	});
});
