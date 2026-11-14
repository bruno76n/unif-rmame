/**
 * La dirección de las pantallas de Producción: lo que se lee de ella (la pestaña es la ruta; los filtros, el lote
 * escogido del corte y el cajón abierto van en sus parámetros) y cómo se cambia sin perder lo demás. Así un enlace
 * abre la pantalla tal como estaba, y otro departamento abre el cajón del lote con `/produccion/lotes?cajon=lote&id={id}`.
 * Fase 19 · .claude/rules/react.md (regla 5) y docs/interfaz/comunes.md («La página de un departamento», regla 2)
 */

import { useDireccionDeDepartamento } from "../../comun/direccion.ts";

/** Los parámetros que usan las pantallas de Producción. */
export type ParametroDeProduccion = "grupo" | "filtro" | "cajon" | "id" | "cortar" | "marcado" | "pedido";

/** Las rutas de las pestañas de Producción. */
export const rutasDeProduccion = {
	pendientes: "/produccion",
	lotes: "/produccion/lotes",
	ordenes: "/produccion/ordenes",
	corte: "/produccion/corte",
	operaciones: "/produccion/operaciones",
	porPersona: "/produccion/por-persona",
} as const;

/**
 * Lee y cambia la dirección de Producción, con lo común de todos los departamentos.
 * @returns `leer(parametro)`, e `ir(cambios, ruta?, reemplazar?)`, que cambia esos parámetros (vacío quita uno) y, si
 * se dice, cambia de pestaña sin llevarse los parámetros de la anterior; con `reemplazar`, no deja paso en el historial.
 */
export function useDireccion() {
	return useDireccionDeDepartamento<ParametroDeProduccion>();
}
