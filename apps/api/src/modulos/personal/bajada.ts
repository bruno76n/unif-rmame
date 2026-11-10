/**
 * Lo que baja de `personal` a la tablet del taller: las personas con PIN y sus PIN.
 * Fase 7 · docs/modulos/personal/personas.md y docs/modulos/personal/pin-del-taller.md («Lo que baja a la tablet»)
 *
 * La persona baja con su nombre y sus iniciales (las calcula el servidor) mientras tenga un PIN vivo en la
 * ubicación de la tablet; al anularse, el PIN toca a la persona y la tablet la quita. Los PIN de esa ubicación
 * bajan en todos sus estados, para que el anulado deje de entrar. Nunca baja el pago, el puesto ni las cuentas.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `personal` que bajan. */
export const bajadaDePersonal: readonly TablaQueBaja[] = [
	{
		tabla: "personas",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre"],
		// La primera letra del nombre y la de su última palabra (si tiene más de una).
		calculadas: {
			iniciales: sql`upper(left(btrim(t.nombre), 1) || coalesce(left(substring(btrim(t.nombre) from '\\s(\\S+)$'), 1), ''))`,
		},
		filtro: (aparato) => sql`t.baja_en IS NULL AND t.area = 'taller' AND EXISTS (
			SELECT 1 FROM pines p
			WHERE p.persona_id = t.id AND p.ubicacion_id = ${aparato.ubicacionId}::uuid AND p.estado IN ('activo', 'bloqueado'))`,
	},
	{
		tabla: "pines",
		aparatos: ["tablet_taller"],
		orden: 2,
		columnas: ["persona_id", "pin_hash", "estado", "intentos_fallidos", "desbloqueado_en"],
		filtro: (aparato) => sql`t.ubicacion_id = ${aparato.ubicacionId}::uuid`,
	},
];
