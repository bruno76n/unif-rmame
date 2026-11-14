/**
 * La dirección de las pantallas de Patronaje: lo que se lee de ella (la pestaña es la ruta; el filtro, la búsqueda, la
 * sección, el cajón abierto con su id, la versión que se ve y la tarjeta marcada van en sus parámetros) y cómo se
 * cambia sin perder lo demás. Así un enlace abre la pantalla tal como estaba, y otro departamento abre la receta con
 * `/patronaje/recetas?cajon=receta&id={producto}`.
 * Fase 19 · .claude/rules/react.md (regla 5) y docs/interfaz/comunes.md («La página de un departamento», regla 2)
 */

import { useRouter } from "@tanstack/react-router";
import { useDireccionDeDepartamento } from "../../comun/direccion.ts";

/** Los parámetros que usan las pantallas de Patronaje. */
export type ParametroDePatronaje = "grupo" | "buscar" | "seccion" | "cajon" | "id" | "version" | "marcado";

/** Los cajones (y la página de la receta) que se abren con `?cajon=`. */
export type CajonDePatronaje = "receta" | "rendimiento" | "desarrollo";

/** Las rutas de las pestañas de Patronaje. */
export const rutasDePatronaje = {
	pendientes: "/patronaje",
	recetas: "/patronaje/recetas",
	rendimiento: "/patronaje/rendimiento",
	desarrollo: "/patronaje/desarrollo",
} as const;

/** Las direcciones de lo que Patronaje abre: la suya y la de otro departamento. */
export const direcciones = {
	/** La página de la receta de una prenda. */
	receta: (productoId: string) => `${rutasDePatronaje.recetas}?cajon=receta&id=${productoId}`,
	/** El cajón de un desarrollo. */
	desarrollo: (desarrolloId: string) => `${rutasDePatronaje.desarrollo}?cajon=desarrollo&id=${desarrolloId}`,
	/** El alta de un producto en Catálogo, a partir de un desarrollo en ficha técnica. */
	altaEnCatalogo: (desarrolloId: string) =>
		`/catalogo/productos?cajon=nuevo_producto&origen=desarrollo&desarrollo=${desarrolloId}`,
};

/**
 * Lee y cambia la dirección de Patronaje, con lo común de todos los departamentos.
 * @returns `leer(parametro)`, el cajón abierto con su id, `ir(cambios, ruta?)`, que cambia esos parámetros (vacío
 * quita uno) y, si se dice, cambia de pestaña sin llevarse los parámetros de la anterior, `cerrar()` e `irA(direccion)`.
 */
export function useDireccion() {
	const router = useRouter();
	const { leer, ir } = useDireccionDeDepartamento<ParametroDePatronaje>();
	/**
	 * El id del cajón abierto, si es ese.
	 * @param cajon El cajón.
	 */
	const abierto = (cajon: CajonDePatronaje): string | undefined => (leer("cajon") === cajon ? leer("id") : undefined);
	/** Cierra el cajón abierto, con la versión que se veía en él. */
	const cerrar = () => ir({ cajon: undefined, id: undefined, version: undefined });
	return { leer, ir, abierto, cerrar, irA: (direccion: string) => router.history.push(direccion) };
}
