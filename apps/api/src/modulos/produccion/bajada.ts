/**
 * Lo que baja de `produccion` a la tablet del taller: las operaciones, los flujos y sus operaciones vigentes, y los
 * lotes en proceso y terminados con sus tallas.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md y lotes.md («Lo que baja a la tablet»)
 *
 * Con ellos la tablet arma «Sus operaciones» y «Bultos para ti». Lo que sale del filtro (una operación dada de baja,
 * un lote que pasa a revisado) baja como `quitar`. Nunca baja una tarifa, un costo ni el pedido: «para quién» lo
 * arma el servidor; el nombre del cliente de un pedido llega con Ventas (decisión 598).
 */

import { sql } from "drizzle-orm";
import type { TablaQueBaja } from "../../nucleo/modulos.ts";

/** Las tablas de `produccion` que bajan. */
export const bajadaDeProduccion: readonly TablaQueBaja[] = [
	{
		tabla: "operaciones",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre", "es_corte"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "flujos",
		aparatos: ["tablet_taller"],
		orden: 1,
		columnas: ["nombre"],
		filtro: () => sql`t.baja_en IS NULL`,
	},
	{
		tabla: "flujo_operaciones",
		aparatos: ["tablet_taller"],
		orden: 2,
		columnas: ["flujo_id", "operacion_id", "orden", "persona_base_id"],
		filtro: () => sql`t.baja_en IS NULL`,
	},

	{
		tabla: "lotes",
		aparatos: ["tablet_taller"],
		orden: 3,
		columnas: ["folio", "producto_id", "flujo_id", "fecha_entrega", "estado"],
		calculadas: {
			para_quien: sql`CASE t.destino
				WHEN 'temporada' THEN 'Temporada · bodega'
				WHEN 'tienda' THEN (SELECT u.nombre FROM ubicaciones u WHERE u.id = t.ubicacion_destino_id)
				ELSE 'Pedido' END`,
		},
		filtro: () => sql`t.estado IN ('en_proceso', 'terminado')`,
	},
	{
		tabla: "lote_tallas",
		aparatos: ["tablet_taller"],
		orden: 4,
		columnas: ["lote_id", "variante_id", "piezas_cortadas", "piezas_terminadas", "piezas_merma"],
		filtro: () =>
			sql`EXISTS (SELECT 1 FROM lotes l WHERE l.id = t.lote_id AND l.estado IN ('en_proceso', 'terminado'))`,
	},
	{
		tabla: "bultos",
		aparatos: ["tablet_taller"],
		orden: 4,
		columnas: ["folio", "lote_id", "variante_id", "numero", "piezas"],
		filtro: () =>
			sql`EXISTS (SELECT 1 FROM lotes l WHERE l.id = t.lote_id AND l.estado IN ('en_proceso', 'terminado'))`,
	},
];
