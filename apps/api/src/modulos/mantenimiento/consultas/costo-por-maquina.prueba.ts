/**
 * Prueba de `mantenimiento.costo_por_maquina` con los datos de la muestra: cada máquina con gasto o paro en el año, de
 * la que más cuesta a la que menos; el paro suma las horas de sus servicios y las de su falla abierta si la detuvo; el
 * costo de la hora sale de Configuración o del que se escriba en la pantalla (sin guardarse), y 0 regresa al de
 * Configuración; y solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeLasParadas, numeroDe } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface CostoPorMaquina {
	costo_hora_centavos?: number;
	costo_hora_configuracion_centavos?: number;
	reparaciones_centavos?: number;
	horas_paro: number;
	paro_centavos?: number;
	maquinas: {
		nombre: string;
		servicios: number;
		la_trae: string | null;
		reparaciones_centavos?: number;
		horas_paro: number;
		paro_centavos?: number;
	}[];
}

describe("Costo por máquina: lo gastado contra lo parado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Mantenimiento. */
	const pedir = async (parametros: Record<string, string> = {}) => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.costo_por_maquina", parametros, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as CostoPorMaquina;
	};

	it("con el costo de Configuración: cada máquina con sus reparaciones y su paro, de la que más cuesta a la que menos", async () => {
		const costo = await pedir();
		expect(costo.costo_hora_centavos).toBe(45_000);
		expect(costo.costo_hora_configuracion_centavos).toBe(45_000);
		const total = (maquina: CostoPorMaquina["maquinas"][number]) =>
			(maquina.reparaciones_centavos ?? 0) + (maquina.paro_centavos ?? 0);
		const totales = costo.maquinas.map(total);
		expect(totales).toEqual([...totales].sort((uno, otro) => otro - uno));
		for (const maquina of costo.maquinas) {
			expect(maquina.paro_centavos).toBe(maquina.horas_paro * 45_000);
			expect((maquina.reparaciones_centavos ?? 0) + maquina.horas_paro).toBeGreaterThan(0);
		}
		// La Collareta 3 suma su servicio del año y las horas de su falla abierta, que la detuvo.
		const horasAbiertas = [...(await horasDeLasParadas(servidor)).values()].reduce((suma, horas) => suma + horas, 0);
		const collareta = costo.maquinas.find((maquina) => maquina.nombre === "Collareta 3");
		expect(collareta).toMatchObject({ servicios: 1, reparaciones_centavos: 90_000, horas_paro: 11 + horasAbiertas });
		const anio = "extract(year from (now() AT TIME ZONE 'America/Mexico_City'))";
		expect(costo.reparaciones_centavos).toBe(
			await numeroDe(
				servidor,
				`SELECT coalesce(sum(costo_centavos), 0) FROM servicios WHERE extract(year from fecha) = ${anio}`,
			),
		);
		expect(costo.horas_paro).toBe(costo.maquinas.reduce((suma, maquina) => suma + maquina.horas_paro, 0));
		expect(costo.paro_centavos).toBe(costo.horas_paro * 45_000);
	});

	it("el costo de la hora escrito en la pantalla recalcula los pesos del paro; en 0 regresa al de Configuración", async () => {
		const conOtro = await pedir({ costo_hora_centavos: "60000" });
		expect(conOtro.costo_hora_centavos).toBe(60_000);
		expect(conOtro.costo_hora_configuracion_centavos).toBe(45_000);
		expect(conOtro.paro_centavos).toBe(conOtro.horas_paro * 60_000);
		const enCero = await pedir({ costo_hora_centavos: "0" });
		expect(enCero.costo_hora_centavos).toBe(45_000);
		// No se guarda: Configuración sigue igual.
		expect(
			await numeroDe(servidor, "SELECT valor_entero FROM parametros WHERE clave = 'mantenimiento.costo_hora_paro'"),
		).toBe(45_000);
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.costo_por_maquina", {}, quien)).estado, quien).toBe(403);
		}
	});
});
