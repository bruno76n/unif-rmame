/**
 * Lo que baja de `catalogo` a la tablet del taller: las tallas, los productos y sus variantes, solo con su nombre.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md, productos.md y variantes-codigos-y-etiquetas.md
 * («Lo que baja a la tablet»)
 *
 * Bajan todos, también los dados de baja y los descontinuados: la tablet dice «{prenda} · talla {t}» en cada
 * bulto, y un lote que entra o sale de la tablet no obliga a tocar el catálogo. Nunca un precio, un recargo ni
 * un código de barras.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `catalogo` que bajan. */
export const bajadaDeCatalogo: readonly TablaQueBaja[] = [
	{ tabla: "tallas", aparatos: ["tablet_taller"], orden: 0, columnas: ["nombre", "orden"], filtro: () => sql`true` },
	{ tabla: "productos", aparatos: ["tablet_taller"], orden: 1, columnas: ["nombre"], filtro: () => sql`true` },
	{
		tabla: "variantes",
		aparatos: ["tablet_taller"],
		orden: 2,
		columnas: ["producto_id", "talla_id"],
		filtro: () => sql`true`,
	},
];
