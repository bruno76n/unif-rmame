/**
 * La dirección de las pantallas de Dirección: el filtro del panel de Pendientes (`?grupo=autorizaciones`), el de las
 * tarjetas de Autorizaciones (`?tipo=nota_credito`) y la comparación de Indicadores (`?comparar=hace_un_mes`), y cómo
 * llevar a la dirección de otro departamento. Así un enlace abre la pantalla tal como estaba, y «Ver» abre la pestaña
 * o el cajón de otro departamento sin importar su componente.
 * Fase 19 · docs/interfaz/fabrica/direccion.md y .claude/rules/react.md (regla 5)
 */

import { useRouter } from "@tanstack/react-router";
import { tiposDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { comparaciones } from "@uniformame/compartido/contratos/direccion/indicadores";
import { gruposDePendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { useCallback } from "react";
import { z } from "zod";

/** El filtro del panel de Pendientes en la dirección; sin él, «Todos». */
export const busquedaDePendientes = z.object({ grupo: z.enum(gruposDePendientes).optional() });

/** El filtro de las tarjetas de Autorizaciones en la dirección; sin él, «Todas». */
export const busquedaDeAutorizaciones = z.object({ tipo: z.enum(tiposDeAutorizacion).optional() });

/** La comparación de Indicadores en la dirección; sin ella, la semana pasada. */
export const busquedaDeIndicadores = z.object({ comparar: z.enum(comparaciones).optional() });

/**
 * Da cómo llevar a una ruta de la web, la de esta u otra pestaña.
 * @returns `ir(ruta)`, con la ruta sin la diagonal del principio (`direccion/indicadores`).
 */
export function useIrA() {
	const router = useRouter();
	return useCallback((ruta: string) => router.history.push(`/${ruta}`), [router]);
}
