/**
 * Los contratos de la pestaña Órdenes de producción: las sugerencias de Bodega, las tarjetas por pedido o por orden
 * con su hilo chico, y las opciones de la ventana «Orden de producción nueva».
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Órdenes de producción» y «Ventanas»)
 */

import { z } from "zod";
import { definirConsulta, paginaDe } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { paradaDeLote } from "./hilo.ts";

/** Los filtros de la pestaña. */
export const filtrosDeOrdenes = ["todas", "clientes", "reabasto", "temporada"] as const;

/** Una sugerencia de Bodega por decidir: una prenda y una ubicación. */
export const sugerenciaDeBodega = z.object({
	sugerencia_ids: z.array(z.uuid()),
	prenda: z.string(),
	detalle: z.string().describe("«Para Tienda 2 · 8: 5 · 10: 3»"),
	piezas: z.number().int(),
});

/** Una tarjeta: un pedido (junta sus órdenes) o una orden de reabasto o de temporada. */
const tarjetaDeOrden = z.object({
	clave: z.string(),
	tipo: z.enum(["pedido", "reabasto", "temporada"]),
	pedido_id: z.uuid().nullable(),
	nombre: z.string().describe("El cliente, la tienda o «Temporada · bodega»"),
	color: z.string().nullable().describe("El color de la escuela del cliente"),
	referencia: z.string().describe("«PE-0149 · entrega 3 nov» o la referencia de la orden"),
	plazo: z
		.object({ texto: z.string(), tono: z.enum(["rojo", "ambar", "normal"]) })
		.nullable()
		.describe("«hace 3 días» o «en 2 días», mientras sigue en el taller"),
	folios: z.array(z.string()).describe("Los folios de sus órdenes"),
	levanto: z.string().describe("«{motivo} · {quién la levantó}»"),
	estado: z.object({
		texto: z.string(),
		color: colorDeEstado,
		abajo: z.string().nullable(),
	}),
	renglones: z.array(
		z.object({
			prenda: z.string(),
			piezas: z.number().int(),
			lotes: z.array(z.string()),
			lote_id: z.uuid().nullable().describe("Su primer lote que no ha llegado a aduana: lo abre el renglón"),
			hilo: z.array(paradaDeLote),
		}),
	),
});

export const ordenesDeProduccion = definirConsulta({
	nombre: "produccion.ordenes",
	descripcion:
		"Las órdenes de producción por pedido o por orden, con sus prendas y su hilo; las que ya salieron del taller, por páginas",
	entrada: z.object({
		filtro: z.enum(filtrosDeOrdenes).optional().describe("Sin él, todas"),
		cursor: z.string().optional().describe("Para «Ver más» de las que ya salieron del taller"),
	}),
	salida: z.object({
		sugerencias: z.array(sugerenciaDeBodega).describe("«Bodega sugiere fabricar»"),
		conteos: z.object({
			todas: z.number().int(),
			clientes: z.number().int(),
			reabasto: z.number().int(),
			temporada: z.number().int(),
		}),
		en_taller: z.array(tarjetaDeOrden).describe("Las que siguen en el taller, por entrega"),
		salieron: z.object(paginaDe(tarjetaDeOrden)).describe("Las que ya salieron del taller"),
	}),
	permiso: { departamento: "produccion" },
});

export const opcionesOrdenNueva = definirConsulta({
	nombre: "produccion.opciones_orden_nueva",
	descripcion:
		"Lo que ofrece la ventana «Orden de producción nueva»: para quién, las prendas que pasan por el taller con sus tallas y la entrega que propone",
	entrada: z.object({
		texto: z.string().max(80).optional().describe("Lo que se escribe para buscar la prenda"),
	}),
	salida: z.object({
		destinos: z.array(z.object({ ubicacion_id: z.uuid(), nombre: z.string() })),
		prendas: z.array(
			z.object({
				producto_id: z.uuid(),
				nombre: z.string(),
				con_receta: z.boolean(),
				tallas: z.array(
					z.object({
						variante_id: z.uuid(),
						talla: z.string(),
						especial: z.boolean(),
						descontinuada: z.boolean(),
					}),
				),
			}),
		),
		entrega_propuesta: z.string().describe("Hoy + `produccion.orden_entrega_temporada_dias`, en ISO"),
	}),
	permiso: { departamento: "produccion" },
});
