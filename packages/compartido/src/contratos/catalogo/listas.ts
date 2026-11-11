/**
 * Los contratos de las listas de precios: los porcentajes de mayoreo de un cliente.
 * Fase 8 · docs/modulos/catalogo/listas-de-precios.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Un porcentaje del cliente sobre mostrador, de 0 a 100, o vacío si no tiene. */
const porcentaje = z
	.number("Entre 0 y 100 %")
	.min(0, "Entre 0 y 100 %")
	.max(100, "Entre 0 y 100 %")
	.nullable()
	.describe("De 0 a 100, o vacío si no tiene");

/** Catálogo pone los porcentajes de básicos y de especiales de la lista de un cliente. */
export const cambiarPorcentajesCliente = definirAccion({
	nombre: "catalogo.cambiar_porcentajes_cliente",
	descripcion: "Pone el % de básicos y el de especiales de la lista de un cliente, sobre mostrador",
	entrada: z.object({
		lista_id: z.uuid().describe("La lista del cliente"),
		pct_basicos: porcentaje,
		pct_especiales: porcentaje,
	}),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "lista_no_es_de_cliente", mensaje: "No es lista de un cliente." },
		{ codigo: "lista_dada_de_baja", mensaje: "Está dada de baja con su cliente." },
	],
	edita: true,
});
