/**
 * La dirección de Compras: lo que va en la búsqueda (`?…`) de cualquier pestaña. El cajón abierto con su id, lo escogido
 * para Levantar orden, el filtro de Pendientes, la búsqueda, el proveedor, el horizonte, los dados de baja y lo que se
 * resalta al volver de crear algo. Así un enlace abre la pantalla tal como estaba, y otro departamento abre un cajón de
 * Compras con un enlace (`/compras/ordenes?cajon=orden&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

/** Los cajones de Compras. */
export const cajonesDeCompras = ["levantar", "por_que", "orden", "material", "proveedor"] as const;

/** Lo que va en la búsqueda de la dirección. */
const busqueda = z.object({
	cajon: z.enum(cajonesDeCompras).optional(),
	id: z.string().optional(),
	materiales: z.string().optional(),
	cantidades: z.string().optional(),
	grupo: z.string().optional(),
	buscar: z.string().optional(),
	proveedor: z.string().optional(),
	horizonte: z.enum(["corto", "regreso_clases"]).optional(),
	bajas: z.enum(["si"]).optional(),
	abiertos: z.string().optional(),
	resaltar: z.string().optional(),
});

/** Lo que va en la búsqueda de una pantalla de Compras. */
export type BusquedaDeCompras = z.infer<typeof busqueda>;

/**
 * Lee la búsqueda tal como la dejó el enrutador: cada valor, como texto (un folio de puros números llega como número).
 * @param leida La búsqueda que regresa el enrutador.
 */
export function leerBusqueda(leida: Record<string, unknown>): BusquedaDeCompras {
	const enTexto = Object.fromEntries(
		Object.entries(leida).flatMap(([llave, valor]) =>
			valor === undefined || valor === null || valor === "" ? [] : [[llave, String(valor)]],
		),
	);
	const leido = busqueda.safeParse(enTexto);
	return leido.success ? leido.data : {};
}

/**
 * La dirección de Compras: lo que dice la búsqueda y cómo cambiarla.
 * @returns `busqueda`, `ir` (cambia la búsqueda, y la ruta si se da) y `cerrarCajon`.
 */
export function useDireccionDeCompras() {
	const router = useRouter();
	const ubicacion = useRouterState({ select: (estado) => estado.location });
	const actual = leerBusqueda(ubicacion.search);
	const ir = useCallback(
		(cambios: Partial<Record<keyof BusquedaDeCompras, string | undefined>>, ruta?: string) => {
			const siguiente = new URLSearchParams();
			const base = ruta === undefined ? leerBusqueda(router.state.location.search) : {};
			for (const [llave, valor] of Object.entries({ ...base, ...cambios })) {
				if (valor !== undefined && valor !== "") siguiente.set(llave, valor);
			}
			const texto = siguiente.toString();
			router.history.push(`${ruta ?? router.state.location.pathname}${texto === "" ? "" : `?${texto}`}`);
		},
		[router],
	);
	const cerrarCajon = useCallback(
		() => ir({ cajon: undefined, id: undefined, materiales: undefined, cantidades: undefined }),
		[ir],
	);
	return { busqueda: actual, ir, cerrarCajon };
}
