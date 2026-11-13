/**
 * «Para quién» es un lote: el cliente de su pedido con el color de su escuela, la tienda de un reabasto o la temporada,
 * con su línea («PE-0145 · para el 14 oct»). Lo leen las consultas de Producción, Calidad y Mantenimiento, que pintan
 * lotes; las columnas y las uniones van juntas en un `SELECT` sobre un lote `l`.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»: la tarjeta)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { paraQuien } from "@uniformame/compartido/contratos/produccion/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";

/** Para quién es un lote, como sale de la base. */
export const deParaQuien = {
	destino: z.enum(["pedido", "tienda", "temporada"]),
	pedido_id: z.uuid().nullable(),
	pedido_folio: z.string().nullable(),
	cliente: z.string().nullable(),
	color: z.string().nullable(),
	tienda: z.string().nullable(),
	fecha_entrega: z.string(),
};

/**
 * Las columnas de «para quién» de un lote `l`, para un `SELECT`; van con `uniones` en su `FROM`.
 */
export const columnasDeParaQuien = sql`l.destino, l.pedido_id, pe.folio AS pedido_folio, ter.nombre AS cliente,
	esc.color, ub.nombre AS tienda, l.fecha_entrega::text AS fecha_entrega`;

/** Las uniones de «para quién» de un lote `l`. */
export const unionesDeParaQuien = sql`LEFT JOIN pedidos pe ON pe.id = l.pedido_id
	LEFT JOIN clientes cli ON cli.id = pe.cliente_id
	LEFT JOIN terceros ter ON ter.id = cli.tercero_id
	LEFT JOIN escuelas esc ON esc.id = cli.escuela_id
	LEFT JOIN ubicaciones ub ON ub.id = l.ubicacion_destino_id`;

/**
 * Escribe para quién es un lote: el cliente con su color, la tienda o la temporada, con su línea.
 * @param fila Lo leído con `columnasDeParaQuien`.
 */
export function escribirParaQuien(fila: {
	destino: "pedido" | "tienda" | "temporada";
	pedido_id: string | null;
	pedido_folio: string | null;
	cliente: string | null;
	color: string | null;
	tienda: string | null;
	fecha_entrega: string;
}): z.infer<typeof paraQuien> {
	const para = `para el ${textoDeDiaCorto(fila.fecha_entrega)}`;
	if (fila.destino === "pedido") {
		return {
			tipo: "pedido",
			nombre: fila.cliente ?? "",
			color: fila.color,
			linea: `${fila.pedido_folio ?? ""} · ${para}`,
			pedido_id: fila.pedido_id,
		};
	}
	if (fila.destino === "tienda") {
		return { tipo: "tienda", nombre: fila.tienda ?? "", color: null, linea: `Reabasto · ${para}`, pedido_id: null };
	}
	return {
		tipo: "temporada",
		nombre: "Temporada · bodega",
		color: null,
		linea: `Para el ${textoDeDiaCorto(fila.fecha_entrega)}`,
		pedido_id: null,
	};
}
