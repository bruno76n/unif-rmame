/**
 * Los contratos de los despachos: despachar desde aduana, recordar, anotar las etiquetas, recibir en Bodega y
 * confirmar la entrega en una tienda sin caja.
 * Fase 11 · docs/modulos/inventario/surtido-y-despachos.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Un renglón contado del otro lado: piezas de una prenda, o la cantidad de material (por rollo). */
const renglonContado = z
	.object({
		traspaso_linea_id: z.uuid().describe("El renglón del traspaso"),
		piezas: z.number().int().nonnegative().optional().describe("Las piezas que llegaron, si es prenda"),
		cantidad: z
			.string()
			.trim()
			.regex(/^\d{1,9}(\.\d{1,3})?$/)
			.optional()
			.describe("Lo que llegó, si es material"),
	})
	.describe("Un renglón contado");

/** Cómo llegó. */
const modo = z.enum(["completo", "con_diferencias"]).describe("«Llegó completo» o «Llegó con diferencias»");

/** Aduana junta en un despacho D- los traspasos que van a un mismo destino y los saca a tránsito. */
export const despachar = definirAccion({
	nombre: "inventario.despachar",
	descripcion: "Despacha uno o varios traspasos a un mismo destino: salen de aduana a tránsito en un D-",
	entrada: z.object({
		traspasos: z
			.array(
				z.object({
					traspaso_id: z.uuid().describe("El traspaso"),
					version: z.number().int().describe("La versión que se leyó"),
				}),
			)
			.min(1, "Escoge lo que sale")
			.describe("Los traspasos, todos al mismo destino"),
		destino_ubicacion_id: z.uuid().optional().describe("Solo si el destino está por decidir: Bodega o una tienda"),
	}),
	salida: z.object({ despacho_id: z.uuid().describe("El despacho"), folio: z.string().describe("Su folio D-") }),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "no_esta_en_aduana", mensaje: "{folio} no está en aduana." },
		{ codigo: "destinos_distintos", mensaje: "Un despacho va a un solo destino" },
		{ codigo: "sin_nota", mensaje: "Sin nota de entrega no sale" },
		{ codigo: "se_empaca", mensaje: "Los pedidos en línea no se despachan: salen al empacarlos" },
		{ codigo: "espera_calidad", mensaje: "{folio} espera la revisión de Calidad" },
		{
			codigo: "es_devolucion_proveedor",
			mensaje: "Lo de más que regresa al proveedor sale con «Devolver al proveedor».",
		},
		{ codigo: "devolucion_pendiente", mensaje: "Primero regresa al proveedor lo de más de {OC}." },
	],
});

/** Aduana recuerda al destino que tiene algo por confirmar. */
export const recordarDespacho = definirAccion({
	nombre: "inventario.recordar_despacho",
	descripcion: "Recuerda al destino que confirme un despacho en tránsito; solo quien recibe confirma",
	entrada: z.object({ despacho_id: z.uuid().describe("El despacho") }),
	salida: z.object({}),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "ya_confirmado", mensaje: "{D} ya lo confirmó {destino}" },
		{ codigo: "es_cliente", mensaje: "A un cliente no se le recuerda: confirma la entrega con su firma." },
	],
	edita: true,
});

/** Aduana manda las etiquetas de un traspaso a su impresora, o las saca en PDF, y quedan anotadas. */
export const marcarEtiquetasImpresas = definirAccion({
	nombre: "inventario.marcar_etiquetas_impresas",
	descripcion: "Imprime o saca en PDF las etiquetas de un lote, un reproceso o los rollos de un proveedor",
	entrada: z.object({
		traspaso_id: z.uuid().describe("El traspaso"),
		destino: z.enum(["impresora", "pdf"]).describe("La Zebra de Aduana o un PDF"),
	}),
	salida: z.object({ pdf_ruta: z.string().optional().describe("Con `pdf`: la ruta del PDF que abre la pantalla") }),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "sin_etiquetas", mensaje: "{folio} no lleva etiquetas." },
		{ codigo: "impresora_sin_puente", mensaje: "La impresora de Aduana no está conectada. Usa el PDF." },
	],
	edita: true,
});

/** Bodega recibe un despacho: completo, o con lo que contó de cada renglón y lo que no venía. */
export const recibirDespacho = definirAccion({
	nombre: "inventario.recibir_despacho",
	descripcion: "Recibe en bodega un despacho de aduana, completo o con diferencias",
	entrada: z.object({
		despacho_id: z.uuid().describe("El despacho"),
		modo,
		renglones: z.array(renglonContado).optional().describe("Obligatorios con diferencias: cada renglón, aunque sea 0"),
		no_venia: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La prenda"),
					piezas: z.number().int().positive().describe("Cuántas llegaron"),
				}),
			)
			.optional()
			.describe("Lo que llegó y no venía en el despacho"),
	}),
	salida: z.object({ recepcion_id: z.uuid().describe("La recepción") }),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "ya_recibido", mensaje: "{D} ya se recibió" },
		{ codigo: "otro_destino", mensaje: "{D} no va a bodega." },
		{ codigo: "es_cliente", mensaje: "Lo de un cliente se cierra con «Confirmar entrega»." },
	],
	edita: true,
});

/** Aduana confirma la entrega en una tienda sin caja, con la firma de su encargada. */
export const entregarATiendaSinCaja = definirAccion({
	nombre: "inventario.entregar_a_tienda_sin_caja",
	descripcion: "Confirma la entrega de un despacho en una tienda sin caja, con quien firmó la hoja",
	entrada: z.object({
		despacho_id: z.uuid().describe("El despacho"),
		recibio_nombre: z
			.string("Escribe quién recibió")
			.trim()
			.min(3, "Escribe quién recibió")
			.max(80, "Escribe quién recibió")
			.describe("Quien firmó la hoja del despacho"),
		modo,
		renglones: z.array(renglonContado).optional().describe("Obligatorios con diferencias: cada renglón, aunque sea 0"),
	}),
	salida: z.object({ recepcion_id: z.uuid().describe("La recepción") }),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "ya_recibido", mensaje: "{D} ya se recibió" },
		{
			codigo: "no_es_tienda_sin_caja",
			mensaje: "{tienda} ya lleva su existencia en Unifórmame: confirma desde su caja.",
		},
	],
	edita: true,
});
