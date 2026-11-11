/**
 * Los contratos de lo que sube la tablet del taller (los registros por operación, los consumibles y el PIN bloqueado)
 * y de cancelar un registro.
 * Fase 12 · docs/modulos/produccion/registros-de-operacion.md («Acciones»)
 *
 * Lo de la tablet llega por su cola (`sync/subir`) con la persona que entró con su PIN y la hora en que pasó: lo que
 * ya se hizo no se rechaza; lo que no se puede aplicar se aparta.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Una persona registra en la tablet lo que hizo en un bulto. */
export const registrarOperacion = definirAccion({
	nombre: "produccion.registrar_operacion",
	descripcion: "Registra las piezas buenas y dañadas de una operación en un bulto, desde la tablet",
	entrada: z.object({
		id: z.uuid().describe("El registro, hecho por la tablet"),
		bulto_id: z.uuid().describe("El bulto"),
		flujo_operacion_id: z.uuid().describe("La operación del flujo del lote"),
		piezas_buenas: z.number().int().nonnegative().describe("Las buenas"),
		piezas_danadas: z.number().int().nonnegative().describe("Las dañadas: merma de esta operación"),
		sin_internet: z.boolean().describe("Si se capturó sin conexión"),
	}),
	salida: z.object({
		registro_id: z.uuid().describe("El registro"),
		tope: z.number().int().describe("El tope del bulto en esa operación al llegar"),
		estado_lote: z.string().describe("La etapa del lote después del registro"),
	}),
	permiso: { aparatos: ["tablet"], cola: true },
	errores: [
		{ codigo: "bulto_no_existe", mensaje: "Ese bulto no existe." },
		{ codigo: "operacion_ajena", mensaje: "Esa operación no es del flujo del lote." },
		{ codigo: "operacion_de_corte", mensaje: "Las piezas del corte nacen al cerrar el corte." },
		{ codigo: "sin_piezas", mensaje: "Registra al menos una pieza." },
		{ codigo: "persona_no_valida", mensaje: "Esa persona no es del Taller." },
	],
});

/** El encargado del taller cancela un registro, con motivo. */
export const cancelarRegistro = definirAccion({
	nombre: "produccion.cancelar_registro",
	descripcion: "Cancela un registro de la tablet: descuenta sus piezas del lote, del bulto y de la persona",
	entrada: z.object({
		registro_id: z.uuid().describe("El registro"),
		motivo: z
			.string("Escribe el motivo.")
			.trim()
			.describe("Por qué se cancela; al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "registro_ya_cancelado", mensaje: "Ese registro ya está cancelado." },
		{ codigo: "registro_de_corte", mensaje: "Las piezas del corte no se cancelan: el corte cerrado no se modifica." },
		{ codigo: "lote_ya_revisado", mensaje: "{lote} ya pasó por Calidad: este registro ya no se cancela." },
		{
			codigo: "operacion_siguiente_ya_reporto",
			mensaje: "La operación siguiente ya reportó {n}: primero se cancela lo de {operación}",
		},
	],
	edita: true,
});

/** Una persona toma consumibles en la tablet. */
export const tomarConsumibleTaller = definirAccion({
	nombre: "produccion.tomar_consumible",
	descripcion: "Descuenta los consumibles que alguien tomó en la tablet, en la unidad de inventario",
	entrada: z.object({
		id: z.uuid().describe("La toma, hecha por la tablet"),
		renglones: z
			.array(
				z.object({
					material_id: z.uuid().describe("El consumible"),
					cantidad: z.number().int().min(1).describe("Cuántos, en la unidad de la tablet"),
				}),
			)
			.min(1)
			.describe("Lo que tomó"),
	}),
	salida: z.object({
		movimiento_id: z.uuid().describe("El movimiento"),
		descontado: z
			.array(z.object({ material_id: z.uuid(), cantidad: z.string() }))
			.describe("Lo descontado, en su unidad"),
	}),
	permiso: { aparatos: ["tablet"], cola: true },
	errores: [
		{ codigo: "no_es_consumible", mensaje: "{material} no es consumible." },
		{ codigo: "material_repetido", mensaje: "Un consumible va una sola vez." },
	],
});

/** La tablet avisa que bloqueó un PIN por intentos equivocados. */
export const registrarBloqueoPin = definirAccion({
	nombre: "produccion.registrar_bloqueo_pin",
	descripcion: "Bloquea en Personal el PIN que la tablet bloqueó por intentos equivocados",
	entrada: z.object({
		pin_id: z.uuid().describe("El PIN que bajó"),
		intentos: z.number().int().positive().describe("Los intentos equivocados"),
	}),
	salida: z.object({ estado: z.string().describe("El estado del PIN") }),
	permiso: { aparatos: ["tablet"], cola: true },
	errores: [{ codigo: "pin_ajeno", mensaje: "Ese PIN no es de esa persona." }],
});
