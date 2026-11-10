/**
 * Los contratos de las autorizaciones: decidirlas y la consulta de la pantalla de Dirección.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md y docs/interfaz/fabrica/direccion.md («Autorizaciones»)
 *
 * Pedir y cancelar son internas de `direccion` que llaman los módulos de origen: no tienen contrato público.
 */

import { z } from "zod";
import { definirAccion, definirConsulta } from "../definir.ts";

/** Los tipos de autorización. */
export const tiposDeAutorizacion = [
	"ajuste_inventario",
	"recepcion_de_mas",
	"nota_credito",
	"pago_fuera_de_lo_normal",
	"aprobar_desarrollo",
	"alta_usuario",
] as const;

/** Un tipo de autorización. */
export type TipoDeAutorizacion = (typeof tiposDeAutorizacion)[number];

/** Cómo se nombra cada tipo en la pantalla (los filtros y los avisos). */
export const nombreDelTipoDeAutorizacion: Readonly<Record<TipoDeAutorizacion, string>> = {
	ajuste_inventario: "Ajuste de inventario",
	recepcion_de_mas: "Recepción de más",
	nota_credito: "Nota de crédito",
	pago_fuera_de_lo_normal: "Pago fuera de lo normal",
	aprobar_desarrollo: "Aprobar desarrollo",
	alta_usuario: "Alta de usuario",
};

/** Las pantallas desde donde se decide: Dirección, y la dueña desde Bodega (ajustes) y Administración (altas). */
export const pantallasDeDecision = ["direccion", "bodega", "admin"] as const;

/** Dirección autoriza o rechaza una autorización; el módulo de origen aplica su efecto en la misma transacción. */
export const decidirAutorizacion = definirAccion({
	nombre: "direccion.decidir_autorizacion",
	descripcion: "Autoriza o rechaza una autorización, una sola vez; el módulo de origen aplica su efecto",
	entrada: z.object({
		autorizacion_id: z.uuid().describe("La autorización"),
		decision: z.enum(["autorizar", "rechazar"]).describe("Qué decide"),
		motivo: z
			.string()
			.trim()
			.min(5, "Escribe el motivo: le llega a quien lo pidió")
			.max(90)
			.optional()
			.describe("Al rechazar, de 5 a 90 letras: le llega a quien lo pidió"),
		desde: z.enum(pantallasDeDecision).describe("El departamento de la pantalla desde donde se decide"),
	}),
	salida: z.object({
		estado: z.enum(["autorizada", "rechazada"]).describe("Cómo quedó"),
		folio: z.string().describe("Su folio AU-"),
		datos: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Lo que regresó el efecto del módulo de origen (por ejemplo, el NC-)"),
	}),
	permiso: { departamento: "direccion", confirmarConGoogle: "decidir_autorizacion" },
	errores: [
		{ codigo: "ya_decidida", mensaje: "Esa autorización ya se decidió." },
		{ codigo: "no_se_decide_aqui", mensaje: "Desde esta pantalla no se decide ese tipo de autorización." },
	],
	edita: true,
});

/** Una autorización que espera, como la muestra su tarjeta. */
const porAutorizar = z.object({
	id: z.uuid(),
	folio: z.string(),
	tipo: z.enum(tiposDeAutorizacion),
	departamento: z.string().describe("El departamento que la pide"),
	pedida_en: z.string().describe("Cuándo se pidió"),
	dias_esperando: z.number().int(),
	resumen: z.string().describe("Qué se pide, ya armado"),
	detalle: z.string().nullable(),
	importe_centavos: z.number().int().nullable().optional(),
	importe_facturado_centavos: z.number().int().nullable().optional(),
	cantidad: z.string().nullable().describe("Lo recibido de más, en texto con tres decimales"),
	unidad: z.string().nullable(),
	pedida_por: z.string().nullable().describe("«Lo pidió {persona}»"),
	pedida_por_ti: z.boolean().describe("«Pedida por ti»: la pidió la cuenta que ve"),
	puede_decidir: z.boolean(),
	no_puede_porque: z.string().nullable().describe("Por qué no la puede decidir quien ve"),
	documento_id: z.uuid().nullable().describe("El documento al que apunta"),
	version: z.number().int(),
});

/** Una autorización resuelta, como la muestra su renglón. */
const resuelta = z.object({
	id: z.uuid(),
	folio: z.string(),
	tipo: z.enum(tiposDeAutorizacion),
	resuelta_en: z.string(),
	resumen: z.string(),
	detalle: z.string().nullable(),
	resultado: z.enum(["autorizada", "rechazada", "cancelada"]),
	motivo: z.string().nullable(),
	misma_persona: z.boolean().describe("Pedida y autorizada por la misma persona"),
});

/** La pantalla de Autorizaciones: los filtros, las que esperan y las resueltas. */
export const autorizaciones = definirConsulta({
	nombre: "direccion.autorizaciones",
	descripcion: "Las autorizaciones que esperan, con sus filtros por tipo, y las resueltas",
	entrada: z.object({
		tipo: z.enum(tiposDeAutorizacion).optional().describe("Solo las que esperan de ese tipo"),
		cursor_resueltas: z.string().optional().describe("El cursor de la página anterior de las resueltas"),
	}),
	salida: z.object({
		filtros: z
			.array(z.object({ tipo: z.enum(tiposDeAutorizacion).nullable(), nombre: z.string(), cuantas: z.number().int() }))
			.describe("«Todas» y cada tipo con algo pendiente, con su conteo"),
		por_autorizar: z.array(porAutorizar).describe("De la más vieja a la más nueva"),
		resueltas: z.array(resuelta).describe("La más reciente arriba"),
		cursor_resueltas: z.string().nullable(),
		hay_mas_resueltas: z.boolean(),
	}),
	permiso: { departamento: "direccion" },
});
