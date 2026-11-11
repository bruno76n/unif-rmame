/**
 * Lo que baja de `catalogo` a la tablet del taller: por ahora, las tallas con su nombre.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md («Lo que baja a la tablet»)
 *
 * Bajan todas, también las dadas de baja, solo con su nombre y su orden: la tablet dice «{prenda} · talla {t}»
 * en cada bulto. Los productos y sus variantes llegan en la parte 3 de la fase.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `catalogo` que bajan. */
export const bajadaDeCatalogo: readonly TablaQueBaja[] = [
	{ tabla: "tallas", aparatos: ["tablet_taller"], orden: 0, columnas: ["nombre", "orden"], filtro: () => sql`true` },
];
