/**
 * La dirección de las pantallas de Bodega: el cajón abierto (`?cajon=variante&id=…`, `entrega`, `llegada`, `conteo`
 * —con la DF- en `id`, o sin ella para un conteo nuevo— y `carga`), el filtro de Pendientes, la búsqueda y los filtros
 * de Existencias, y la diferencia por aclarar o la excepción por resolver. Así un enlace abre la pantalla tal como
 * estaba, y otro departamento abre un cajón de Bodega sin importar su componente (`/bodega/existencias?cajon=variante&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { filtrosDeExistencias } from "@uniformame/compartido/contratos/inventario/bodega";
import { useCallback } from "react";
import { z } from "zod";

/** Los cajones de Bodega que se abren por la dirección. */
export const cajonesDeBodega = ["variante", "entrega", "llegada", "conteo", "carga"] as const;

/** Un cajón de Bodega. */
export type CajonDeBodega = (typeof cajonesDeBodega)[number];

/** Las pestañas de Bodega, por su ruta. */
export type PestanaDeBodega =
	| "pendientes"
	| "existencias"
	| "materiales"
	| "reabasto"
	| "diferencias"
	| "conteos"
	| "excepciones";

/** La búsqueda de todas las pantallas de Bodega. */
export const busquedaDeBodega = z.object({
	cajon: z.enum(cajonesDeBodega).optional().catch(undefined),
	/** La variante, el lote, el despacho o la diferencia del cajón. */
	id: z.uuid().optional().catch(undefined),
	/** El filtro de Pendientes. */
	grupo: z.string().optional().catch(undefined),
	/** La búsqueda de Existencias. */
	texto: z.string().max(60).optional().catch(undefined),
	seccion: z.uuid().optional().catch(undefined),
	escuela: z.string().optional().catch(undefined),
	filtro: z.enum(filtrosDeExistencias).optional().catch(undefined),
	/** La diferencia que se aclara en su ventana. */
	aclarar: z.uuid().optional().catch(undefined),
	/** La excepción que se resuelve en su ventana. */
	resolver: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Bodega. */
export type BusquedaDeBodega = z.infer<typeof busquedaDeBodega>;

/**
 * Lee la búsqueda de Bodega y da cómo cambiarla: los cambios se juntan con lo que ya hay y lo que se pone sin valor se
 * quita; con otra pestaña, la búsqueda empieza de cero.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(cajon, id?)` y `cerrar()`.
 */
export function useDireccionDeBodega() {
	const busqueda = busquedaDeBodega.parse(useSearch({ strict: false }));
	const navigate = useNavigate();
	const navegar = useCallback(
		(cambios: Partial<BusquedaDeBodega>, pestana?: PestanaDeBodega) => {
			const nueva = Object.fromEntries(
				Object.entries({ ...(pestana === undefined ? busqueda : {}), ...cambios }).filter(
					([, valor]) => valor !== undefined && valor !== "",
				),
			);
			void navigate({
				to: pestana === undefined ? "." : pestana === "pendientes" ? "/bodega" : `/bodega/${pestana}`,
				search: busquedaDeBodega.parse(nueva),
			});
		},
		[busqueda, navigate],
	);
	/** Abre un cajón, sin tocar la pestaña ni lo demás. */
	const abrir = useCallback((cajon: CajonDeBodega, id?: string) => navegar({ cajon, id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
