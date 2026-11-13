/**
 * Los contratos de Rendimiento: la pestaña (tela por pieza, patrón contra lo que se gasta en el tendido, en tres
 * grupos) y el cajón de una prenda, con su desglose por talla. Sale de los cortes cerrados.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Rendimiento» y «Cajones»: Rendimiento)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { renglonPatronContraCorte } from "./receta.ts";

/** Una prenda medida en corte. */
const prendaMedida = z.object({
	producto_id: z.uuid(),
	prenda: z.string(),
	detalle: z.string().describe("«{escuela o Básico} · {tela}»"),
	patron: z.string().describe("Metros por pieza que dice el patrón, en la talla de en medio («0.92»)"),
	real: z.string().describe("Metros por pieza que se gastan en el tendido («0.98»)"),
	desperdicio: z.string().describe("«+6%»"),
	alto: z.boolean().describe("Arriba de `patronaje.desperdicio_alto_pct`"),
	lotes: z.number().int().describe("Su respaldo: cuántos lotes"),
	flojo: z.boolean().describe("Con menos de `patronaje.dato_flojo_lotes` lotes"),
	ultimo_corte: z.string().nullable().describe("«15 oct»"),
});

export const rendimientoDePatronaje = definirConsulta({
	nombre: "patronaje.rendimiento",
	descripcion: "La tela por pieza de cada prenda: patrón contra lo que se gasta en el tendido, de los cortes cerrados",
	entrada: z.object({}),
	salida: z.object({
		pct_alto: z.number().describe("`patronaje.desperdicio_alto_pct`"),
		altos: z.array(prendaMedida).describe("Desperdicio alto, de mayor a menor"),
		normales: z.array(prendaMedida).describe("Desperdicio normal, de mayor a menor"),
		sin_medir: z
			.array(
				z.object({
					producto_id: z.uuid(),
					prenda: z.string(),
					detalle: z.string().describe("Su escuela, o «Básico»"),
					motivo: z
						.string()
						.describe("«Sin receta: no hay patrón contra qué medir» o «Todavía no se corta con esta receta»"),
				}),
			)
			.describe("Las que no se han medido, por nombre"),
	}),
	permiso: { departamento: "patronaje" },
});

export const rendimientoDeUnaPrenda = definirConsulta({
	nombre: "patronaje.rendimiento_prenda",
	descripcion: "El rendimiento de una prenda: patrón contra corte, y por talla",
	entrada: z.object({ producto_id: z.uuid().describe("La prenda") }),
	salida: z.object({
		producto_id: z.uuid(),
		prenda: z.string(),
		tela: z.string().describe("Su tela principal"),
		medido: z
			.object({
				patron: z.string().describe("«0.92 m · dice el patrón, talla 10»"),
				real: z.string().describe("«0.98 m · se gasta en el tendido»"),
				alto: z.boolean(),
				desperdicio: z.string().describe("«+6% · desperdicio, 3 lotes»"),
				flojo: z.string().nullable().describe("«Con 2 lotes el dato todavía es flojo.»"),
				tallas: z.array(renglonPatronContraCorte),
			})
			.nullable()
			.describe("Sin cortes medidos, vacío"),
	}),
	permiso: { departamento: "patronaje" },
});
