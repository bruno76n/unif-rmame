/**
 * Los contratos de Mantenimiento: las máquinas (alta, baja y quién la trae), las fallas (reportar, mandar a reparación
 * y la nota de seguimiento) y los servicios.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Un texto opcional que llega vacío o con algo. */
const opcional = (largo: number, mensaje: string) => z.string().trim().max(largo, mensaje).optional();

/** Mantenimiento da de alta una máquina, con su tipo (o uno nuevo), su área y quién la trae. */
export const altaMaquina = definirAccion({
	nombre: "mantenimiento.alta_maquina",
	descripcion: "Da de alta una máquina con el folio de su tipo",
	entrada: z.object({
		nombre: z
			.string("Escribe cómo le dicen en el taller.")
			.trim()
			.min(1, "Escribe cómo le dicen en el taller.")
			.max(40, "Va en 40 letras.")
			.describe("Cómo le dicen en el taller"),
		tipo_maquina_id: z.uuid("Escoge el tipo.").optional().describe("Su tipo"),
		tipo_nuevo: z
			.string("Escribe el tipo.")
			.trim()
			.min(2, "Escribe el tipo.")
			.max(40, "Va en 40 letras.")
			.optional()
			.describe("«Otro tipo»: el nombre del tipo nuevo"),
		area_id: z.uuid("Escoge el área.").describe("Su área, de la lista «Áreas del taller»"),
		marca: opcional(40, "Va en 40 letras.").describe("Marca, opcional"),
		modelo: opcional(40, "Va en 40 letras.").describe("Modelo, opcional"),
		serie: opcional(40, "Va en 40 letras.").describe("Serie, opcional; única si viene"),
		persona_id: z.uuid("¿Quién la trae?").describe("«La trae»: una persona activa del Taller"),
	}),
	salida: z.object({ maquina_id: z.uuid(), folio: z.string().describe("Su folio, con el prefijo de su tipo") }),
	permiso: { departamento: "mantenimiento" },
	errores: [
		{ codigo: "maquina_repetida", mensaje: "Ya hay una máquina con ese nombre." },
		{ codigo: "serie_repetida", mensaje: "Ya hay una máquina con esa serie." },
		{ codigo: "persona_no_valida", mensaje: "¿Quién la trae?" },
	],
});

/** Mantenimiento da de baja una máquina sin falla abierta. */
export const bajaMaquina = definirAccion({
	nombre: "mantenimiento.baja_maquina",
	descripcion: "Da de baja una máquina sin falla abierta; sus fallas y servicios se quedan",
	entrada: z.object({
		maquina_id: z.uuid().describe("La máquina"),
		motivo: z
			.string("Escribe el motivo.")
			.trim()
			.max(120, "El motivo va en 120 letras.")
			.describe("Por qué; al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "mantenimiento" },
	errores: [
		{
			codigo: "maquina_con_falla_abierta",
			mensaje: "{máquina} tiene una falla abierta: resuélvela antes de darla de baja",
		},
		{ codigo: "maquina_ya_de_baja", mensaje: "{máquina} ya está dada de baja." },
	],
	edita: true,
});

/** Mantenimiento cambia quién trae una máquina. */
export const cambiarAsignacionMaquina = definirAccion({
	nombre: "mantenimiento.cambiar_asignacion_maquina",
	descripcion: "Cambia quién trae una máquina; una falla abierta conserva a quien la traía al fallar",
	entrada: z.object({
		maquina_id: z.uuid().describe("La máquina"),
		persona_id: z.uuid("¿Quién la trae?").describe("Quién la trae ahora: una persona activa del Taller"),
	}),
	salida: z.object({}),
	permiso: { departamento: "mantenimiento" },
	errores: [
		{ codigo: "maquina_ya_de_baja", mensaje: "{máquina} ya está dada de baja." },
		{ codigo: "persona_no_valida", mensaje: "¿Quién la trae?" },
	],
	edita: true,
});

/** Una falla se reporta en Mantenimiento o, con su PIN, en la tablet del taller (por su cola). */
export const reportarFalla = definirAccion({
	nombre: "mantenimiento.reportar_falla",
	descripcion: "Reporta una falla de una máquina; si el motivo la detiene, la máquina queda parada",
	entrada: z.object({
		id: z.uuid().optional().describe("La falla, hecha por la tablet; en la web la hace el servidor"),
		maquina_id: z.uuid("Escoge la máquina").describe("La máquina"),
		motivo_falla_id: z.uuid("Escoge qué tiene").describe("Qué le pasa"),
		nota: opcional(200, "La nota va en 200 letras.").describe("«Nota (opcional)», solo en la web"),
		sin_internet: z.boolean().optional().describe("Si se capturó sin conexión, en la tablet"),
	}),
	salida: z.object({
		falla_id: z.uuid().nullable().describe("La falla; vacío si la máquina ya tenía una abierta o está de baja"),
		folio: z.string().nullable().describe("Su folio FM-"),
		detuvo_maquina: z.boolean().describe("Si la máquina quedó parada"),
	}),
	permiso: { departamento: "mantenimiento", aparatos: ["tablet"], cola: true },
	errores: [
		{ codigo: "maquina_con_falla_abierta", mensaje: "{máquina} ya tiene una falla abierta en Mantenimiento" },
		{ codigo: "maquina_ya_de_baja", mensaje: "{máquina} está dada de baja." },
		{ codigo: "persona_no_valida", mensaje: "¿Quién la reporta?" },
	],
});

/** Mantenimiento manda una falla reportada a reparación, con su técnico. */
export const mandarAReparacion = definirAccion({
	nombre: "mantenimiento.mandar_a_reparacion",
	descripcion: "Manda una falla reportada a reparación con su técnico, y dice si la máquina se queda parada",
	entrada: z.object({
		falla_id: z.uuid().describe("La falla"),
		tecnico_id: z.uuid("Escoge el técnico.").optional().describe("El técnico de la lista"),
		tecnico_nombre: z
			.string("Escribe el nombre del técnico o taller.")
			.trim()
			.min(2, "Escribe el nombre del técnico o taller.")
			.max(60, "Va en 60 letras.")
			.optional()
			.describe("«Otro técnico»: se queda en la lista"),
		se_queda_parada: z.boolean().describe("Si la máquina se queda parada mientras la reparan"),
	}),
	salida: z.object({ tecnico_id: z.uuid().describe("El técnico") }),
	permiso: { departamento: "mantenimiento" },
	errores: [
		{ codigo: "falla_no_reportada", mensaje: "{FM} ya está {en reparación o resuelta}." },
		{ codigo: "tecnico_de_baja", mensaje: "Escoge el técnico." },
		{ codigo: "ya_estaba_parada", mensaje: "{máquina} ya está parada: sigue así hasta registrar la reparación." },
	],
	edita: true,
});

/** Mantenimiento guarda la nota de seguimiento de una falla abierta. */
export const guardarNotaSeguimiento = definirAccion({
	nombre: "mantenimiento.guardar_nota_seguimiento",
	descripcion: "Guarda la nota de seguimiento de una falla abierta; vacía la borra",
	entrada: z.object({
		falla_id: z.uuid().describe("La falla"),
		nota: z.string().trim().max(200, "La nota va en 200 letras.").describe("La nota; vacía la borra"),
	}),
	salida: z.object({}),
	permiso: { departamento: "mantenimiento" },
	errores: [{ codigo: "falla_resuelta", mensaje: "Esa falla ya está resuelta." }],
	edita: true,
});

/** Mantenimiento registra un servicio: la reparación que resuelve una falla, o uno suelto. */
export const registrarServicio = definirAccion({
	nombre: "mantenimiento.registrar_servicio",
	descripcion: "Registra un servicio: resuelve una falla o es suelto, con su costo y sus horas de paro",
	entrada: z.object({
		falla_id: z
			.uuid()
			.optional()
			.describe("La falla que resuelve, si es una reparación; la `version` es la de la falla"),
		maquina_id: z.uuid().optional().describe("La máquina, si es un servicio suelto; la `version` es la de la máquina"),
		tecnico_id: z.uuid("Escoge el técnico.").describe("El técnico"),
		que_se_hizo: z
			.string("Escribe qué se hizo")
			.trim()
			.min(4, "Escribe qué se hizo")
			.max(80, "Escribe qué se hizo")
			.describe("Qué se hizo, de 4 a 80 letras"),
		costo_centavos: z
			.number("Escribe el costo, puede ser 0")
			.int("Escribe el costo, puede ser 0")
			.min(0, "Escribe el costo, puede ser 0")
			.max(99_999_999_99, "Escribe el costo, puede ser 0")
			.describe("El costo, en centavos"),
		horas_paro: z
			.number("Horas enteras, puede ser 0")
			.int("Horas enteras, puede ser 0")
			.min(0, "Horas enteras, puede ser 0")
			.max(9999, "Horas enteras, puede ser 0")
			.describe("Las horas de paro"),
	}),
	salida: z.object({ servicio_id: z.uuid(), folio: z.string().describe("Su folio SM-") }),
	permiso: { departamento: "mantenimiento" },
	errores: [
		{ codigo: "falla_resuelta", mensaje: "Esa falla ya está resuelta." },
		{ codigo: "maquina_ya_de_baja", mensaje: "{máquina} ya está dada de baja." },
		{ codigo: "tecnico_de_baja", mensaje: "Escoge el técnico." },
	],
	edita: true,
});
