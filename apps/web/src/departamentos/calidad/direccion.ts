/**
 * La dirección de las pantallas de Calidad: la pestaña es la ruta; el filtro de Pendientes (`grupo`), el lote que se
 * revisa (`lote`), el reclamo escogido (`reclamo`), lo que se busca (`buscar`) y la ventana abierta (`cajon` e `id`)
 * van en sus parámetros. Así un enlace abre la pantalla tal como estaba, y otro departamento abre la revisión de una
 * devolución con `/calidad?cajon=devolucion&id={traspaso}`.
 * Fase 19 · .claude/rules/react.md (regla 5) y docs/interfaz/comunes.md («La página de un departamento», regla 2)
 */

import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

/** Los parámetros que usan las pantallas de Calidad. */
export type ParametroDeCalidad = "grupo" | "lote" | "reclamo" | "buscar" | "cajon" | "id";

/** Las rutas de las pestañas de Calidad. */
export const rutasDeCalidad = {
	pendientes: "/calidad",
	porRevisar: "/calidad/por-revisar",
	defectos: "/calidad/defectos",
	reclamos: "/calidad/reclamos",
} as const;

/**
 * Lee y cambia la dirección.
 * @returns `leer(parametro)`, e `ir(cambios, ruta?, reemplazar?)`, que cambia esos parámetros (vacío quita uno) y, si
 * se dice, cambia de pestaña sin llevarse los parámetros de la anterior; con `reemplazar`, no deja paso en el historial
 * (lo que se escribe en el buscador).
 */
export function useDireccion() {
	const router = useRouter();
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	const busqueda = useRouterState({ select: (estado) => estado.location.searchStr });
	const leer = useCallback(
		(parametro: ParametroDeCalidad): string | undefined => new URLSearchParams(busqueda).get(parametro) ?? undefined,
		[busqueda],
	);
	const ir = useCallback(
		(cambios: Partial<Record<ParametroDeCalidad, string | undefined>>, otraRuta?: string, reemplazar = false) => {
			const destino = otraRuta ?? ruta;
			const parametros = new URLSearchParams(destino === ruta ? busqueda : "");
			for (const [clave, valor] of Object.entries(cambios)) {
				if (valor === undefined || valor === "") parametros.delete(clave);
				else parametros.set(clave, valor);
			}
			const texto = parametros.toString();
			const a = texto === "" ? destino : `${destino}?${texto}`;
			if (reemplazar) router.history.replace(a);
			else router.history.push(a);
		},
		[router, ruta, busqueda],
	);
	return { leer, ir };
}
