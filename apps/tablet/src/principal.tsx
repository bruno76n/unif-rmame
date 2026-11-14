/**
 * La entrada de la tablet: registra su service worker y arranca su motor, que baja su foto, sube su cola y escucha sus
 * avisos. Las pantallas llegan en la parte 5 de la fase 20.
 * Fase 20 · docs/apps/tablet.md
 */

import { base } from "./copia/base.ts";
import { registrarServiceWorker } from "./service-worker/registrar.ts";
import { crearMotor } from "./sincronizacion/motor.ts";

/** El motor de la tablet: uno solo, que llama a la API en su mismo origen. */
export const motor = crearMotor(base, { urlBase: "" });

void registrarServiceWorker();
void motor.arrancar();
