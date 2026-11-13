/**
 * Prueba de `mantenimiento.fallas` con los datos de la muestra: las abiertas con su estado («Reportada» o «En
 * reparación») y su paro; las resueltas de la más reciente a la más vieja, por páginas, con las horas de su servicio;
 * los conteos de los dos grupos; y que solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeLasParadas, numeroDe } from "./de-prueba.ts";

/** Una falla de la lista. */
interface FallaDeLaLista {
	falla_id: string;
	folio: string;
	fecha: string;
	maquina: string;
	motivo: string;
	detuvo: boolean;
	reporto: string;
	horas_paro: number | null;
	estado: { texto: string; color: string };
}

/** Lo que regresa la consulta. */
interface Fallas {
	conteos: { abiertas: number; resueltas: number };
	renglones: FallaDeLaLista[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("Fallas: las abiertas y las resueltas, cada una con su estado y su paro", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Mantenimiento. */
	const pedir = async (parametros: Record<string, string>) => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.fallas", parametros, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Fallas;
	};

	it("las abiertas: la parada en reparación con las horas que lleva, la otra reportada y sin paro", async () => {
		const abiertas = await pedir({});
		const resueltas = await numeroDe(servidor, "SELECT count(*) FROM fallas WHERE estado = 'resuelta'");
		expect(abiertas.conteos).toEqual({ abiertas: 2, resueltas });
		expect(abiertas.hay_mas).toBe(false);
		const horas = await horasDeLasParadas(servidor);
		const collareta = abiertas.renglones.find((falla) => falla.maquina === "Collareta 3");
		expect(collareta).toMatchObject({
			motivo: "No prende",
			detuvo: true,
			estado: { texto: "En reparación", color: "rojo" },
		});
		expect(collareta?.horas_paro).toBe(horas.get(collareta?.falla_id ?? ""));
		expect(collareta?.reporto).not.toBe("");
		expect(abiertas.renglones.find((falla) => falla.maquina === "Recta 7")).toMatchObject({
			motivo: "Rompe el hilo",
			detuvo: false,
			horas_paro: null,
			estado: { texto: "Reportada", color: "ambar" },
		});
	});

	it("las resueltas, de la más reciente a la más vieja y por páginas, con las horas de su servicio", async () => {
		const primera = await pedir({ grupo: "resueltas", limite: "2" });
		expect(primera.renglones).toHaveLength(2);
		expect(primera.hay_mas).toBe(true);
		expect(primera.renglones[0]).toMatchObject({
			maquina: "Overlock 1",
			horas_paro: 6,
			estado: { texto: "Resuelta", color: "verde" },
		});
		const todas = [...primera.renglones];
		let cursor = primera.cursor;
		while (cursor !== null) {
			const siguiente = await pedir({ grupo: "resueltas", limite: "2", cursor });
			todas.push(...siguiente.renglones);
			cursor = siguiente.cursor;
		}
		expect(todas).toHaveLength(primera.conteos.resueltas);
		const fechas = todas.map((falla) => falla.fecha);
		expect(fechas).toEqual([...fechas].sort().reverse());
		expect(todas.find((falla) => falla.maquina === "Cortadora")).toMatchObject({ detuvo: false, horas_paro: 3 });
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.fallas", {}, quien)).estado, quien).toBe(403);
		}
	});
});
