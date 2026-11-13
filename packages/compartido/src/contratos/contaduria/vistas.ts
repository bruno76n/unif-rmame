/**
 * Las piezas que comparten las consultas de las pantallas de Contaduría: un estado ya armado, una fecha con su texto,
 * una cuenta de la fábrica y un valor de una lista para escoger.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md y docs/interfaz/TEXTOS.md («Los estados»)
 *
 * La consulta arma los textos y escoge el color con las reglas del módulo: la pantalla solo los pinta. Los montos
 * viajan siempre en su campo `*_centavos`, opcional, para que el servidor los pueda recortar; la pantalla los escribe.
 */

import { z } from "zod";
import { estadoArmado, fechaConTexto } from "../ventas/vistas.ts";

export { estadoArmado, fechaConTexto };

/** Un monto que el servidor puede recortar. */
export const monto = z.number().int().optional();

/** Una opción para escoger: su id y su nombre. */
export const opcion = z.object({
	id: z.uuid(),
	nombre: z.string().describe("Cómo se lee en la lista"),
});

/** Las cuentas de la fábrica (la lista «Cuentas de la fábrica»): con una sola, la pone el servidor. */
export const cuentasFabrica = z.array(opcion).describe("Las cuentas de la fábrica, en su orden");

/** Una página de una lista larga. */
export const pagina = {
	cursor: z.string().nullable().describe("El cursor para pedir la página siguiente; nulo si no hay más"),
	hay_mas: z.boolean().describe("Si hay más renglones después de esta página"),
};

/** El cursor de una lista larga, opaco. */
export const cursor = z
	.string()
	.regex(/^\d+$/, "El cursor no es válido")
	.optional()
	.describe("El cursor que regresó la página anterior");
