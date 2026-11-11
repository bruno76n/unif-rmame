/**
 * Los contratos de los precios: «Aplicar cambios» de la ficha y el cambio en bloque.
 * Fase 8 · docs/modulos/catalogo/productos.md («`catalogo.aplicar_cambios_producto`») y precios.md
 * («`catalogo.cambiar_precios_en_bloque`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";
import { precioDeLista, recargoDePedidoEspecial } from "./productos.ts";

/** Catálogo aplica juntos los cambios de la ficha: canales, categoría, recargo, tipo de prenda y precios. */
export const aplicarCambiosProducto = definirAccion({
	nombre: "catalogo.aplicar_cambios_producto",
	descripcion: "Aplica juntos los cambios de la ficha de un producto, en una sola transacción",
	entrada: z.object({
		producto_id: z.uuid().describe("El producto"),
		canales: z
			.object({ mostrador: z.boolean(), en_linea: z.boolean(), externos: z.boolean() })
			.partial()
			.optional()
			.describe("Solo los canales que cambian"),
		categoria_mayoreo_id: z.uuid().optional().describe("Su categoría de mayoreo"),
		recargo_pedido_especial_centavos: recargoDePedidoEspecial.optional(),
		tipo_prenda_id: z.uuid().optional().describe("Su tipo de prenda"),
		precios: z
			.array(
				z.object({
					lista_id: z.uuid(),
					variante_id: z.uuid().nullable().describe("Vacío: el precio base"),
					precio_centavos: precioDeLista.nullable().describe("Vacío: quitarlo; en una talla, regresarla al base"),
				}),
			)
			.optional()
			.describe("Los precios que cambian"),
	}),
	salida: z.object({ cambios: z.number().int().describe("Cuántos cambios se aplicaron") }),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "sin_canal", mensaje: "Marca al menos un lugar donde se vende, o descontinúa el producto." },
		{ codigo: "falta_precio", mensaje: "Falta el precio de esa lista." },
		{ codigo: "en_linea_solo_sin_escuela", mensaje: "Solo productos de «Ninguna escuela» se venden en línea." },
		{ codigo: "servicio_en_linea", mensaje: "Los servicios de mostrador no se venden en línea" },
		{
			codigo: "precio_talla_especial",
			mensaje: "Esa talla es de pedido especial: cobra el precio base más el recargo.",
		},
		{ codigo: "lista_no_aplica", mensaje: "Esa lista no aplica: el producto no se vende en ese canal." },
		{ codigo: "producto_descontinuado", mensaje: "El producto está descontinuado: reactívalo para cambiarlo." },
		{ codigo: "sin_cambios", mensaje: "Sin cambios" },
	],
	edita: true,
});

/** Catálogo sube o baja, con «Confirmar con Google», los precios de varios productos en una lista. */
export const cambiarPreciosEnBloque = definirAccion({
	nombre: "catalogo.cambiar_precios_en_bloque",
	descripcion: "Sube o baja en por ciento o en pesos los precios de varios productos en una lista",
	entrada: z.object({
		lista_id: z.uuid().describe("La lista"),
		productos: z
			.array(z.object({ producto_id: z.uuid(), version: z.number().int().nonnegative() }))
			.min(1)
			.describe("Los productos, con la versión que se leyó de cada uno"),
		direccion: z.enum(["subir", "bajar"]).describe("Subir o bajar"),
		modo: z.enum(["por_ciento", "pesos"]).describe("Por ciento o pesos"),
		cantidad: z
			.number("Solo números, hasta 3 cifras.")
			.int("Solo números, hasta 3 cifras.")
			.min(1, "Solo números, hasta 3 cifras.")
			.max(999, "Solo números, hasta 3 cifras.")
			.describe("De 1 a 999"),
		redondear: z.boolean().describe("Al múltiplo de `catalogo.bloque_redondeo_centavos`"),
	}),
	salida: z.object({
		precios_cambiados: z.number().int().describe("Cuántos precios cambiaron"),
		sin_cambio: z.array(z.uuid()).describe("Los productos que se dejaron igual"),
	}),
	permiso: { departamento: "catalogo", confirmarConGoogle: "cambiar_precios_en_bloque" },
	errores: [
		{ codigo: "tope_por_ciento", mensaje: "Más de ese por ciento se cambia producto por producto." },
		{ codigo: "tope_pesos", mensaje: "Más de esos pesos se cambia producto por producto." },
		{ codigo: "sin_cambio", mensaje: "Con ese cambio no se mueve ningún precio." },
		{ codigo: "sin_precio_en_lista", mensaje: "Ninguno de esos productos tiene precio en esa lista." },
		{ codigo: "precio_fuera_de_rango", mensaje: "Un precio quedaría fuera del rango: quítalo de la selección." },
	],
});
