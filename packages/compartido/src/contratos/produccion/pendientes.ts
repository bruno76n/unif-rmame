/**
 * El contrato de Pendientes de Producción: las cuatro cifras de arriba y la cola de trabajo (cambios de pedido, lotes
 * atorados o en riesgo, cortes próximos, sugerencias de Bodega y excepciones del taller), cada renglón ya escrito.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Los grupos de Pendientes, que son también sus filtros. */
export const gruposDePendientesDeProduccion = [
	"todos",
	"cambios",
	"lotes",
	"corte",
	"sugerencias",
	"excepciones",
] as const;

/** Lo común de cada renglón de Pendientes. */
const comun = {
	clave: z.string().describe("La clave del renglón"),
	titulo: z.string().describe("La referencia: qué es"),
	detalle: z.string().describe("Abajo de la referencia: su detalle"),
	fecha: z.string().nullable().describe("La fecha que importa, ya escrita («Entrega 3 nov»)"),
	fecha_orden: z.string().nullable().describe("La fecha que ordena (ISO)"),
	fecha_roja: z.boolean().describe("Si la fecha va en rojo"),
	cifra: z.string().nullable().describe("La cantidad, ya escrita («190 pz»)"),
	estado: z.string().describe("El estado, en su forma fija"),
	color: colorDeEstado.describe("El color del estado"),
};

/** Un renglón de Pendientes, con lo que su botón necesita. */
export const renglonDePendientesDeProduccion = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("cambio"),
		...comun,
		cambio_pedido_id: z.uuid().describe("El cambio por aplicar"),
		version: z.number().int().describe("La versión del cambio, para «Aplicar a lotes»"),
		efectos: z.array(z.string()).describe("Lo que va a pasar al aplicarlo, calculado como lo hará la acción"),
	}),
	z.object({
		tipo: z.literal("lote"),
		...comun,
		lote_id: z.uuid().describe("El lote, para abrir su cajón"),
		atorado: z.boolean().describe("Si está atorado: su botón va en negro"),
	}),
	z.object({
		tipo: z.literal("corte"),
		...comun,
		lote_id: z.uuid().describe("El lote por cortar"),
		producto_id: z.uuid().describe("Su prenda, para «Capturar receta»"),
		con_receta: z.boolean().describe("Si su prenda tiene receta"),
	}),
	z.object({
		tipo: z.literal("sugerencia"),
		...comun,
		sugerencia_ids: z.array(z.uuid()).describe("Las sugerencias por decidir de esa prenda y esa ubicación"),
	}),
	z.object({
		tipo: z.literal("excepcion"),
		...comun,
		excepcion_id: z.uuid().describe("La excepción por resolver"),
		version: z.number().int().describe("Su versión, para «Resolver»"),
	}),
]);

export const pendientesDeProduccion = definirConsulta({
	nombre: "produccion.pendientes",
	descripcion:
		"Pendientes de Producción: las cifras de lotes, corte, órdenes y producción, y la cola de trabajo con su botón. Sin dinero",
	entrada: z.object({
		grupo: z.enum(gruposDePendientesDeProduccion).optional().describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		indicadores: z.object({
			lotes: z.object({
				en_proceso: z.number().int().describe("Los lotes en proceso"),
				por_cortar: z.number().int().describe("Los lotes por cortar"),
				atorados: z.number().int().describe("Los atorados y los atrasados"),
				en_riesgo: z.number().int().describe("Los en riesgo de atraso"),
				en_tiempo: z.number().int().describe("Los demás en proceso"),
			}),
			corte: z.object({
				proximos: z.number().int().describe("Los lotes que se cortan en los próximos días"),
				dias: z.number().int().describe("`produccion.cortes_proximos_dias`"),
				sin_receta: z.number().int().describe("Los lotes por cortar sin receta, de cualquier fecha"),
			}),
			ordenes: z.object({
				en_taller: z.number().int().describe("Las órdenes con lotes que no han llegado a aduana"),
				de_clientes: z.number().int().describe("De esas, las de clientes"),
				de_reabasto: z.number().int().describe("De esas, las de reabasto"),
			}),
			produccion: z.object({
				terminadas_hoy: z.number().int().describe("Las buenas de hoy en la última operación de cada flujo"),
				por_dia: z.array(z.number().int()).describe("Las terminadas de los últimos 12 días de trabajo"),
			}),
		}),
		conteos: z
			.object({
				todos: z.number().int(),
				cambios: z.number().int(),
				lotes: z.number().int(),
				corte: z.number().int(),
				sugerencias: z.number().int(),
				excepciones: z.number().int(),
			})
			.describe("Cuántos renglones tiene cada filtro"),
		hay_rojo: z.boolean().describe("Si algún renglón va en rojo: la pestaña y la pastilla van en rojo"),
		renglones: z.array(renglonDePendientesDeProduccion).describe("Los renglones del filtro"),
	}),
	permiso: { departamento: "produccion" },
});
