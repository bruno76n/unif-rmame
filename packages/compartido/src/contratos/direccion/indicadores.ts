/**
 * El contrato de `direccion.indicadores`: los cuatro paneles de la pestaña Indicadores de Dirección.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Indicadores») y docs/modulos/direccion/alertas-e-indicadores.md
 * («Los indicadores»)
 *
 * Nunca lleva sueldos ni costos: solo lo vendido, las prendas terminadas y las piezas. Los montos son opcionales: la
 * cuenta de soporte no los recibe (el recorte común).
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Contra qué se compara la semana. */
export const comparaciones = ["semana_pasada", "hace_un_mes", "temporada_pasada"] as const;

/** Un canal de venta en la semana. */
const canal = z.object({
	clave: z.enum(["tienda_1", "tienda_2", "externos", "en_linea"]),
	nombre: z.string().describe("Tienda 1, Tienda 2, Clientes externos o En línea"),
	vendido_centavos: z.number().int().optional().describe("Lo vendido esta semana"),
	comparado_centavos: z.number().int().optional().describe("Lo vendido en la semana contra la que se compara"),
	vende_desde: z.string().nullable().describe("El día de su primera venta; nulo si todavía no vende"),
});

export const indicadores = definirConsulta({
	nombre: "direccion.indicadores",
	descripcion:
		"Indicadores de Dirección: las ventas de la semana por canal contra lo que se compara, ocho semanas contra el año pasado, las prendas terminadas de 12 días de trabajo y la existencia por ubicación",
	entrada: z.object({
		comparar: z.enum(comparaciones).optional().describe("Contra qué se compara la semana; al abrir, la semana pasada"),
	}),
	salida: z.object({
		semana: z.object({
			desde: z.string().describe("El primer día de la semana: los últimos siete días, hasta hoy"),
			total_centavos: z.number().int().optional(),
			comparado_centavos: z.number().int().optional(),
			variacion: z.string().nullable().describe("«▲ 51%» o «▼ 8%»; nula si no hay contra qué comparar"),
			contra: z
				.string()
				.describe("«contra semana anterior», «contra hace un mes» o «contra misma semana del año pasado»"),
			nombre_comparado: z.string().describe("Cómo se llama la semana comparada en la gráfica («Semana anterior»)"),
			canales: z.array(canal),
		}),
		por_semana: z
			.array(
				z.object({
					desde: z.string().describe("El primer día de la semana"),
					este_anio_centavos: z.number().int().optional(),
					anio_pasado_centavos: z.number().int().optional().describe("La misma semana del año pasado"),
				}),
			)
			.describe("Las ocho semanas, de la más vieja a la más nueva"),
		terminadas: z.object({
			dias: z
				.array(z.object({ fecha: z.string(), piezas: z.number().int() }))
				.describe("Los últimos 12 días de trabajo"),
			esta_semana: z.number().int().describe("Las de los últimos 6 días de trabajo"),
			lotes: z.string().describe("«{n} lote atorado, {n} en proceso, {n} por cortar»"),
		}),
		existencias: z.object({
			total: z.number().int(),
			ubicaciones: z.array(z.object({ codigo: z.string(), nombre: z.string(), piezas: z.number().int() })),
		}),
	}),
	permiso: { departamento: "direccion" },
});
