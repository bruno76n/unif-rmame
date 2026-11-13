/**
 * La dirección de las pantallas de Tienda en línea: el buscador de Pedidos y el cajón abierto van en la búsqueda
 * (`/linea/pedidos?cajon=pedido&id=…`), así un enlace abre la pantalla tal como estaba y otro departamento abre el
 * cajón del pedido en línea sin importar su componente.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

/** Las pestañas de Tienda en línea; su clave es su ruta. */
export const pestanasDeLinea = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "pedidos", texto: "Pedidos" },
	{ clave: "disponibilidad", texto: "Disponibilidad" },
] as const;

/** Una pestaña de Tienda en línea. */
export type PestanaDeLinea = (typeof pestanasDeLinea)[number]["clave"];

/** La búsqueda de todas las pantallas de Tienda en línea. */
export const busquedaDeLinea = z.object({
	/** Lo que se busca en Pedidos: folio o cliente. */
	buscar: z.string().optional().catch(undefined),
	cajon: z.enum(["pedido"]).optional().catch(undefined),
	/** El W- del cajón. */
	id: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Tienda en línea. */
export type BusquedaDeLinea = z.infer<typeof busquedaDeLinea>;

/**
 * Lee la búsqueda de la dirección y da cómo cambiarla: los cambios se juntan con lo que ya hay, y lo que se pone sin
 * valor se quita.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(id)` el cajón del pedido y `cerrar()`.
 */
export function useDireccionDeLinea() {
	const busqueda = busquedaDeLinea.parse(useSearch({ strict: false }));
	const navigate = useNavigate();
	const navegar = useCallback(
		(cambios: Partial<BusquedaDeLinea>, pestana?: PestanaDeLinea) => {
			const nueva = Object.fromEntries(
				Object.entries({ ...(pestana === undefined ? busqueda : {}), ...cambios }).filter(
					([, valor]) => valor !== undefined && valor !== "",
				),
			);
			void navigate({
				to: pestana === undefined ? "." : pestana === "pendientes" ? "/linea" : `/linea/${pestana}`,
				search: busquedaDeLinea.parse(nueva),
			});
		},
		[busqueda, navigate],
	);
	/** Abre el cajón de un pedido en línea, sin tocar la pestaña ni su buscador. */
	const abrir = useCallback((id: string) => navegar({ cajon: "pedido", id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
