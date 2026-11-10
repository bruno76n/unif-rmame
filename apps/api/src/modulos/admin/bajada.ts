/**
 * Lo que baja de `admin` a cada tipo de aparato: sus parámetros y su propio renglón.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Lo que puede cada aparato») y docs/modulos/admin/configuracion.md
 *
 * Un parámetro baja a los tipos de su `baja_a`, el general y el de la ubicación del aparato. Del aparato baja
 * solo su renglón, sin su llave. La caja se suma con el POS.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `admin` que bajan. */
export const bajadaDeAdmin: readonly TablaQueBaja[] = [
	{
		tabla: "parametros",
		aparatos: ["tablet_taller"],
		orden: 0,
		columnas: [
			"clave",
			"ubicacion_id",
			"tipo_valor",
			"valor_entero",
			"valor_porcentaje",
			"valor_texto",
			"valor_booleano",
		],
		filtro: (aparato) =>
			sql`${aparato.tipo} = ANY(t.baja_a) AND (t.ubicacion_id IS NULL OR t.ubicacion_id = ${aparato.ubicacionId}::uuid)`,
	},
	{
		tabla: "dispositivos",
		aparatos: ["tablet_taller"],
		orden: 0,
		columnas: ["folio", "nombre", "tipo", "ubicacion_id", "prefijo_folio", "llave_rotada_en"],
		filtro: (aparato) => sql`t.id = ${aparato.dispositivoId}::uuid`,
	},
];
