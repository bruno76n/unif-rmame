/**
 * Prueba del trabajo que abre la semana de asistencia y de lo que leen la ficha y la lista de Personal.
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
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { abrirSemanaAsistencia } from "./abrir-semana-asistencia.ts";

describe("el trabajo abre la semana una sola vez; la ficha lee sus días y la lista recorta el pago sin el permiso", () => {
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

	it("la lista de Personal: sin «Ver tarifas» no lleva el pago; con él pide el permiso y queda en la bitácora", async () => {
		const ver = async (quien: string, parametros: string) => {
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/consultas/personal.personas?${parametros}`,
				headers: encabezadosDeLaWeb(quien),
			});
			return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
		};
		const taller = await ver("personal", "area=taller");
		expect(taller.estado).toBe(200);
		expect(taller.cuerpo.resultado.personas.length).toBeGreaterThan(0);
		expect(taller.cuerpo.resultado.personas.every((persona: { area: string }) => persona.area === "taller")).toBe(true);
		expect(JSON.stringify(taller.cuerpo)).not.toContain("pago_dia_centavos");
		expect((await ver("personal", "ver_tarifas=si")).cuerpo).toMatchObject({ codigo: "sin_permiso_fino" });
		const conTarifas = await ver("personal_sueldos", "area=oficina&ver_tarifas=si");
		expect(conTarifas.cuerpo.resultado.personas[0]).toHaveProperty("pago_dia_centavos");
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE descripcion = 'Consultó las tarifas del personal'",
		);
		expect(rows[0]).toEqual({ n: 1 });
	});
});
