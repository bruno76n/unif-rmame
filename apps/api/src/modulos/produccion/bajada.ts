/**
 * Lo que baja de `produccion` a la tablet del taller: las operaciones, los flujos y sus operaciones vigentes.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («Lo que baja a la tablet»)
 *
 * Con ellos la tablet arma «Sus operaciones» de quien todavía no registra nada. Lo que se da de baja sale del filtro
 * y baja como `quitar`. Nunca baja una tarifa con el flujo.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `produccion` que bajan. */
export const bajadaDeProduccion: readonly TablaQueBaja[] = [
	{
		tabla: "operaciones",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre", "es_corte"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "flujos",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "flujo_operaciones",
		aparatos: ["tablet_taller"],
		orden: 2,
		columnas: ["flujo_id", "operacion_id", "orden", "persona_base_id"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
];
