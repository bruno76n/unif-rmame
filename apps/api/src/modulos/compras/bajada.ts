/**
 * Lo que baja de `compras` a la tablet del taller: los consumibles activos, con su nombre y sus unidades.
 * Fase 10 · docs/modulos/compras/materiales.md («Lo que baja a la tablet»)
 *
 * Al darse de baja, el consumible sale del filtro y baja como `quitar`. Nunca bajan su mínimo, su múltiplo, sus
 * días, su consumo, su proveedor ni su costo.
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `compras` que bajan. */
export const bajadaDeCompras: readonly TablaQueBaja[] = [
	{
		tabla: "materiales",
		aparatos: ["tablet_taller"],
		orden: 0,
		columnas: ["nombre", "unidad", "unidad_tablet", "factor_tablet"],
		filtro: () => sql`t.tipo = 'consumible' AND t.baja_en IS NULL`,
	},
];
