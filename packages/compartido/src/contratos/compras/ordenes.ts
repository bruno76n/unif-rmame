/**
 * Los contratos de las órdenes de compra: levantarlas en borrador, guardar el borrador, marcarla enviada,
 * cancelarla o descartarla, y cerrarla con faltante.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md («Acciones»)
 *
 * Las cantidades van enteras, en la unidad de inventario; los topes (la cantidad máxima, el múltiplo de compra, el
 * precio máximo, la fecha prometida más lejana) los revisa la acción, porque los deciden la dueña y el material.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";
import { precioDeCompra } from "./materiales.ts";

/** Una cantidad de una línea: entera y mayor que cero. */
const cantidad = z
	.number("Escribe cuánto pedir")
	.int("Escribe cuánto pedir")
	.positive("Tiene que ser más de 0")
	.describe("En la unidad de inventario; múltiplo de lo que se compra junto");

/** El motivo de cancelar, descartar o cerrar con faltante. */
const motivo = z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras");

/** Los errores de la cantidad y del precio de una línea. */
const erroresDeLinea = [
	{ codigo: "cantidad_demasiada", mensaje: "Es demasiado: revisa la cantidad" },
	{ codigo: "no_es_multiplo", mensaje: "No es múltiplo de lo que se compra junto." },
] as const;

/** Lo que se ve en el cajón del borrador: cada línea con su cantidad y su precio, y la fecha prometida. */
const delBorrador = {
	orden_compra_id: z.uuid().describe("La orden"),
	renglones: z
		.array(
			z.object({
				orden_compra_linea_id: z.uuid().describe("La línea"),
				cantidad,
				precio_centavos: precioDeCompra("Escribe el precio."),
			}),
		)
		.describe("Las líneas, como se ven en el cajón"),
	fecha_prometida: z.iso
		.date("Escribe la fecha en que promete llegar")
		.describe("«Promete llegar»: de hoy a `compras.dias_max_fecha_prometida` días"),
};

/** La orden ya se envió. */
const ordenNoEsBorrador = {
	codigo: "orden_no_es_borrador",
	mensaje: "Ya se envió: después de enviada no cambia.",
} as const;

/** Compras levanta lo que hay que pedir: se suma al borrador de cada proveedor, o nace uno. */
export const levantarOrden = definirAccion({
	nombre: "compras.levantar_orden",
	descripcion: "Levanta materiales a pedir: por proveedor, se suman a su borrador o nace la orden en borrador",
	entrada: z.object({
		renglones: z
			.array(
				z.object({
					material_id: z.uuid().describe("El material"),
					proveedor_id: z.uuid().describe("A quién se le compra"),
					cantidad,
					precio_centavos: precioDeCompra("Escribe el precio."),
				}),
			)
			.min(1, "No hay materiales en la orden. Agrega uno de la lista.")
			.describe("Lo que se pide"),
	}),
	salida: z.object({
		ordenes: z
			.array(
				z.object({
					orden_id: z.uuid().describe("La orden"),
					folio: z.string().describe("Su folio OC-"),
					proveedor: z.string().describe("Su proveedor"),
					resultado: z.enum(["nueva", "sumada"]).describe("Si nació o se sumó a su borrador"),
				}),
			)
			.describe("Las órdenes que tocó"),
	}),
	permiso: { departamento: "compras" },
	errores: [
		...erroresDeLinea,
		{ codigo: "material_repetido", mensaje: "Ese material está dos veces con el mismo proveedor." },
		{ codigo: "material_dado_de_baja", mensaje: "Ese material está dado de baja." },
		{ codigo: "proveedor_dado_de_baja", mensaje: "Ese proveedor está dado de baja." },
	],
});

/** Compras guarda el borrador: cantidades, precios y fecha prometida. */
export const guardarBorradorOrden = definirAccion({
	nombre: "compras.guardar_borrador_orden",
	descripcion: "Guarda las cantidades, los precios y la fecha prometida de un borrador",
	entrada: z.object(delBorrador),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [...erroresDeLinea, ordenNoEsBorrador],
	edita: true,
});

/** Compras marca enviada la orden: se congela, cuenta en camino y se guarda su PDF. */
export const marcarOrdenEnviada = definirAccion({
	nombre: "compras.marcar_orden_enviada",
	descripcion: "Marca enviada la orden: congela cantidades y precios, copia la condición y guarda su PDF",
	entrada: z.object(delBorrador),
	salida: z.object({
		precios_nuevos: z
			.array(z.object({ material: z.string(), precio_centavos: z.number().int().optional() }))
			.describe("Los precios que entraron al historial"),
		pdf_url: z.string().describe("La dirección firmada del PDF"),
	}),
	permiso: { departamento: "compras" },
	errores: [...erroresDeLinea, ordenNoEsBorrador],
	edita: true,
});

/** Compras cancela una orden enviada o descarta un borrador, con motivo. */
export const cancelarOrden = definirAccion({
	nombre: "compras.cancelar_orden",
	descripcion: "Cancela una orden enviada o descarta un borrador; lo que faltaba deja de contar en camino",
	entrada: z.object({ orden_compra_id: z.uuid().describe("La orden"), motivo }),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "orden_recibida_en_parte", mensaje: "Ya recibió material: ciérrala con faltante." },
		{ codigo: "orden_terminada", mensaje: "Ya está terminada: no se cancela." },
	],
	edita: true,
});

/** Compras cierra con faltante una orden recibida en parte. */
export const cerrarOrdenConFaltante = definirAccion({
	nombre: "compras.cerrar_orden_con_faltante",
	descripcion: "Cierra una orden recibida en parte: lo que faltó deja de contar en camino",
	entrada: z.object({ orden_compra_id: z.uuid().describe("La orden"), motivo }),
	salida: z.object({}),
	permiso: { departamento: "compras" },
	errores: [
		{ codigo: "orden_no_recibida_en_parte", mensaje: "Solo una orden recibida en parte se cierra con faltante." },
	],
	edita: true,
});
