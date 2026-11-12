/**
 * Prueba de las horas de paro y de `mantenimiento.fallas_que_detienen`: el paro cuenta desde que se paró, con los días de
 * trabajo hasta ayer y las horas de hoy; solo salen las fallas abiertas que detuvieron su máquina.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { horasDeParo } from "../dominio/paro.ts";

describe("Las horas de paro cuentan desde que se paró, con los días de trabajo y las horas de hoy", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("con fechas fijas: hoy lleva las de hoy; ayer, un día más; el domingo no cuenta", () => {
		// Miércoles 11 de noviembre de 2026, de lunes a sábado, 9 h por día y 4 de hoy.
		const hoy = Temporal.PlainDate.from("2026-11-11");
		const cuenta = { porDia: 9, deHoy: 4, diasDeTrabajo: [1, 2, 3, 4, 5, 6] as const };
		const desde = (dia: string) => horasDeParo(Temporal.PlainDate.from(dia), hoy, cuenta);
		expect(desde("2026-11-11")).toBe(4);
		expect(desde("2026-11-10")).toBe(13);
		expect(desde("2026-11-09")).toBe(22);
		// Del sábado: sábado, lunes y martes.
		expect(desde("2026-11-07")).toBe(31);
	});

	it("salen las fallas abiertas que detuvieron su máquina, con quién la traía y sus horas; las que no la detienen, no", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "taller");
		const [parada, conFalla] = [await maquinaDePrueba(servidor, persona), await maquinaDePrueba(servidor, persona)];
		/** Mantenimiento reporta una falla. */
		const reportar = async (maquinaId: string, motivo: string) =>
			mandarAccion(
				servidor,
				"mantenimiento.reportar_falla",
				{ datos: { maquina_id: maquinaId, motivo_falla_id: await motivoDePrueba(servidor, motivo) } },
				"mantenimiento",
			);
		await reportar(parada.id, "No prende");
		await reportar(conFalla.id, "Hace ruido");
		const leidas = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("mantenimiento.fallas_que_detienen", {}),
		);
		expect(leidas).toEqual({
			fallas: [
				expect.objectContaining({ maquina_id: parada.id, persona_id: persona, motivo: "No prende", horas_paro: 4 }),
			],
		});
	});
});
