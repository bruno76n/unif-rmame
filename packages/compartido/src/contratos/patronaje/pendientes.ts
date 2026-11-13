/**
 * El contrato de Pendientes de Patronaje: las tres cifras de arriba (Recetas, Rendimiento y Desarrollo de producto) y la
 * cola de trabajo (las prendas sin receta o sin verificar y las muestras esperando aprobación), cada renglón ya
 * escrito con su estado y lo que su botón necesita.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Pendientes»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Los grupos de Pendientes, que son también sus filtros. */
export const gruposDePendientesDePatronaje = ["todos", "recetas", "muestra"] as const;

/** Lo común de cada renglón de Pendientes. */
const comun = {
	clave: z.string().describe("La clave del renglón"),
	titulo: z.string().describe("La referencia: qué es"),
	detalle: z.string().describe("Abajo de la referencia: su detalle"),
	fecha: z.string().nullable().describe("La fecha que importa, ya escrita («Corte 15 oct»)"),
	fecha_orden: z.string().nullable().describe("La fecha que ordena (ISO)"),
	fecha_roja: z.boolean().describe("Si la fecha va en rojo"),
	estado: z.string().describe("El estado, en su forma fija"),
	color: colorDeEstado.describe("El color del estado"),
};

/** Un renglón de Pendientes, con lo que su botón necesita. */
export const renglonDePendientesDePatronaje = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("receta"),
		...comun,
		producto_id: z.uuid().describe("La prenda, para abrir su receta"),
		boton: z.enum(["capturar", "verificar"]).describe("«Capturar receta» (sin receta) o «Verificar» (sin verificar)"),
	}),
	z.object({
		tipo: z.literal("muestra"),
		...comun,
		desarrollo_id: z.uuid().describe("El desarrollo, para abrir su cajón"),
	}),
]);

export const pendientesDePatronaje = definirConsulta({
	nombre: "patronaje.pendientes",
	descripcion:
		"Pendientes de Patronaje: las cifras de recetas, rendimiento y desarrollo, y la cola de trabajo con su botón. Sin dinero",
	entrada: z.object({
		grupo: z.enum(gruposDePendientesDePatronaje).optional().describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		indicadores: z.object({
			recetas: z.object({
				prendas: z.number().int().describe("Las prendas que llevan receta (sin Accesorios y servicios)"),
				sin_receta_pronto: z.number().int().describe("Las sin receta con corte en `patronaje.corte_proximo_dias`"),
				verificadas: z.number().int().describe("Las verificadas contra corte"),
				sin_verificar: z.number().int().describe("Las capturadas sin verificar"),
				sin_receta: z.number().int().describe("Las que no tienen receta"),
			}),
			rendimiento: z.object({
				altos: z.number().int().describe("Las prendas con desperdicio arriba de `patronaje.desperdicio_alto_pct`"),
				pct_alto: z.number().describe("`patronaje.desperdicio_alto_pct`"),
				medidas: z.number().int().describe("Las prendas medidas en corte"),
			}),
			desarrollo: z.object({
				en_proceso: z.number().int().describe("Los desarrollos que no están en catálogo ni descartados"),
				en_aprobacion: z.number().int().describe("Los que esperan aprobación"),
			}),
		}),
		conteos: z
			.object({ todos: z.number().int(), recetas: z.number().int(), muestra: z.number().int() })
			.describe("Cuántos renglones tiene cada filtro"),
		hay_rojo: z.boolean().describe("Si algún renglón va en rojo: la pestaña va en rojo"),
		renglones: z.array(renglonDePendientesDePatronaje).describe("Los renglones del filtro"),
	}),
	permiso: { departamento: "patronaje" },
});
