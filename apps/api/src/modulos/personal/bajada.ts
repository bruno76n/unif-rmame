/**
 * Lo que baja de `personal` a la tablet del taller: las personas con PIN y sus PIN y, si la dueña lo decide, las tarifas.
 * Fase 7 · docs/modulos/personal/personas.md y docs/modulos/personal/pin-del-taller.md («Lo que baja a la tablet»);
 * fase 12 · docs/modulos/personal/tarifas.md («Lo que baja a la tablet»)
 *
 * La persona baja con su nombre y sus iniciales (las calcula el servidor) mientras tenga un PIN vivo en la
 * ubicación de la tablet; al anularse, el PIN toca a la persona y la tablet la quita. Los PIN de esa ubicación
 * bajan en todos sus estados, para que el anulado deje de entrar. Nunca baja el pago, el puesto ni las cuentas.
 * Las tarifas vigentes de los flujos que bajan, solo mientras `produccion.tarifa_visible_tablet` diga que se muestran:
 * al cambiar el parámetro, la tablet pide su foto.
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
	{
		tabla: "tarifas_operacion",
		aparatos: ["tablet_taller"],
		// Después de las operaciones de los flujos (`produccion`, orden 2), a las que apunta.
		orden: 3,
		columnas: ["flujo_operacion_id", "tarifa_centavos", "vigente_desde"],
		filtro: () => sql`t.vigente_hasta IS NULL
			AND coalesce((SELECT p.valor_booleano FROM parametros p
				WHERE p.clave = 'produccion.tarifa_visible_tablet' AND p.ubicacion_id IS NULL), false)
			AND EXISTS (SELECT 1 FROM flujo_operaciones f JOIN flujos fl ON fl.id = f.flujo_id
				WHERE f.id = t.flujo_operacion_id AND f.baja_en IS NULL AND fl.baja_en IS NULL)`,
		parametros: ["produccion.tarifa_visible_tablet"],
	},
];
