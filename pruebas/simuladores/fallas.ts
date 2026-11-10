/**
 * Cómo se pone a fallar un simulador: lo que comparten Google, Resend y R2.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Simuladores de los servicios de fuera»)
 */

import { delay, HttpResponse } from "msw";

/** Cómo falla el servicio: no contesta, contesta con un error suyo o contesta tarde. */
export type ModoDeFalla = "ninguna" | "sin_respuesta" | "error_del_servidor" | "lento";

/** Cuánto tarda en contestar un servicio lento, en milisegundos. */
export const demoraDelServicioLento = 3000;

/**
 * Aplica el modo de falla antes de contestar.
 * @param modo El modo puesto en el simulador.
 * @param errorDelServicio La respuesta de error del servidor con la forma de ese servicio.
 * @returns La respuesta de la falla, o `undefined` si el simulador debe contestar normal (después de
 * esperar, si es lento).
 */
export async function aplicarFalla(modo: ModoDeFalla, errorDelServicio: () => Response): Promise<Response | undefined> {
	if (modo === "sin_respuesta") return HttpResponse.error();
	if (modo === "error_del_servidor") return errorDelServicio();
	if (modo === "lento") await delay(demoraDelServicioLento);
	return undefined;
}
