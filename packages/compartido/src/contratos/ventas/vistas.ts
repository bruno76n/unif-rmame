/**
 * Las piezas que comparten las consultas de las pantallas de Ventas a externos: una fecha con su texto, un estado ya
 * armado con su color, los tramos de una barra y el cliente como se pinta.
 * Fase 19 · docs/interfaz/fabrica/ventas.md y docs/interfaz/TEXTOS.md («Los estados», «Las etapas de pedidos, notas y
 * lotes»)
 *
 * La consulta arma los textos y escoge el color con las reglas del módulo: la pantalla solo los pinta.
 */

import { z } from "zod";
import { colorDeEstado } from "../estados.ts";

/** El tono de una línea corta: normal, ámbar (por hacer) o rojo (vencido). */
export const tono = z.enum(["normal", "ambar", "rojo"]).describe("Normal, ámbar o rojo");

/** Una fecha de negocio con su texto («14 oct», «en 3 días») y su tono. */
export const fechaConTexto = z.object({
	fecha: z.iso.date().describe("La fecha de negocio, en hora de México"),
	texto: z.string().describe("Cómo se lee: «14 oct»"),
	cuando: z.string().describe("Lo que falta o lo que pasó: «en 3 días», «hace 2 días», «hoy», «Entregado»"),
	tono,
});

/** Un estado ya armado: su texto, su color y la línea de abajo. */
export const estadoArmado = z.object({
	texto: z.string().describe("El estado, en una de las formas de la guía"),
	color: colorDeEstado,
	abajo: z.string().nullable().describe("La alerta que va abajo, en el mismo cuadro"),
});

/** Un tramo de una barra de avance o de reparto. */
export const tramo = z.object({
	etiqueta: z.string().describe("Qué cuenta: «Entregado»"),
	valor: z.number().int().describe("Cuántas"),
	color: colorDeEstado,
});

/** El cliente como se pinta en un encabezado o un grupo. */
export const clientePintado = z.object({
	cliente_id: z.uuid(),
	nombre: z.string().describe("El nombre de su tercero"),
	color: z.string().nullable().describe("El color de su escuela; nulo si no es escuela"),
});

/** Las etapas de un pedido que se filtran. */
export const etapasDePedido = [
	"borrador",
	"confirmado",
	"en_produccion",
	"listo_en_aduana",
	"entrega_parcial",
	"entregado",
] as const;

/** Lo que se le recorta a quien no ve precios: los importes y los precios. */
export const preciosRecortables = [
	"subtotal_centavos",
	"anticipo_aplicado_centavos",
	"por_cobrar_centavos",
	"saldo_centavos",
	"precio_unitario_centavos",
	"importe_centavos",
	"monto_centavos",
	"total_centavos",
] as const;
