/**
 * Prueba del trabajo que abre la semana de asistencia y de los días que lee la ficha de la persona.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 */

import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { abrirSemanaAsistencia } from "./abrir-semana-asistencia.ts";

describe("el trabajo abre la semana una sola vez; la ficha lee sus días", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el lunes 9 de noviembre abre la semana del 9 al 14; correrlo otra vez no abre otra; su horario es el primer día a las 00:10", async () => {
		const dependencias = {
			base: crearBase(servidor.base.app),
			registro: await cargarModulos(join(import.meta.dirname, "../..")),
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
			avisarFalla: async () => undefined,
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Instant.from("2026-11-09T06:10:00Z"),
		};
		await correrTrabajo(dependencias, abrirSemanaAsistencia, { periodo: "2026-11-09" });
		await correrTrabajo(dependencias, abrirSemanaAsistencia, { periodo: "2026-11-09" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT fecha_inicio::text AS inicio, fecha_fin::text AS fin, estado FROM asistencia_semanas WHERE fecha_inicio = '2026-11-09'",
		);
		expect(rows).toEqual([{ inicio: "2026-11-09", fin: "2026-11-14", estado: "abierta" }]);
		const horario = await abrirSemanaAsistencia.horario?.({
			...dependencias,
			ahora: Temporal.Now.instant(),
			periodo: undefined,
			eventoId: undefined,
			respaldo: undefined,
			enTransaccion: async () => {
				throw new Error("el horario no escribe");
			},
		});
		expect(horario).toEqual({ cada: "semana", dia: 1, hora: "00:10" });
	});

	it("los días de la semana que corre de una persona, capturados o vacíos", async () => {
		const persona = await nuevaPersona(servidor.base.dueno);
		const dias = await enAccionDePrueba(
			crearBase(servidor.base.app),
			servidor.modulos,
			(contexto) => contexto.lectura("personal.dias_de_semana", { persona_id: persona }),
			{ ahora: Temporal.Instant.from("2026-11-11T18:00:00Z") },
		);
		expect(dias).toMatchObject({ inicio: "2026-11-09", fin: "2026-11-14" });
		expect((dias as { dias: unknown[] }).dias).toHaveLength(6);
	});
});
