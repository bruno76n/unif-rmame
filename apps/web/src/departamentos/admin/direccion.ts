/**
 * La dirección de las pantallas de Administración del sistema: el filtro de Pendientes, el cajón Alta de usuario
 * (`?cajon=alta_usuario&id=…`), el renglón resaltado de Usuarios y accesos o de Dispositivos (`?resaltar=…`) y el
 * buscador, el tipo, las alertas y las fechas de la Bitácora. Así un enlace abre la pantalla tal como estaba, y
 * Dirección abre Dispositivos con `/admin/dispositivos`.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { filtrosDeBitacora } from "@uniformame/compartido/contratos/admin/consultas-bitacora";
import { gruposDePendientesDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-pendientes";
import { useCallback } from "react";
import { z } from "zod";
import { useBusquedaDeDepartamento } from "../../comun/direccion.ts";
import { rutaDePestana } from "../../comun/pagina-de-departamento.tsx";

/** Las pestañas de Administración del sistema; su clave es su ruta. */
export const pestanasDeAdmin = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "usuarios-y-accesos", texto: "Usuarios y accesos" },
	{ clave: "dispositivos", texto: "Dispositivos" },
	{ clave: "configuracion", texto: "Configuración" },
	{ clave: "bitacora", texto: "Bitácora" },
	{ clave: "respaldos", texto: "Respaldos" },
	{ clave: "pantalla-de-acceso", texto: "Pantalla de acceso" },
] as const;

/** Una pestaña de Administración del sistema. */
export type PestanaDeAdmin = (typeof pestanasDeAdmin)[number]["clave"];

/** La búsqueda de todas las pantallas de Administración del sistema. */
export const busquedaDeAdmin = z.object({
	grupo: z
		.enum(["todos", ...gruposDePendientesDeAdmin])
		.optional()
		.catch(undefined),
	cajon: z.enum(["alta_usuario"]).optional().catch(undefined),
	/** La autorización AU- del cajón Alta de usuario. */
	id: z.uuid().optional().catch(undefined),
	/** La cuenta o el aparato que entra resaltado. */
	resaltar: z.uuid().optional().catch(undefined),
	buscar: z.string().optional().catch(undefined),
	tipo: z.enum(filtrosDeBitacora).optional().catch(undefined),
	alertas: z.enum(["si"]).optional().catch(undefined),
	desde: z.iso.date().optional().catch(undefined),
	hasta: z.iso.date().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Administración del sistema. */
export type BusquedaDeAdmin = z.infer<typeof busquedaDeAdmin>;

/**
 * Lee la búsqueda de Administración del sistema de la dirección y da cómo cambiarla: los cambios se juntan con lo que
 * ya hay (en la misma pestaña), y lo que se pone sin valor se quita.
 * Lo común está en `useBusquedaDeDepartamento`; aquí van sus cajones.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrirAlta(id)` y `cerrar()`.
 */
export function useDireccionDeAdmin() {
	const { busqueda, navegar } = useBusquedaDeDepartamento(busquedaDeAdmin, (pestana: PestanaDeAdmin) =>
		rutaDePestana("admin", pestana),
	);
	/** Abre el cajón Alta de usuario de una autorización, sin tocar la pestaña. */
	const abrirAlta = useCallback((id: string) => navegar({ cajon: "alta_usuario", id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrirAlta, cerrar };
}
