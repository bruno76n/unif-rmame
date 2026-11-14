/**
 * La dirección de las pantallas de Mantenimiento: el cajón abierto (`?cajon=falla&id=…` o `?cajon=maquina&id=…`), el año
 * de Servicios, el costo de la hora que se escribe en Costo por máquina y el servicio recién registrado van en la
 * búsqueda. Así un enlace abre la pantalla tal como estaba, y otro departamento abre una falla o una máquina sin
 * importar su componente (`/mantenimiento/fallas?cajon=falla&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useCallback } from "react";
import { z } from "zod";
import { useBusquedaDeDepartamento } from "../../comun/direccion.ts";
import { rutaDePestana } from "../../comun/pagina-de-departamento.tsx";

/** Los cajones de Mantenimiento que se abren por la dirección. */
export const cajonesDeMantenimiento = ["falla", "maquina"] as const;

/** Un cajón de Mantenimiento. */
export type CajonDeMantenimiento = (typeof cajonesDeMantenimiento)[number];

/** Las pestañas de Mantenimiento, por su ruta. */
export type PestanaDeMantenimiento = "pendientes" | "maquinas" | "fallas" | "servicios" | "costo";

/** La búsqueda de todas las pantallas de Mantenimiento. */
export const busquedaDeMantenimiento = z.object({
	cajon: z.enum(cajonesDeMantenimiento).optional().catch(undefined),
	/** La falla o la máquina del cajón. */
	id: z.uuid().optional().catch(undefined),
	/** El año de Servicios. */
	anio: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
	/** Lo que cuesta una hora de paro, en pesos enteros, solo en Costo por máquina. */
	hora: z.coerce.number().int().min(0).max(999_999).optional().catch(undefined),
	/** El servicio o la falla recién registrada, que su renglón marca un momento. */
	resaltar: z.string().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Mantenimiento. */
export type BusquedaDeMantenimiento = z.infer<typeof busquedaDeMantenimiento>;

/**
 * Lee la búsqueda de Mantenimiento y da cómo cambiarla: los cambios se juntan con lo que ya hay, y lo que se pone sin
 * valor se quita; con otra pestaña, la búsqueda empieza de cero.
 * Lo común está en `useBusquedaDeDepartamento`; aquí van sus cajones.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(cajon, id)` y `cerrar()`.
 */
export function useDireccionDeMantenimiento() {
	const { busqueda, navegar } = useBusquedaDeDepartamento(busquedaDeMantenimiento, (pestana: PestanaDeMantenimiento) =>
		rutaDePestana("mantenimiento", pestana),
	);
	/** Abre un cajón, sin tocar la pestaña ni lo demás. */
	const abrir = useCallback((cajon: CajonDeMantenimiento, id: string) => navegar({ cajon, id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
