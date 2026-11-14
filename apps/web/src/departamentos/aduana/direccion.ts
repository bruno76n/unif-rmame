/**
 * La dirección de las pantallas de Aduana: el cajón abierto (`?cajon=taller&id=<lote>`, `material` con la orden,
 * `camino` con el traspaso, `reproceso` con el reproceso y `despachar` con el traspaso en aduana), si Recepción muestra
 * todas las órdenes y el despacho recién hecho, que En tránsito resalta. Así un enlace abre la pantalla tal como
 * estaba, y otro departamento abre un cajón de Aduana sin importar su componente (`/aduana/despacho?cajon=despachar&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useCallback } from "react";
import { z } from "zod";
import { useBusquedaDeDepartamento } from "../../comun/direccion.ts";
import { rutaDePestana } from "../../comun/pagina-de-departamento.tsx";

/** Los cajones de Aduana que se abren por la dirección. */
export const cajonesDeAduana = ["taller", "material", "camino", "reproceso", "despachar"] as const;

/** Un cajón de Aduana. */
export type CajonDeAduana = (typeof cajonesDeAduana)[number];

/** Las pestañas de Aduana, por su ruta: el Andén es la primera. */
export type PestanaDeAduana =
	| "pendientes"
	| "recepcion"
	| "en-camino"
	| "despacho"
	| "inventario"
	| "transito"
	| "empaque"
	| "historial";

/** La búsqueda de todas las pantallas de Aduana. */
export const busquedaDeAduana = z.object({
	cajon: z.enum(cajonesDeAduana).optional().catch(undefined),
	/** El lote, la orden, el traspaso o el reproceso del cajón. */
	id: z.uuid().optional().catch(undefined),
	/** Recepción: también las órdenes que no entran en la ventana de días. */
	todas: z.literal("si").optional().catch(undefined),
	/** En tránsito: el despacho recién hecho. */
	resaltar: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Aduana. */
export type BusquedaDeAduana = z.infer<typeof busquedaDeAduana>;

/**
 * La ruta de una pestaña de Aduana.
 * @param pestana La pestaña.
 */
export function rutaDeAduana(pestana: PestanaDeAduana): string {
	return rutaDePestana("aduana", pestana);
}

/**
 * Lee la búsqueda de Aduana y da cómo cambiarla: los cambios se juntan con lo que ya hay y lo que se pone sin valor se
 * quita; con otra pestaña, la búsqueda empieza de cero.
 * Lo común está en `useBusquedaDeDepartamento`; aquí van sus cajones.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(cajon, id)` y `cerrar()`.
 */
export function useDireccionDeAduana() {
	const { busqueda, navegar } = useBusquedaDeDepartamento(busquedaDeAduana, rutaDeAduana);
	/** Abre un cajón, sin tocar la pestaña ni lo demás. */
	const abrir = useCallback((cajon: CajonDeAduana, id: string) => navegar({ cajon, id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
