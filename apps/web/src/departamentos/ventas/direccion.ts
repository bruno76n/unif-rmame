/**
 * La dirección de las pantallas de Ventas a externos: los filtros de cada pestaña y el cajón abierto van en la búsqueda
 * (`?cajon=pedido&id=…`), así un enlace abre la pantalla tal como estaba y otro departamento abre un cajón de Ventas sin
 * importar su componente («Ver pedido» en Producción es `/ventas/pedidos?cajon=pedido&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { etapasDePedido } from "@uniformame/compartido/contratos/ventas/vistas";
import { useCallback } from "react";
import { z } from "zod";

/** Los cajones de Ventas que se abren por la dirección. */
export const cajonesDeVentas = ["pedido", "nuevo", "modificar", "mandar", "armar", "nota", "cliente"] as const;

/** Un cajón de Ventas. */
export type CajonDeVentas = (typeof cajonesDeVentas)[number];

/** La búsqueda de todas las pantallas de Ventas: los filtros de sus pestañas y el cajón abierto. */
export const busquedaDeVentas = z.object({
	grupo: z.enum(["todos", "pedidos", "entregas", "clientes"]).optional().catch(undefined),
	vista: z.enum(["cliente", "estado"]).optional().catch(undefined),
	buscar: z.string().optional().catch(undefined),
	etapa: z.enum(etapasDePedido).optional().catch(undefined),
	entregados: z.enum(["si"]).optional().catch(undefined),
	estado: z.enum(["por_despachar", "en_camino", "entregada"]).optional().catch(undefined),
	/** El pedido con que se filtran las notas de entrega. */
	del_pedido: z.uuid().optional().catch(undefined),
	/** El cliente cuyo grupo se resalta en Pedidos. */
	de_cliente: z.uuid().optional().catch(undefined),
	cajon: z.enum(cajonesDeVentas).optional().catch(undefined),
	/** El documento del cajón: el pedido, la nota o el cliente; en el pedido nuevo, su cliente. */
	id: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Ventas. */
export type BusquedaDeVentas = z.infer<typeof busquedaDeVentas>;

/**
 * Lee la búsqueda de Ventas de la dirección y da cómo cambiarla: los cambios se juntan con lo que ya hay, y lo que se
 * pone sin valor se quita.
 * @returns La búsqueda y `navegar(cambios)`.
 */
export function useDireccionDeVentas() {
	const busqueda = busquedaDeVentas.parse(useSearch({ strict: false }));
	const navigate = useNavigate();
	const navegar = useCallback(
		(cambios: Partial<BusquedaDeVentas>, pestana?: "pedidos" | "notas" | "clientes" | "pendientes") => {
			const nueva = Object.fromEntries(
				Object.entries({ ...(pestana === undefined ? busqueda : {}), ...cambios }).filter(
					([, valor]) => valor !== undefined && valor !== "",
				),
			);
			void navigate({
				to: pestana === undefined ? "." : pestana === "pendientes" ? "/ventas" : `/ventas/${pestana}`,
				search: busquedaDeVentas.parse(nueva),
			});
		},
		[busqueda, navigate],
	);
	/** Abre un cajón de Ventas, sin tocar la pestaña ni sus filtros. */
	const abrir = useCallback((cajon: CajonDeVentas, id?: string) => navegar({ cajon, id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
