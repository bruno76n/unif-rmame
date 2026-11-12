/**
 * El menú de la web se arma solo: cada departamento pone su `menu.ts` en su carpeta y aquí se juntan con
 * `import.meta.glob`. Nadie edita una lista central.
 * Fase 19 · docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro»)
 */

import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";

/** Lo que pone cada departamento en el menú, además de lo que da `admin.armazon`. */
export interface EntradaDelMenu {
	icono: LucideIcon;
}

/** Los `menu.ts` de cada carpeta de `departamentos/`. */
const menus = import.meta.glob<{ menu: EntradaDelMenu }>("../departamentos/*/menu.ts", { eager: true });

/**
 * El ícono de un departamento en el menú.
 * @param clave La clave del departamento (su carpeta).
 */
export function iconoDe(clave: string): LucideIcon {
	return menus[`../departamentos/${clave}/menu.ts`]?.menu.icono ?? Circle;
}
