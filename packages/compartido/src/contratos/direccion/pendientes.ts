/**
 * El contrato de `direccion.pendientes`: la primera pestaña de Dirección, con su barra de indicadores y su panel de
 * autorizaciones y alertas.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes»)
 *
 * Cada cifra y cada pendiente llegan armados (el texto, el color de su estado y a dónde lleva): la pantalla solo los
 * muestra.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Una parte de la línea de contexto de una cifra; lo rojo y lo ámbar van primero. */
export const parteDeContexto = z.object({
	texto: z.string(),
	tono: z.enum(["rojo", "ambar", "normal"]),
});

/** Un pedazo de la barra repartida de una cifra. */
const pedazo = z.object({
	etiqueta: z.string(),
	valor: z.number().describe("Su tamaño en la barra (piezas o centavos)"),
	color: z.enum(["rojo", "ambar", "azul", "verde", "gris", "morado", "verde-azulado", "naranja"]),
});

/** Una cifra de la barra de indicadores, ya armada. */
const cifra = z.object({
	clave: z.enum(["ventas", "produccion", "existencias", "cuentas"]),
	numero: z.string().describe("El número ya escrito: «$262,000», «4,175»"),
	unidad: z.string().describe("Lo que va junto al número: «última semana», «prendas terminadas»"),
	rojo: z.boolean().describe("Si el número va en rojo (lotes atorados)"),
	contexto: z.array(parteDeContexto).describe("La línea de contexto, lo rojo primero"),
	serie: z.array(z.number()).describe("Los datos de la gráfica chica, del más viejo al más nuevo; vacía si no lleva"),
	reparto: z.array(pedazo).describe("La barra repartida; vacía si no lleva"),
	lleva_a: z
		.string()
		.nullable()
		.describe(
			"La ruta de la web a la que lleva («direccion/indicadores»); nula si la cuenta no tiene ese departamento",
		),
});

/** Los grupos del panel. */
export const gruposDePendientes = ["autorizaciones", "alertas"] as const;

/** Un pendiente del panel, ya armado. */
const pendiente = z.object({
	clave: z.string().describe("La autorización (`autorizacion:{id}`) o la clave de la alerta"),
	grupo: z.enum(gruposDePendientes),
	titulo: z.string().describe("El tipo de autorización, o el título de la alerta"),
	detalle: z.string().nullable().describe("«{qué se pide} · {departamento}, {quién}», o el detalle de la alerta"),
	fecha: z.string().nullable().describe("El día en que se pidió; las alertas no llevan"),
	cifra: z.string().nullable().describe("El importe («$1,200») o la cantidad con su unidad («20 m»)"),
	estado: z.string().describe("«Por autorizar», «Por autorizar · {n} días» o «Por revisar»"),
	color: z.enum(["rojo", "ambar"]).describe("El color de su estado, que también lo ordena"),
	lleva_a: z
		.string()
		.nullable()
		.describe("La ruta de la web de su botón; nula si la cuenta no tiene ese departamento (entonces no lleva botón)"),
});

export const pendientes = definirConsulta({
	nombre: "direccion.pendientes",
	descripcion:
		"Pendientes de Dirección: los indicadores del periodo de `direccion.primer_vistazo`, las autorizaciones por autorizar y las alertas cruzadas, con el conteo de cada grupo",
	entrada: z.object({
		grupo: z.enum(gruposDePendientes).optional().describe("Solo los pendientes de ese grupo"),
	}),
	salida: z.object({
		periodo: z.enum(["semana", "dia"]).describe("El de `direccion.primer_vistazo`"),
		cifras: z.array(cifra).describe("Ventas, Producción, Existencias y Cuentas por cobrar y pagar"),
		pendientes: z.array(pendiente).describe("Rojo primero, luego ámbar; dentro de cada color, por fecha"),
		conteos: z
			.object({ autorizaciones: z.number().int(), alertas: z.number().int() })
			.describe("Cuántos hay de cada grupo, sin filtrar"),
	}),
	permiso: { departamento: "direccion" },
});
