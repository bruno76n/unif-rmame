/**
 * Prueba de `mantenimiento.maquina` con los datos de la muestra: la Collareta 3 parada, con sus reparaciones y su paro
 * del año (con las horas de su falla abierta), sus datos, quién la trae, su historial del más reciente al más viejo y su
 * falla abierta; una máquina sin fallas ni servicios, con su historial vacío; y solo la piden las cuentas con
 * Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeLasParadas, idDe } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface Maquina {
	folio: string;
	nombre: string;
	area: string;
	estado: { texto: string; color: string };
	tipo: string;
	marca_modelo: string | null;
	serie: string | null;
	la_trae: { id: string; nombre: string } | null;
	reparaciones_centavos?: number;
	horas_paro: number;
	paro_centavos?: number;
	fallas_en_el_anio: number;
	historial: (
		| { tipo: "falla"; fecha: string; texto: string }
		| {
				tipo: "servicio";
				fecha: string;
				que_se_hizo: string;
				tecnico: string;
				costo_centavos?: number;
				horas_paro: number;
		  }
	)[];
	falla_abierta: string | null;
	dada_de_baja: { desde: string; motivo: string } | null;
	puede: { dar_de_baja: boolean; razon: string | null };
}

describe("El cajón Máquina: su estado, lo que ha costado, sus datos y su historial", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Mantenimiento. */
	const pedir = async (nombre: string) => {
		const id = await idDe(servidor, `SELECT id FROM maquinas WHERE nombre = '${nombre}'`);
		const respuesta = await pedirConsulta(servidor, "mantenimiento.maquina", { maquina_id: id }, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Maquina;
	};

	it("la Collareta 3: parada, con sus reparaciones, su paro con la falla abierta, quién la trae y su historial", async () => {
		const maquina = await pedir("Collareta 3");
		const horasAbiertas = [...(await horasDeLasParadas(servidor)).values()].reduce((suma, horas) => suma + horas, 0);
		expect(maquina).toMatchObject({
			nombre: "Collareta 3",
			area: "Costura",
			estado: { texto: "Parada", color: "rojo" },
			tipo: "Collareta",
			marca_modelo: "Pegasus W664",
			serie: "PW6-77120",
			reparaciones_centavos: 90_000,
			horas_paro: 11 + horasAbiertas,
			paro_centavos: (11 + horasAbiertas) * 45_000,
			fallas_en_el_anio: 1,
			dada_de_baja: null,
		});
		expect(maquina.la_trae).not.toBeNull();
		expect(maquina.falla_abierta).toMatch(/^FM-/);
		// Con falla abierta no se da de baja: la consulta lo dice, con el texto de la acción.
		expect(maquina.puede).toEqual({
			dar_de_baja: false,
			razon: "Collareta 3 tiene una falla abierta: resuélvela antes de darla de baja",
		});
		const [primero, segundo] = maquina.historial;
		expect(primero).toMatchObject({ tipo: "falla", fecha: "2026-10-08" });
		expect(primero?.tipo === "falla" ? primero.texto : "").toMatch(/^Falla: no prende, reportó .+/);
		expect(segundo).toMatchObject({
			tipo: "servicio",
			fecha: "2026-07-22",
			que_se_hizo: "Cambio de looper",
			tecnico: "Servicio Industrial del Bajío",
			costo_centavos: 90_000,
			horas_paro: 11,
		});
	});

	it("una máquina sin fallas ni servicios: trabajando, sin costo y con el historial vacío", async () => {
		const maquina = await pedir("Recta 5");
		expect(maquina).toMatchObject({
			estado: { texto: "Trabajando", color: "verde" },
			reparaciones_centavos: 0,
			horas_paro: 0,
			fallas_en_el_anio: 0,
			historial: [],
			falla_abierta: null,
			puede: { dar_de_baja: true, razon: null },
		});
	});

	it("una máquina que no existe responde 404, y solo la piden las cuentas con Mantenimiento", async () => {
		const noHay = await pedirConsulta(servidor, "mantenimiento.maquina", { maquina_id: uuidv7() }, "mantenimiento");
		expect(noHay.estado).toBe(404);
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			const respuesta = await pedirConsulta(servidor, "mantenimiento.maquina", { maquina_id: uuidv7() }, quien);
			expect(respuesta.estado, quien).toBe(403);
		}
	});
});
