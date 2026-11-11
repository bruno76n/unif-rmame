/**
 * Los contratos de los reclamos: registrar uno, del código de la prenda a su lote, y marcarlo resuelto.
 * Fase 13 · docs/modulos/calidad/reclamos-y-devoluciones.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** El rastreo de un reclamo: se calcula, no se guarda (regla 5). */
const rastreo = z.object({
	lote: z.string().describe("El folio del lote"),
	revisado_por: z.string().nullable().describe("Quién lo revisó"),
	revisado_en: z.string().nullable().describe("Cuándo"),
	operacion: z.string().describe("La operación que lo causó"),
	persona: z.string().nullable().describe("Quién la hizo"),
	rollos: z
		.array(
			z.object({
				rollo: z.string(),
				partida: z.string().nullable(),
				tela: z.string(),
				proveedor: z.string().nullable(),
			}),
		)
		.describe("Los rollos del corte con su partida, su tela y su proveedor"),
	lotes_de_la_prenda: z.number().int().describe("En cuántos lotes se hizo esa prenda"),
});

/** Calidad registra un reclamo de un cliente o de una tienda. */
export const registrarReclamo = definirAccion({
	nombre: "calidad.registrar_reclamo",
	descripcion: "Registra un reclamo: del código de la prenda a su lote, su operación y su persona",
	entrada: z.object({
		origen: z.enum(["cliente_externo", "tienda"]).describe("De un cliente externo o de una tienda"),
		cliente_id: z.uuid().optional().describe("El cliente, si es de un cliente externo"),
		ubicacion_id: z.uuid().optional().describe("La tienda, si es de una tienda"),
		salida_tienda_id: z.uuid().optional().describe("La salida con que llegó de la tienda, si se sabe"),
		nota_entrega_id: z.uuid().optional().describe("La nota de entrega en que salió, si se sabe"),
		codigo: z
			.string("Escribe el código de la prenda.")
			.trim()
			.regex(/^\d{6}$/, "Escribe el código de la prenda.")
			.describe("El código de 6 dígitos de la prenda"),
		lote_id: z.uuid("Escoge el lote.").describe("El lote revisado de esa prenda"),
		defecto_id: z.uuid("Escoge el defecto.").describe("El defecto"),
		flujo_operacion_id: z.uuid("Escoge la operación.").describe("La operación del flujo que lo causó"),
		persona_id: z.uuid().optional().describe("Quién la hizo; si no viene, la que propone Producción"),
		piezas: z.number("¿Cuántas piezas?").int("¿Cuántas piezas?").min(1, "¿Cuántas piezas?").describe("Cuántas"),
		que_dice_cliente: z
			.string("Escribe lo que dice el cliente.")
			.trim()
			.max(500, "Va en 500 letras.")
			.describe("Qué dice el cliente; al menos `calidad.reclamo_min_letras` letras"),
	}),
	salida: z.object({
		reclamo_id: z.uuid().describe("El reclamo"),
		folio: z.string().describe("Su folio RC-"),
		rastreo,
	}),
	permiso: { departamento: "calidad" },
	errores: [
		{ codigo: "codigo_desconocido", mensaje: "Ese código no es de ninguna prenda." },
		{ codigo: "sin_lotes_revisados", mensaje: "Esa prenda no tiene lotes revisados por Calidad." },
		{ codigo: "lote_no_corresponde", mensaje: "Ese lote no tiene esa prenda revisada." },
		{ codigo: "operacion_no_ligada", mensaje: "Esa operación no suele causar ese defecto en {prenda}." },
		{ codigo: "tienda_no_valida", mensaje: "Escoge la tienda." },
	],
});

/** Calidad marca un reclamo como resuelto, con una resolución opcional. */
export const resolverReclamo = definirAccion({
	nombre: "calidad.resolver_reclamo",
	descripcion: "Marca un reclamo como resuelto",
	entrada: z.object({
		reclamo_id: z.uuid().describe("El reclamo"),
		resolucion: z
			.string()
			.trim()
			.max(200, "La resolución va en 200 letras.")
			.optional()
			.describe("Cómo se resolvió, opcional"),
	}),
	salida: z.object({}),
	permiso: { departamento: "calidad" },
	errores: [{ codigo: "reclamo_ya_resuelto", mensaje: "Ese reclamo ya está resuelto." }],
	edita: true,
});
