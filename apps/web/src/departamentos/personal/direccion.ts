/**
 * La dirección de las pantallas de Personal: el cajón abierto (`?cajon=persona&id=…`, o `?cajon=nueva` para el alta),
 * el filtro de Pendientes, la semana de la cuadrícula, el área y «Ver tarifas» de Personas, la persona recién guardada
 * que su renglón marca, y la operación que se busca en Tarifas van en la búsqueda. Así un enlace abre la pantalla tal
 * como estaba, y otro departamento abre la ficha de una persona sin importar su componente
 * (`/personal/personas?cajon=persona&id=…`).
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { gruposDePendientesDePersonal } from "@uniformame/compartido/contratos/personal/asistencia";
import { useCallback } from "react";
import { z } from "zod";

/** Los cajones de Personal que se abren por la dirección. */
export const cajonesDePersonal = ["persona", "nueva"] as const;

/** Un cajón de Personal. */
export type CajonDePersonal = (typeof cajonesDePersonal)[number];

/** Las pestañas de Personal, por su ruta: Pendientes es Asistencia. */
export type PestanaDePersonal = "pendientes" | "personas" | "pin" | "tarifas";

/** La búsqueda de todas las pantallas de Personal. */
export const busquedaDePersonal = z.object({
	cajon: z.enum(cajonesDePersonal).optional().catch(undefined),
	/** La persona del cajón. */
	id: z.uuid().optional().catch(undefined),
	/** El filtro de Pendientes. */
	grupo: z.enum(gruposDePendientesDePersonal).optional().catch(undefined),
	/** La semana de la cuadrícula; sin ella, la que corre. */
	semana: z.uuid().optional().catch(undefined),
	/** El área de Personas: un área, `tienda:{id}` o `baja`. */
	area: z.string().optional().catch(undefined),
	/** «Ver tarifas» en Personas. */
	ver: z.literal("si").optional().catch(undefined),
	/** La persona recién guardada, que su renglón marca. */
	resaltar: z.uuid().optional().catch(undefined),
	/** El flujo y la operación que se buscan en Tarifas («Poner tarifa»). */
	flujo: z.uuid().optional().catch(undefined),
	operacion: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Personal. */
export type BusquedaDePersonal = z.infer<typeof busquedaDePersonal>;

/**
 * La ruta de una pestaña de Personal.
 * @param pestana La pestaña.
 */
export function rutaDePersonal(pestana: PestanaDePersonal): string {
	return pestana === "pendientes" ? "/personal" : `/personal/${pestana}`;
}

/**
 * Lee la búsqueda de Personal y da cómo cambiarla: los cambios se juntan con lo que ya hay, y lo que se pone sin valor
 * se quita; con otra pestaña, la búsqueda empieza de cero.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(cajon, id?)` y `cerrar()`.
 */
export function useDireccionDePersonal() {
	const busqueda = busquedaDePersonal.parse(useSearch({ strict: false }));
	const navigate = useNavigate();
	const navegar = useCallback(
		(cambios: Partial<BusquedaDePersonal>, pestana?: PestanaDePersonal) => {
			const nueva = Object.fromEntries(
				Object.entries({ ...(pestana === undefined ? busqueda : {}), ...cambios }).filter(
					([, valor]) => valor !== undefined && valor !== "",
				),
			);
			void navigate({
				to: pestana === undefined ? "." : rutaDePersonal(pestana),
				search: busquedaDePersonal.parse(nueva),
			});
		},
		[busqueda, navigate],
	);
	/** Abre un cajón, sin tocar la pestaña ni lo demás. */
	const abrir = useCallback(
		(cajon: CajonDePersonal, id?: string) => navegar({ cajon, id, resaltar: undefined }),
		[navegar],
	);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
