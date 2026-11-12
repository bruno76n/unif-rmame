/**
 * Lo que baja de `mantenimiento` a la tablet del taller: las máquinas activas, sus fallas abiertas y los motivos de
 * falla vigentes.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («Lo que baja a la tablet»)
 *
 * Con ellos la tablet arma «Falla de máquina» y dice «Ya está reportada» sin internet. Lo que sale del filtro (una
 * máquina dada de baja, una falla resuelta) baja como `quitar`. Nunca bajan costos, técnicos ni horas de paro.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `mantenimiento` que bajan. */
export const bajadaDeMantenimiento: readonly TablaQueBaja[] = [
	{
		tabla: "motivos_falla",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre", "detiene_maquina", "orden"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "maquinas",
		aparatos: ["tablet_taller"],
		// Después de las personas (`personal`, orden 1), a las que apunta.
		orden: 2,
		columnas: ["folio", "nombre", "persona_id"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "fallas",
		aparatos: ["tablet_taller"],
		orden: 3,
		columnas: ["maquina_id", "motivo_falla_id", "estado", "hecho_en", "mandada_a_reparacion_en"],
		filtro: () => sql`t.estado <> 'resuelta'`,
	},
];
