/**
 * `personal.abrir_semana_asistencia`: abre la semana de asistencia el primer día de trabajo de cada semana.
 * Fase 7 · docs/modulos/personal/asistencia.md («Trabajos · Abrir la semana»)
 *
 * Corre a las 00:10, hora de México, el primer día de `general.dias_de_trabajo`. Si la semana ya existe (la
 * abrió una captura, o el trabajo ya corrió), no hace nada.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import type { Horario, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { abrirSemana, diasDeTrabajo, leerDiasDeTrabajo, semanaDe } from "../dominio/asistencia.ts";

export const abrirSemanaAsistencia: Trabajo = {
	nombre: "personal.abrir_semana_asistencia",
	horario: async (contexto): Promise<Horario> => {
		const [primero] = leerDiasDeTrabajo(await leerParametro(contexto.base, { clave: "general.dias_de_trabajo" }));
		return { cada: "semana", dia: primero ?? 1, hora: "00:10" };
	},
	correr: async (contexto) => {
		await contexto.enTransaccion(async (accion) => {
			const semana = semanaDe(diaDeNegocio(accion.ahora), await diasDeTrabajo(accion));
			await abrirSemana(accion.transaccion, semana, null);
		});
	},
};
