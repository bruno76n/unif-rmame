/**
 * La dirección de las pantallas de Producción: lo que se lee de ella (la pestaña es la ruta; los filtros, el lote
 * escogido del corte y el cajón abierto van en sus parámetros) y cómo se cambia sin perder lo demás. Así un enlace
 * abre la pantalla tal como estaba, y otro departamento abre el cajón del lote con `/produccion/lotes?cajon=lote&id={id}`.
 * Fase 19 · .claude/rules/react.md (regla 5) y docs/interfaz/comunes.md («La página de un departamento», regla 2)
 */

import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

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
 * Lee y cambia la dirección.
 * @returns `leer(parametro)`, y `ir(cambios, ruta?)`, que cambia esos parámetros (vacío quita uno) y, si se dice,
 * cambia de pestaña sin llevarse los parámetros de la anterior.
 */
export function useDireccion() {
	const router = useRouter();
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	const busqueda = useRouterState({ select: (estado) => estado.location.searchStr });
	const leer = useCallback(
		(parametro: ParametroDeProduccion): string | undefined => new URLSearchParams(busqueda).get(parametro) ?? undefined,
		[busqueda],
	);
	const ir = useCallback(
		(cambios: Partial<Record<ParametroDeProduccion, string | undefined>>, otraRuta?: string) => {
			const destino = otraRuta ?? ruta;
			const parametros = new URLSearchParams(destino === ruta ? busqueda : "");
			for (const [clave, valor] of Object.entries(cambios)) {
				if (valor === undefined || valor === "") parametros.delete(clave);
				else parametros.set(clave, valor);
			}
			const texto = parametros.toString();
			router.history.push(texto === "" ? destino : `${destino}?${texto}`);
		},
		[router, ruta, busqueda],
	);
	return { leer, ir };
}
