/**
 * Los contratos de la impresión: las impresoras, los trabajos que pide el puente y su confirmación.
 * Fase 4 · docs/modulos/admin/impresion.md («Acciones» y «Lo que pide el programa puente y la pantalla»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/**
 * Agrega, cambia o da de baja una impresora. Sin `impresora_id` es alta; con él cambia, y entonces pide su
 * `version` (va en los datos, porque el alta no la lleva).
 */
export const guardarImpresora = definirAccion({
	nombre: "admin.guardar_impresora",
	descripcion: "Agrega, cambia o da de baja una impresora de etiquetas con su programa puente",
	entrada: z.object({
		impresora_id: z.uuid().optional().describe("La impresora que se cambia; sin él, es alta"),
		nombre: z.string().trim().min(1, "Escribe el nombre.").max(40).describe("Como sale en pantalla"),
		modelo: z.string().trim().min(1, "Escribe el modelo.").max(40).describe("El modelo: Zebra ZD421"),
		ubicacion_id: z.uuid().describe("La ubicación donde está"),
		dispositivo_id: z.uuid().optional().describe("Su programa puente"),
		baja: z.boolean().optional().describe("La da de baja"),
		motivo_baja: z.string().trim().max(80).optional().describe("El motivo de la baja"),
		version: z.number().int().nonnegative().optional().describe("La versión que se leyó, si ya existe"),
	}),
	salida: z.object({ impresora_id: z.uuid().describe("La impresora") }),
	permiso: { departamento: "admin", soloDuena: true },
	errores: [
		{ codigo: "puente_no_valido", mensaje: "Ese aparato no es un programa de impresión." },
		{ codigo: "puente_ocupado", mensaje: "Ese puente ya atiende otra impresora." },
	],
});

/** Un trabajo que el puente recibe para imprimir. */
const trabajoParaElPuente = z.object({
	id: z.uuid().describe("El trabajo"),
	impresora_id: z.uuid().describe("Su impresora"),
	tipo: z.string().describe("El tipo de etiqueta"),
	ids: z.array(z.uuid()).describe("Lo que se imprime"),
	copias: z.number().int().describe("Las copias"),
	ruta: z.string().describe("La ruta de la etiqueta en ZPL"),
});

/** El puente pide sus trabajos por imprimir; al entregárselos pasan a `mandado`. */
export const trabajosImpresion = definirAccion({
	nombre: "admin.trabajos_impresion",
	descripcion: "El programa puente pide los trabajos por imprimir de su impresora; al entregarlos pasan a mandado",
	entrada: z.object({}),
	salida: z.object({ trabajos: z.array(trabajoParaElPuente).describe("En el orden en que se pidieron") }),
	permiso: { aparatos: ["puente"] },
});

/** El puente confirma un trabajo: impreso o fallo. */
export const confirmarImpresion = definirAccion({
	nombre: "admin.confirmar_impresion",
	descripcion: "El programa puente confirma un trabajo: impreso o fallo con lo que dijo la impresora",
	entrada: z.object({
		trabajo_id: z.uuid().describe("El trabajo"),
		resultado: z.enum(["impreso", "fallo"]).describe("Cómo terminó"),
		error: z.string().trim().max(200).optional().describe("Lo que dijo la impresora; obligatorio con fallo"),
	}),
	salida: z.object({ estado: z.enum(["impreso", "fallo"]).describe("Cómo quedó el trabajo") }),
	permiso: { aparatos: ["puente"] },
});
