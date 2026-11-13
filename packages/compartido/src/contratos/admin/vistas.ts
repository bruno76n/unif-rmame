/**
 * Las piezas que comparten las consultas de las pantallas de Administración del sistema: un estado ya armado, una
 * línea con su tono y una cifra de Pendientes.
 * Fase 19 · docs/interfaz/fabrica/administracion.md y docs/interfaz/TEXTOS.md («Los estados»)
 *
 * La consulta arma los textos y escoge el color: la pantalla solo los pinta.
 */

import { z } from "zod";
import { colorDeEstado } from "../estados.ts";

/** Un estado ya armado: su texto, en una de las formas de la guía, y su color. */
export const estadoDeAdmin = z.object({
	texto: z.string().describe("El estado: «Por confirmar», «Sin sincronizar»"),
	color: colorDeEstado,
});

/** El tono de una línea corta: normal, ámbar o rojo. */
export const tonoDeLinea = z.enum(["normal", "ambar", "rojo"]).describe("El color de la línea");

/** Una parte de la línea de contexto de una cifra. */
export const lineaConTono = z.object({
	texto: z.string(),
	tono: tonoDeLinea,
});

/** Una cifra de la barra de Pendientes: el número con su unidad, su tono y su línea de contexto. */
export const cifraDeAdmin = z.object({
	numero: z.number().int().nullable().describe("La cifra; nula si todavía no hay dato («—»)"),
	unidad: z.string().describe("La palabra que acompaña al número, ya en singular o plural: «usuarios»"),
	tono: z.enum(["ambar", "rojo"]).nullable().describe("El color del número, si algo pide atención"),
	contexto: z.array(lineaConTono).describe("La línea de contexto, lo rojo y lo ámbar primero"),
});

/** Una cuenta como la ve una pantalla: sus iniciales, su nombre y su correo. */
export const cuentaParaVer = z.object({
	usuario_id: z.uuid(),
	iniciales: z.string(),
	nombre: z.string().describe("El de su persona; en soporte, el de la cuenta"),
	correo: z.string(),
});
