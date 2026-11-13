/**
 * El contrato de la ventana «Revisar devolución {folio}»: lo que regresó con defecto y está en aduana esperando a
 * Calidad, por renglón, con lo que queda por decidir y el defecto y la nota con que llegó.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Ventanas»: «Revisar devolución {folio}»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

export const devolucionDeCalidad = definirConsulta({
	nombre: "calidad.devolucion",
	descripcion: "Una devolución en aduana que espera a Calidad: por renglón, lo que queda por decidir. Sin precios",
	entrada: z.object({ traspaso_id: z.uuid().describe("La devolución") }),
	salida: z.object({
		traspaso_id: z.uuid().describe("La devolución"),
		version: z.number().int().describe("Su versión, para «Guardar decisión»"),
		folio: z.string().describe("Su folio"),
		cliente: z.string().describe("De quién regresó"),
		renglones: z
			.array(
				z.object({
					traspaso_linea_id: z.uuid().describe("El renglón"),
					prenda: z.string().describe("«{prenda} · talla {t}»"),
					lote: z.string().nullable().describe("El folio del lote, si se sabe"),
					por_decidir: z.number().int().describe("Las piezas que quedan por decidir"),
					defecto_id: z.uuid().nullable().describe("El defecto con que llegó"),
					defecto: z.string().nullable().describe("Su nombre"),
					nota: z.string().nullable().describe("La nota con que llegó"),
				}),
			)
			.describe("Los renglones de prendas, en su orden"),
		defectos: z.array(z.object({ id: z.uuid(), nombre: z.string() })).describe("El catálogo de defectos"),
	}),
	permiso: { departamento: "calidad" },
	errores: [{ codigo: "no_existe", mensaje: "Esa devolución no existe." }],
});
