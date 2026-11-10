/**
 * Cómo se pone a fallar un simulador: lo que comparten Google, Resend y R2.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Simuladores de los servicios de fuera»)
 */

import { delay, HttpResponse } from "msw";

/** Cómo falla el servicio: no contesta, contesta con un error suyo, lo frena por pedir de más o contesta tarde. */
export type ModoDeFalla = "ninguna" | "sin_respuesta" | "error_del_servidor" | "demasiadas_peticiones" | "lento";

/** Las respuestas de error con la forma de cada servicio. */
export interface ErroresDelServicio {
	servidor: () => Response;
	demasiadasPeticiones: () => Response;
}

/** Cuánto tarda en contestar un servicio lento, en milisegundos. */
export const demoraDelServicioLento = 3000;

/**
 * Aplica el modo de falla antes de contestar.
 * @param modo El modo puesto en el simulador.
 * @param errores Las respuestas de error con la forma de ese servicio.
 * @returns La respuesta de la falla, o `undefined` si el simulador debe contestar normal (después de
 * esperar, si es lento).
 */
export async function aplicarFalla(modo: ModoDeFalla, errores: ErroresDelServicio): Promise<Response | undefined> {
	if (modo === "sin_respuesta") return HttpResponse.error();
	if (modo === "error_del_servidor") return errores.servidor();
	if (modo === "demasiadas_peticiones") return errores.demasiadasPeticiones();
	if (modo === "lento") await delay(demoraDelServicioLento);
	return undefined;
}
