/**
 * `personal.cambiar_dia_asistencia`, `personal.cerrar_semana_asistencia` y
 * `personal.reabrir_semana_asistencia`: Personal captura la asistencia y cierra la semana; la dueña la reabre.
 * Fase 7 · docs/modulos/personal/asistencia.md (reglas y «Acciones»)
 *
 * Capturar un día bloquea a la persona y comparte la semana: nadie la cierra a la vez, y dos capturas de la
 * misma persona esperan una a la otra. La primera captura no deja bitácora; cambiar un día capturado, sí.
 * Cerrar revisa que no falte ningún día exigido. Reabrir pregunta a Contaduría si su nómina ya se pagó
 * (cuando Contaduría lo ofrece: fase 17).
 */

import {
	cambiarDiaAsistencia,
	cerrarSemanaAsistencia,
	reabrirSemanaAsistencia,
} from "@uniformame/compartido/contratos/personal/asistencia";
import { and, eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	abrirSemana,
	diaDeBaja,
	diasDeTrabajo,
	diasSinCapturar,
	formasConAsistencia,
	semanaDe,
	textoDeDia,
	textoDeSemana,
} from "../dominio/asistencia.ts";
import { leerPersona } from "../dominio/personas.ts";
import { asistenciaDias, asistenciaSemanas } from "../tablas.ts";

/** Cómo se escribe cada valor en la bitácora. */
const textoDeValor: Readonly<Record<string, string>> = { completo: "completo", medio: "medio día", falta: "falta" };

/** La cuenta que hace el cambio, o nada si es el sistema. */
function quienCambia(contexto: ContextoDeAccion): string | null {
	return contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
}

/**
 * Revisa que el día se pueda capturar para esa persona: que lleve asistencia, que sea de trabajo y que caiga
 * entre su ingreso y su baja.
 * @throws `422 persona_sin_asistencia`, `dia_no_laboral`, `antes_de_ingreso` o `despues_de_baja`.
 */
function revisarDia(
	persona: { nombre: string; formaPago: string; fechaIngreso: string; bajaEn: string | null },
	fecha: Temporal.PlainDate,
	dias: readonly number[],
): void {
	if (!formasConAsistencia.includes(persona.formaPago)) {
		throw errorDeRegla("persona_sin_asistencia", `${persona.nombre} cobra por pieza: no lleva asistencia`);
	}
	if (!dias.includes(fecha.dayOfWeek)) {
		const dia = fecha.toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long" });
		throw errorDeRegla("dia_no_laboral", `${dia} no es día laboral`);
	}
	if (Temporal.PlainDate.compare(fecha, persona.fechaIngreso) < 0) {
		throw errorDeRegla("antes_de_ingreso", `${persona.nombre} entró el ${textoDeDia(persona.fechaIngreso)}`);
	}
	const baja = diaDeBaja(persona.bajaEn);
	if (baja !== undefined && Temporal.PlainDate.compare(fecha, baja) > 0) {
		throw errorDeRegla("despues_de_baja", `${persona.nombre} se dio de baja el ${textoDeDia(baja)}`);
	}
}

export const accionCambiarDiaAsistencia = implementarAccion(cambiarDiaAsistencia, async (contexto, datos) => {
	const { transaccion } = contexto;
	// Bloquear a la persona hace que dos capturas suyas esperen una a la otra.
	const persona = await leerPersona(transaccion, datos.persona_id);
	const fecha = Temporal.PlainDate.from(datos.fecha);
	const dias = await diasDeTrabajo(contexto);
	revisarDia(persona, fecha, dias);
	const semana = await abrirSemana(transaccion, semanaDe(fecha, dias), quienCambia(contexto));
	if (semana.estado === "cerrada") {
		throw errorDeRegla(
			"semana_cerrada",
			`La semana del ${textoDeSemana(semana.fechaInicio, semana.fechaFin)} ya está cerrada: la tiene contaduría`,
		);
	}
	const [antes] = await transaccion
		.select()
		.from(asistenciaDias)
		.where(and(eq(asistenciaDias.personaId, persona.id), eq(asistenciaDias.fecha, datos.fecha)));
	let id: string;
	let cambio = false;
	if (antes === undefined) {
		id = uuidv7();
		await transaccion.insert(asistenciaDias).values({
			id,
			asistenciaSemanaId: semana.id,
			personaId: persona.id,
			fecha: datos.fecha,
			valor: datos.valor,
			origen: "personal",
			capturadoPor: quienCambia(contexto),
			creadoPor: quienCambia(contexto),
		});
	} else {
		id = antes.id;
		await tomarVersion(contexto, asistenciaDias, id, datos.version, async () => ({
			persona_id: persona.id,
			fecha: datos.fecha,
			valor: antes.valor,
		}));
		if (antes.valor !== datos.valor) {
			cambio = true;
			await transaccion
				.update(asistenciaDias)
				.set({
					valor: datos.valor,
					capturadoPor: quienCambia(contexto),
					cambiadoEnPersonal: antes.origen === "tienda" ? true : antes.cambiadoEnPersonal,
				})
				.where(eq(asistenciaDias.id, id));
			contexto.bitacora({
				descripcion: `Cambió la asistencia de ${persona.nombre} del ${textoDeDia(fecha)}: ${textoDeValor[antes.valor]} → ${textoDeValor[datos.valor]}${antes.origen === "tienda" ? " (venía del turno del POS)" : ""}`,
				entidad: "personas",
				entidadId: persona.id,
				entidadFolio: persona.folio,
				antes: { fecha: datos.fecha, valor: antes.valor },
				despues: { fecha: datos.fecha, valor: datos.valor },
			});
		}
	}
	contexto.guardarEvento({
		tipo: "asistencia.cambiada",
		datos: { persona_id: persona.id, asistencia_semana_id: semana.id },
		tablas: ["asistencia_dias"],
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
	});
	return {
		resultado: {
			asistencia_dia_id: id,
			version: await versionActual(transaccion, asistenciaDias, id),
			mensaje: `Asistencia de ${persona.nombre} guardada`,
		},
		entidad: { nombre: "asistencia_dias", id },
		// La primera captura (y marcar lo mismo que ya tenía) no deja bitácora: regla 7.
		...(cambio ? {} : { sinBitacora: true as const }),
	};
});

/**
 * Lee una semana de asistencia.
 * @throws `404` si no existe.
 */
async function leerSemana(contexto: ContextoDeAccion, id: string) {
	const [semana] = await contexto.transaccion.select().from(asistenciaSemanas).where(eq(asistenciaSemanas.id, id));
	if (semana === undefined) throw noExiste();
	return semana;
}

export const accionCerrarSemanaAsistencia = implementarAccion(
	cerrarSemanaAsistencia,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		await tomarVersion(contexto, asistenciaSemanas, datos.asistencia_semana_id, version, async () => {
			const leida = await leerSemana(contexto, datos.asistencia_semana_id);
			return { asistencia_semana_id: leida.id, estado: leida.estado };
		});
		const semana = await leerSemana(contexto, datos.asistencia_semana_id);
		// Sus días son los de trabajo de hoy dentro de su semana de lunes a domingo (decisión 435).
		const dias = semanaDe(Temporal.PlainDate.from(semana.fechaInicio), await diasDeTrabajo(contexto));
		const nombre = textoDeSemana(semana.fechaInicio, semana.fechaFin);
		if (semana.estado === "cerrada") throw errorDeRegla("semana_ya_cerrada", `La semana del ${nombre} ya está cerrada`);
		if (Temporal.PlainDate.compare(contexto.diaDeNegocio, dias.fin) < 0) {
			throw errorDeRegla(
				"semana_sin_terminar",
				`La semana del ${nombre} termina el ${textoDeDia(dias.fin)}: ciérrala desde ese día`,
			);
		}
		const faltan = await diasSinCapturar(transaccion, dias);
		const [primero] = faltan;
		if (primero !== undefined) {
			throw new ErrorDeApi(
				"regla",
				"dias_sin_capturar",
				faltan.length === 1 ? "Falta 1 día por capturar" : `Faltan ${faltan.length} días por capturar`,
				{ datos: { persona_id: primero.personaId, nombre: primero.nombre, fecha: primero.fecha.toString() } },
			);
		}
		await transaccion
			.update(asistenciaSemanas)
			.set({ estado: "cerrada", cerradaEn: contexto.ahora.toString(), cerradaPor: quienCambia(contexto) })
			.where(eq(asistenciaSemanas.id, semana.id));
		contexto.bitacora({
			descripcion: `Cerró la asistencia del ${nombre}`,
			entidad: "asistencia_semanas",
			entidadId: semana.id,
			antes: { estado: "abierta" },
			despues: { estado: "cerrada" },
		});
		contexto.guardarEvento({
			tipo: "asistencia_semana.cerrada",
			datos: { asistencia_semana_id: semana.id },
			tablas: ["asistencia_semanas"],
			entidad: "asistencia_semanas",
			entidadId: semana.id,
		});
		return {
			resultado: {
				mensaje: "Semana cerrada: contaduría ya puede pagar la nómina",
				version: await versionActual(transaccion, asistenciaSemanas, semana.id),
			},
			entidad: { nombre: "asistencia_semanas", id: semana.id },
		};
	},
);

/** Lo que regresa `contaduria.estado_nomina_semana`. */
const estadoDeNomina = z.object({ pagada: z.boolean() });

export const accionReabrirSemanaAsistencia = implementarAccion(
	reabrirSemanaAsistencia,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		await tomarVersion(contexto, asistenciaSemanas, datos.asistencia_semana_id, version, async () => {
			const leida = await leerSemana(contexto, datos.asistencia_semana_id);
			return { asistencia_semana_id: leida.id, estado: leida.estado };
		});
		const semana = await leerSemana(contexto, datos.asistencia_semana_id);
		const nombre = textoDeSemana(semana.fechaInicio, semana.fechaFin);
		if (semana.estado === "abierta") throw errorDeRegla("semana_abierta", `La semana del ${nombre} está abierta`);
		// La nómina es de Contaduría (fase 17): mientras no lo ofrezca, ninguna está pagada.
		const lectura = "contaduria.estado_nomina_semana";
		if (contexto.hayLectura(lectura)) {
			const nomina = estadoDeNomina.parse(await contexto.lectura(lectura, { asistencia_semana_id: semana.id }));
			if (nomina.pagada) {
				throw errorDeRegla(
					"nomina_pagada",
					`La nómina del ${nombre} ya se pagó: la semana ya no se reabre. Corrige en la siguiente`,
				);
			}
		}
		await transaccion
			.update(asistenciaSemanas)
			.set({
				estado: "abierta",
				cerradaEn: null,
				cerradaPor: null,
				reabiertaEn: contexto.ahora.toString(),
				reabiertaPor: quienCambia(contexto),
				motivoReapertura: datos.motivo,
			})
			.where(eq(asistenciaSemanas.id, semana.id));
		contexto.bitacora({
			descripcion: `Reabrió la asistencia del ${nombre}: ${datos.motivo}`,
			entidad: "asistencia_semanas",
			entidadId: semana.id,
			antes: { estado: "cerrada", cerrada_por: semana.cerradaPor },
			despues: { estado: "abierta", motivo: datos.motivo },
		});
		contexto.guardarEvento({
			tipo: "asistencia_semana.reabierta",
			datos: { asistencia_semana_id: semana.id },
			tablas: ["asistencia_semanas"],
			entidad: "asistencia_semanas",
			entidadId: semana.id,
		});
		return {
			resultado: {
				mensaje: `Semana del ${nombre} reabierta`,
				version: await versionActual(transaccion, asistenciaSemanas, semana.id),
			},
			entidad: { nombre: "asistencia_semanas", id: semana.id },
		};
	},
);
