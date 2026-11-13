/**
 * Prueba de `mantenimiento.pendientes` y de la pastilla de Mantenimiento con los datos de la muestra: una falla abierta
 * por renglón (la parada en rojo con las horas que lleva, la que trabaja con falla en ámbar sin paro), las cifras de
 * máquinas, fallas, servicios y costo, la pastilla roja porque una falla detuvo su máquina, y que solo la piden las
 * cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeLasParadas, numeroDe } from "./de-prueba.ts";

/** Lo que se revisa de la respuesta. */
interface Pendientes {
	indicadores: {
		maquinas: { activas: number; trabajando: number; con_falla: number; paradas: number };
		fallas: { abiertas: number; resueltas_en_el_anio: number };
		servicios: { en_el_anio: number; este_mes_centavos?: number };
		costo: {
			horas_paro: number;
			por_paro_centavos?: number;
			reparaciones_centavos?: number;
			horas_por_mes: number[];
		};
	};
	renglones: {
		falla_id: string;
		referencia: string;
		detalle: string;
		horas_paro: number | null;
		parada: boolean;
		estado: { texto: string; color: string };
	}[];
	pastilla: { conteo: number; rojo: boolean };
}

describe("Pendientes de Mantenimiento: las fallas abiertas y las cifras del año", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un renglón por falla abierta: la parada en rojo con sus horas, la que trabaja con falla en ámbar y sin paro", async () => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.pendientes", {}, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { renglones } = respuesta.cuerpo.resultado as Pendientes;
		const horas = await horasDeLasParadas(servidor);
		expect(renglones).toHaveLength(2);
		const collareta = renglones.find((renglon) => renglon.referencia.startsWith("Collareta 3 · "));
		const recta = renglones.find((renglon) => renglon.referencia.startsWith("Recta 7 · "));
		expect(collareta).toMatchObject({ parada: true, estado: { texto: "Parada", color: "rojo" } });
		expect(collareta?.detalle).toMatch(/^No prende/);
		expect(collareta?.horas_paro).toBe(horas.get(collareta?.falla_id ?? ""));
		expect(recta).toMatchObject({
			parada: false,
			horas_paro: null,
			detalle: "Rompe el hilo",
			estado: { texto: "Trabaja con falla", color: "ambar" },
		});
	});

	it("las cifras salen de lo que hay en la base: máquinas, fallas, servicios del año y horas de paro", async () => {
		const { indicadores } = (await pedirConsulta(servidor, "mantenimiento.pendientes", {}, "mantenimiento")).cuerpo
			.resultado as Pendientes;
		const anio = "extract(year from (now() AT TIME ZONE 'America/Mexico_City'))";
		const activas = await numeroDe(servidor, "SELECT count(*) FROM maquinas WHERE baja_en IS NULL");
		expect(indicadores.maquinas).toEqual({ activas, trabajando: activas - 2, con_falla: 1, paradas: 1 });
		const resueltas = await numeroDe(
			servidor,
			`SELECT count(*) FROM fallas WHERE estado = 'resuelta'
				AND extract(year from (resuelta_en AT TIME ZONE 'America/Mexico_City')) = ${anio}`,
		);
		expect(indicadores.fallas).toEqual({ abiertas: 2, resueltas_en_el_anio: resueltas });
		const servicios = await numeroDe(
			servidor,
			`SELECT count(*) FROM servicios WHERE extract(year from fecha) = ${anio}`,
		);
		expect(indicadores.servicios.en_el_anio).toBe(servicios);
		const horasDeServicios = await numeroDe(
			servidor,
			`SELECT coalesce(sum(horas_paro), 0) FROM servicios WHERE extract(year from fecha) = ${anio}`,
		);
		const horasAbiertas = [...(await horasDeLasParadas(servidor)).values()].reduce((suma, horas) => suma + horas, 0);
		expect(indicadores.costo.horas_paro).toBe(horasDeServicios + horasAbiertas);
		// El paro en pesos va por `mantenimiento.costo_hora_paro`: $450 la hora.
		expect(indicadores.costo.por_paro_centavos).toBe(indicadores.costo.horas_paro * 45_000);
		const reparaciones = await numeroDe(
			servidor,
			`SELECT coalesce(sum(costo_centavos), 0) FROM servicios WHERE extract(year from fecha) = ${anio}`,
		);
		expect(indicadores.costo.reparaciones_centavos).toBe(reparaciones);
		expect(indicadores.costo.horas_por_mes).toHaveLength(6);
	});

	it("la pastilla del menú cuenta las fallas abiertas y va en rojo porque una detuvo su máquina", async () => {
		const { pastilla } = (await pedirConsulta(servidor, "mantenimiento.pendientes", {}, "mantenimiento")).cuerpo
			.resultado as Pendientes;
		expect(pastilla).toEqual({ conteo: 2, rojo: true });
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "mantenimiento");
		const { departamentos } = armazon.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		expect(departamentos.find((uno) => uno.clave === "mantenimiento")).toMatchObject({ conteo: 2, rojo: true });
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "ventas", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.pendientes", {}, quien)).estado, quien).toBe(403);
		}
	});
});
