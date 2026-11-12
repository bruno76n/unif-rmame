/**
 * Los contratos de los lotes en las pantallas de Producción: la pestaña Lotes (cuatro grupos), el cajón del lote y el
 * costo del lote, que solo ven Compras y Contaduría.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes» y «Cajones · Lote»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { paradaDeLote } from "./hilo.ts";
import { casillaDeLaTira, estadoEscrito, paraQuien, recetaDeLaPrenda } from "./pantallas.ts";

/** La tarjeta de un lote en proceso: su prenda, para quién, su tira y su estado. */
const tarjetaDeLote = z.object({
	lote_id: z.uuid(),
	folio: z.string(),
	prenda: z.string(),
	piezas: z.number().int().describe("Las cortadas"),
	para: paraQuien,
	estado: estadoEscrito,
	tira: z.array(casillaDeLaTira).describe("Una casilla por operación del flujo, sin el corte"),
});

export const lotesDeProduccion = definirConsulta({
	nombre: "produccion.lotes",
	descripcion: "Los lotes del taller en cuatro grupos: atorados, en proceso, por cortar y terminados. Sin dinero",
	entrada: z.object({}),
	salida: z.object({
		atorados: z.array(tarjetaDeLote).describe("Los atorados y los atrasados"),
		en_proceso: z.array(tarjetaDeLote).describe("Los demás en proceso: primero los en riesgo, luego por entrega"),
		por_cortar: z
			.array(
				z.object({
					lote_id: z.uuid(),
					folio: z.string(),
					prenda: z.string(),
					modelo: z.string().describe("La escuela de la prenda, o «Básico»"),
					piezas: z.number().int().describe("Las planeadas"),
					fecha_corte: z.string().describe("La fecha de corte, ya escrita"),
					en_dias: z.string().describe("«en 2 días», «hoy», «hace 3 días»"),
					corte_pronto: z.boolean().describe("A `inventario.dias_entrega_corte` días o menos: va en ámbar"),
					para: paraQuien,
					receta: recetaDeLaPrenda,
				}),
			)
			.describe("Por fecha de corte"),
		terminados: z
			.array(
				z.object({
					lote_id: z.uuid(),
					folio: z.string(),
					prenda: z.string(),
					modelo: z.string(),
					listas: z.number().int(),
					cortadas: z.number().int(),
					merma: z.number().int(),
					para: paraQuien,
				}),
			)
			.describe("Los que esperan a Calidad"),
	}),
	permiso: { departamento: "produccion" },
});

/** Un renglón de los registros de la tablet en el cajón del lote. */
const registroDelLote = z.object({
	registro_id: z.uuid(),
	version: z.number().int(),
	cuando: z.string().describe("La fecha y la hora, ya escritas"),
	bulto: z.string().describe("El folio del bulto"),
	persona: z.string(),
	operacion: z.string(),
	buenas: z.number().int(),
	danadas: z.number().int(),
	del_corte: z.boolean().describe("Los del corte dicen «Corte» y no se cancelan"),
	cancelado: z.boolean(),
	motivo: z.string().nullable().describe("El motivo, si se canceló"),
	cancelable: z.boolean().describe("Si se puede cancelar: vigente, de la tablet y sin pasar por Calidad"),
	tarifa_centavos: z.number().int().nullable().optional().describe("Su tarifa; solo con «ven sueldos y tarifas»"),
});

export const loteDeProduccion = definirConsulta({
	nombre: "produccion.lote",
	descripcion:
		"El cajón del lote: su estado, su hilo, sus cifras, cada operación, los registros de la tablet, sus bultos y los rollos que usó",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote"),
		cursor: z.string().optional().describe("Para «Ver más» registros"),
	}),
	salida: z.object({
		lote_id: z.uuid(),
		folio: z.string(),
		orden: z.string().describe("El folio de su orden"),
		prenda: z.string(),
		producto_id: z.uuid(),
		etapa: z.enum(["por_cortar", "en_proceso", "terminado", "revisado", "en_aduana", "cancelado"]),
		estado: estadoEscrito,
		avisos: z.array(z.string()).describe("El porqué de un atorado por máquina, o que falta la receta"),
		pedido_id: z.uuid().nullable().describe("Con pedido, el hilo es el de su prenda en el pedido"),
		hilo: z.array(paradaDeLote).describe("El hilo del lote, si no es de un pedido"),
		cifras: z.object({
			planeadas: z.number().int(),
			cortadas: z.number().int().nullable(),
			listas: z.number().int(),
			merma: z.number().int().nullable(),
		}),
		para: paraQuien,
		entrega: z.string().describe("«3 nov · en 4 días»"),
		corte: z.string().describe("La fecha de corte, y «· programado» sin cortar"),
		receta: z.string().describe("«Versión 2 · verificada contra corte», «… sin verificar» o «Sin receta»"),
		con_receta: z.boolean(),
		operaciones: z
			.array(
				z.object({
					operacion: z.string(),
					hechas: z.number().int(),
					puede_hasta: z.number().int(),
					merma: z.number().int(),
					quien: z.array(z.object({ persona: z.string(), piezas: z.number().int() })),
					linea: z.string().describe("«Atorado desde el 13 oct» o «Se junta trabajo: 40 esperando»"),
					marca: z.enum(["se_junta", "atorado"]).nullable(),
				}),
			)
			.describe("Operación por operación, ya cortado"),
		sin_cortar: z.string().nullable().describe("«Se corta el 13 oct. 190 piezas en 6 tallas.»"),
		registros: z.object({
			renglones: z.array(registroDelLote),
			total: z.number().int(),
			cursor: z.string().nullable(),
			hay_mas: z.boolean(),
		}),
		bultos: z.array(z.object({ bulto_id: z.uuid(), folio: z.string(), talla: z.string(), piezas: z.number().int() })),
		rollos: z
			.object({
				partidas: z.string().describe("«Partida P-0001» o «2 partidas»"),
				mezcladas: z.boolean(),
				renglones: z.array(
					z.object({
						rollo: z.string(),
						partida: z.string(),
						tela: z.string(),
						metros: z.string(),
						costo_metro_centavos: z
							.number()
							.int()
							.optional()
							.describe("El precio por metro; solo con Compras o Contaduría"),
					}),
				),
				por_pieza: z.string().describe("Metros de la tela principal por pieza"),
				patron: z.string().describe("Metros por pieza según el patrón"),
				rendimiento: z.string().describe("«+6% sobre el patrón»"),
				rendimiento_rojo: z.boolean(),
			})
			.nullable()
			.describe("Los rollos usados, ya cortado"),
		ver_costo: z.boolean().describe("Si la cuenta ve el costo del lote: Compras o Contaduría, ya cortado"),
	}),
	permiso: { departamento: "produccion" },
	recortables: ["costo_metro_centavos"],
});

export const costoDeLote = definirConsulta({
	nombre: "produccion.costo_lote",
	descripcion:
		"El costo de un lote cortado: la tela a su precio de compra, los avíos a su última compra y, con «ven sueldos y tarifas», la mano de obra",
	entrada: z.object({ lote_id: z.uuid().describe("El lote") }),
	salida: z.object({
		cortadas: z.number().int(),
		tela: z.object({
			metros: z.string(),
			importe_centavos: z.number().int().optional().describe("Sin montos para soporte"),
		}),
		avios: z.object({ importe_centavos: z.number().int().optional().describe("Sin montos para soporte") }),
		mano_de_obra: z
			.object({
				operaciones: z.number().int(),
				por_pieza_centavos: z.number().int().optional().describe("La suma de las tarifas por pieza"),
				importe_centavos: z.number().int().optional(),
				estimada: z.boolean().describe("En proceso es estimada; terminado, la real de sus registros"),
			})
			.optional()
			.describe("Solo con «ven sueldos y tarifas»"),
		total_centavos: z.number().int().optional().describe("Solo con «ven sueldos y tarifas»"),
		costo_por_pieza_centavos: z
			.number()
			.int()
			.optional()
			.describe("El total entre las cortadas; solo con «ven sueldos y tarifas»"),
	}),
	permiso: { departamento: ["compras", "contaduria"] },
	errores: [{ codigo: "lote_sin_cortar", mensaje: "{lote} todavía no se corta." }],
	recortables: ["mano_de_obra", "total_centavos", "costo_por_pieza_centavos"],
});
