/**
 * Prueba de `mantenimiento.maquinas` con los datos de la muestra: las activas por área con su estado (que sale de sus
 * fallas abiertas), su tipo, su marca, quién la trae y su último servicio; las dadas de baja aparte, sin contar; y que
 * solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { numeroDe } from "./de-prueba.ts";

/** Una máquina de la lista. */
interface MaquinaDeLaLista {
	maquina_id: string;
	nombre: string;
	tipo: string;
	marca_modelo: string | null;
	serie: string | null;
	la_trae: string | null;
	ultimo_servicio: { fecha: string; que_se_hizo: string } | null;
	estado: { texto: string; color: string };
}

/** Lo que regresa la consulta. */
interface Maquinas {
	activas: number;
	areas: { nombre: string; maquinas: MaquinaDeLaLista[] }[];
	bajas: { maquina_id: string; nombre: string; motivo: string }[];
}

describe("Máquinas: las activas por área con su estado, y las dadas de baja aparte", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Mantenimiento. */
	const pedir = async () => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.maquinas", {}, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Maquinas;
	};

	it("cada área con sus máquinas; el estado sale de la falla abierta y el último servicio, del más reciente", async () => {
		const { activas, areas } = await pedir();
		expect(activas).toBe(await numeroDe(servidor, "SELECT count(*) FROM maquinas WHERE baja_en IS NULL"));
		expect(areas.map((area) => area.nombre)).toEqual(
			expect.arrayContaining(["Costura", "Ojal y botón", "Planchado", "Corte"]),
		);
		const todas = areas.flatMap((area) => area.maquinas);
		const por = (nombre: string) => todas.find((maquina) => maquina.nombre === nombre);
		expect(por("Collareta 3")?.estado).toEqual({ texto: "Parada", color: "rojo" });
		expect(por("Recta 7")?.estado).toEqual({ texto: "Trabaja con falla", color: "ambar" });
		expect(por("Overlock 1")).toMatchObject({
			tipo: "Overlock",
			marca_modelo: "Siruba 757K",
			serie: "S757-10294",
			estado: { texto: "Trabajando", color: "verde" },
			ultimo_servicio: { fecha: "2026-10-03", que_se_hizo: "Ajuste de tiempo y cambio de garfio" },
		});
		expect(por("Recta 5")?.ultimo_servicio).toBeNull();
		expect(por("Recta 5")?.la_trae).not.toBeNull();
	});

	it("una máquina dada de baja sale en «Dadas de baja» con su motivo y no cuenta en las activas", async () => {
		const antes = (await pedir()).activas;
		const persona = await nuevaPersona(servidor.base.dueno, "taller");
		const maquina = await maquinaDePrueba(servidor, persona);
		expect((await pedir()).activas).toBe(antes + 1);
		const { rows } = await servidor.base.dueno.query("SELECT version FROM maquinas WHERE id = $1", [maquina.id]);
		const baja = await mandarAccion(
			servidor,
			"mantenimiento.baja_maquina",
			{ datos: { maquina_id: maquina.id, motivo: "Se vendió a otro taller" }, version: Number(rows[0]?.version) },
			"mantenimiento",
		);
		expect(baja.estado, JSON.stringify(baja.cuerpo)).toBe(200);
		const despues = await pedir();
		expect(despues.activas).toBe(antes);
		expect(despues.areas.flatMap((area) => area.maquinas).some((uno) => uno.maquina_id === maquina.id)).toBe(false);
		expect(despues.bajas).toContainEqual(
			expect.objectContaining({ maquina_id: maquina.id, nombre: maquina.nombre, motivo: "Se vendió a otro taller" }),
		);
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.maquinas", {}, quien)).estado, quien).toBe(403);
		}
	});
});
