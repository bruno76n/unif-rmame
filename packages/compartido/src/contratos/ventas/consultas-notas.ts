/**
 * Los contratos de las consultas de las notas de entrega en las pantallas de Ventas a externos: la lista de notas, el
 * cajón de una nota y el armado de una nota nueva.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega», «Armar nota de entrega», «Nota de entrega»)
 *
 * La nota también la abre Aduana desde En tránsito, con su recorte: sin precios, importes ni anticipo. El saldo solo
 * viaja a quien tiene Contaduría; a los demás, el estado del pago.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { clientePintado, estadoArmado, fechaConTexto, preciosRecortables } from "./vistas.ts";

/** Los estados de una nota que se filtran. */
export const estadosDeNota = ["por_despachar", "en_camino", "entregada"] as const;

/** La lista de notas de entrega. */
export const notasEntregaVentas = definirConsulta({
	nombre: "ventas.notas_entrega",
	descripcion: "Las notas de entrega que no se cancelaron: por despachar, en camino y entregadas, la más nueva primero",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Nota, pedido, prenda o cliente: todas las palabras"),
		estado: z.enum(estadosDeNota).optional().describe("Solo las de ese estado"),
		pedido_id: z.uuid().optional().describe("Solo las de ese pedido"),
	}),
	salida: z.object({
		conteos: z
			.object({
				todas: z.number().int(),
				por_despachar: z.number().int(),
				en_camino: z.number().int(),
				entregada: z.number().int(),
			})
			.describe("No cambian con el buscador ni con el pedido"),
		pedido: z.object({ pedido_id: z.uuid(), folio: z.string() }).nullable().describe("El filtro del pedido, si hay"),
		notas: z.array(
			z.object({
				nota_id: z.uuid(),
				folio: z.string(),
				fecha: z.string().describe("Cuándo se armó: «10 oct»"),
				pedido_id: z.uuid(),
				pedido_folio: z.string(),
				nota_de: z.string().describe("«nota {i} de {n}»"),
				cliente: z.string(),
				prendas: z.string(),
				tallas: z.string().describe("El rango de tallas de cada prenda: «8 a 12 · 6 a 16»"),
				piezas: z.number().int(),
				estado: z.enum(estadosDeNota),
				estado_armado: estadoArmado,
				forma_pago: z.string().describe("«Crédito 30 días»"),
				total_centavos: z.number().int().optional(),
			}),
		),
	}),
	permiso: { departamento: "ventas" },
});

/** El cajón de una nota de entrega. */
export const notaEntregaVentas = definirConsulta({
	nombre: "ventas.nota_entrega",
	descripcion: "Una nota de entrega con sus prendas, su pago y lo que se puede hacer con ella; sin precios para Aduana",
	entrada: z.object({ nota_id: z.uuid().describe("La nota") }),
	salida: z.object({
		nota_id: z.uuid(),
		folio: z.string(),
		version: z.number().int().describe("La versión del registro, para las acciones"),
		numero: z.number().int().describe("La «i» de «nota i de n»"),
		de: z.number().int().describe("La «n»: las notas del pedido"),
		estado: z.enum(["por_despachar", "en_camino", "entregada", "cancelada"]),
		estado_armado: estadoArmado,
		cliente: clientePintado,
		pedido: z.object({ pedido_id: z.uuid(), folio: z.string(), etapa: z.string() }),
		despacho: z.string().describe("«En aduana · por despachar», «D-0411 · en camino» o «D-0411 · despacho»"),
		pago: z.string().describe("«Sin pagar», «Pagada en parte», «Pagada» o «— · se cobra al entregar»"),
		cabecera: z.string().describe("«Armada el 9 oct», «Salió el 10 oct» o «Entregada el 10 oct»"),
		piezas: z.number().int(),
		forma_pago: z.string(),
		armo: z.string(),
		salio: z.string().nullable().describe("«10 oct · D-0411»"),
		recibio: z.string().nullable(),
		vence: fechaConTexto.nullable().describe("Entregada: cuándo vence; en rojo si venció sin pagarse"),
		prendas: z.array(
			z.object({
				nombre: z.string(),
				escuela: z.string(),
				tallas: z.array(z.object({ talla: z.string(), piezas: z.number().int() })),
				piezas: z.number().int(),
				precio_unitario_centavos: z.number().int().optional().describe("Solo a quien ve precios"),
				importe_centavos: z.number().int().optional().describe("Solo a quien ve precios"),
			}),
		),
		subtotal_centavos: z.number().int().optional(),
		anticipo_aplicado_centavos: z.number().int().optional(),
		notas_credito: z.array(
			z.object({ folio: z.string(), monto_centavos: z.number().int().optional().describe("Solo a quien ve precios") }),
		),
		por_cobrar_centavos: z.number().int().optional().describe("Por entregar: lo que se va a cobrar"),
		saldo_centavos: z.number().int().optional().describe("Entregada: solo a quien tiene Contaduría"),
		total_centavos: z.number().int().optional().describe("Para la ventana «Confirmar entrega»"),
		esperando: z.string().nullable().describe("«{AU} · esperando autorización de Dirección»"),
		lineas: z
			.array(
				z.object({
					nota_entrega_linea_id: z.uuid(),
					prenda: z.string(),
					talla: z.string(),
					pueden_regresar: z.number().int(),
				}),
			)
			.describe("Para «Nota de crédito»: lo que puede regresar de cada renglón"),
		puede: z.object({
			cancelar: z.boolean(),
			confirmar_entrega: z.boolean(),
			nota_credito: z.boolean(),
			pdf: z.boolean(),
		}),
	}),
	permiso: { departamento: ["ventas", "aduana", "contaduria", "direccion"] },
	recortables: [...preciosRecortables],
});

/** El armado de una nota de entrega nueva. */
export const armarNotaVentas = definirConsulta({
	nombre: "ventas.armar_nota",
	descripcion: "Lo listo en aduana de un pedido, por prenda y talla, con su precio y el anticipo disponible",
	entrada: z.object({ pedido_id: z.uuid().describe("El pedido") }),
	salida: z.object({
		pedido_id: z.uuid(),
		folio_pedido: z.string(),
		folio: z.string().describe("El NV- que sigue"),
		version: z.number().int().describe("La versión del pedido, para armarla"),
		cliente: clientePintado,
		entrega: fechaConTexto,
		forma_pago: z.string(),
		notas_anteriores: z.array(z.string()),
		anticipo_disponible_centavos: z.number().int().optional(),
		prendas: z.array(
			z.object({
				producto_id: z.uuid(),
				nombre: z.string(),
				linea: z.string().describe("«{n} listas en aduana · faltan {m} del pedido»"),
				tallas: z.array(
					z.object({
						variante_id: z.uuid(),
						talla: z.string(),
						listas: z.number().int(),
						precio_unitario_centavos: z.number().int().optional(),
					}),
				),
			}),
		),
	}),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "nada_listo", mensaje: "Nada listo en aduana para este pedido" }],
});
