/**
 * Los colores con que se pinta un estado ya escrito: la consulta lo manda con su color y la pantalla solo lo muestra.
 * Fase 19 · docs/interfaz/TEXTOS.md («El color de cada estado») y docs/interfaz/DISENO.md
 *
 * Es la única lista: la usan los contratos de las pantallas y el sistema de diseño (`estados/colores.ts`).
 */

import { z } from "zod";

/** Los colores de estado: cuadro sólido con texto blanco. */
export const coloresDeEstado = [
	"rojo",
	"ambar",
	"azul",
	"verde",
	"gris",
	"morado",
	"verde-azulado",
	"naranja",
] as const;

/** El color de un estado, en un contrato. */
export const colorDeEstado = z.enum(coloresDeEstado).describe("El color del cuadro del estado");
