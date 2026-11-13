/**
 * Prueba de `mantenimiento.falla` con los datos de la muestra: la abierta en reparación con su paro, su técnico, su nota
 * de seguimiento y las horas que propone la reparación; la reportada que no detuvo, sin técnico y sin paro; la resuelta
 * con su servicio y su paro en pesos; una que no existe responde 404; y solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeLasParadas, idDe } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface Falla {
	falla_id: string;
	version: number;
	estado_clave: string;
	estado: { texto: string; color: string };
	titulo: string;
	detuvo: boolean;
	horas_paro: number;
	horas_propuestas: number;
	reparacion_centavos?: number;
	reporto: string;
	la_trae: string | null;
	maquina_detalle: string;
	tecnico: string | null;
	nota_seguimiento: string | null;
	deteniendo: { folio: string; texto: string; entrega: string }[];
	servicio: {
		folio: string;
		que_se_hizo: string;
		costo_centavos?: number;
		horas_paro: number;
		paro_centavos?: number;
	} | null;
}

describe("El cajón Falla: su estado, su paro, quién la reportó, su técnico, lo que detiene y su servicio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La falla de una máquina de la muestra, por su nombre. */
	const fallaDe = (maquina: string) =>
		idDe(
			servidor,
			`SELECT f.id FROM fallas f JOIN maquinas m ON m.id = f.maquina_id WHERE m.nombre = '${maquina}'
				ORDER BY f.fecha DESC LIMIT 1`,
		);

	/** Pide la consulta como Mantenimiento. */
	const pedir = async (fallaId: string) => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.falla", { falla_id: fallaId }, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Falla;
	};

	it("la Collareta 3, en reparación: su paro, que la detuvo, su técnico, su nota y las horas que propone la reparación", async () => {
		const id = await fallaDe("Collareta 3");
		const falla = await pedir(id);
		const horas = (await horasDeLasParadas(servidor)).get(id);
		expect(falla).toMatchObject({
			estado_clave: "en_reparacion",
			estado: { texto: "En reparación", color: "rojo" },
			titulo: "Collareta 3: no prende",
			detuvo: true,
			horas_paro: horas,
			horas_propuestas: horas,
			maquina_detalle: "Collareta Pegasus W664 · PW6-77120",
			tecnico: "Servicio Industrial del Bajío",
			nota_seguimiento: "Revisaron el motor el 9 oct; esperan la refacción para el 13 oct",
			servicio: null,
		});
		expect(falla.reporto).toMatch(/, desde la tablet$/);
		expect(falla.la_trae).not.toBeNull();
		expect(falla.reparacion_centavos).toBeUndefined();
		for (const lote of falla.deteniendo) expect(lote.texto).toMatch(/ para /);
	});

	it("la Recta 7, reportada y sin detenerla: sin paro, sin técnico y la reparación propone 0 horas", async () => {
		const falla = await pedir(await fallaDe("Recta 7"));
		expect(falla).toMatchObject({
			estado_clave: "reportada",
			estado: { texto: "Reportada", color: "ambar" },
			titulo: "Recta 7: rompe el hilo",
			detuvo: false,
			horas_paro: 0,
			horas_propuestas: 0,
			tecnico: null,
			deteniendo: [],
		});
	});

	it("la Overlock 1, resuelta: su servicio con lo que se hizo, su costo y su paro en pesos", async () => {
		const falla = await pedir(await fallaDe("Overlock 1"));
		expect(falla).toMatchObject({
			estado_clave: "resuelta",
			estado: { texto: "Resuelta", color: "verde" },
			horas_paro: 6,
			reparacion_centavos: 85_000,
			tecnico: "Técnica de Costura Juárez",
			deteniendo: [],
			servicio: {
				que_se_hizo: "Ajuste de tiempo y cambio de garfio",
				costo_centavos: 85_000,
				horas_paro: 6,
				paro_centavos: 6 * 45_000,
			},
		});
	});

	it("una falla que no existe responde 404, y solo la piden las cuentas con Mantenimiento", async () => {
		const noHay = await pedirConsulta(servidor, "mantenimiento.falla", { falla_id: uuidv7() }, "mantenimiento");
		expect(noHay.estado).toBe(404);
		const id = await fallaDe("Recta 7");
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.falla", { falla_id: id }, quien)).estado, quien).toBe(403);
		}
	});
});
