/**
 * La siembra de `produccion`, parte de la siembra del sistema: la operación «Corte», que existe en toda base.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («La tabla `operaciones`»)
 *
 * Agrega lo que falte y nunca cambia lo que ya existe.
 */

import { v7 as uuidv7 } from "uuid";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { operaciones } from "./tablas.ts";

/** La siembra de la operación de corte. */
export const semillaDeCorte: Semilla = {
	tabla: operaciones,
	filas: [{ id: uuidv7(), nombre: "Corte", esCorte: true }],
};
