/**
 * Lo que comparten las consultas de las notas de entrega: leer las notas con su pedido, su cliente y sus prendas.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega», «Nota de entrega»)
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";

/** Una nota de entrega con su pedido y su cliente. */
const notaLeida = z.object({
	id: z.uuid(),
	folio: z.string(),
	estado: z.enum(["por_despachar", "en_camino", "entregada", "cancelada"]),
	version: z.coerce.number(),
	numero_en_pedido: z.coerce.number(),
	de: z.coerce.number(),
	pedido_id: z.uuid(),
	pedido_folio: z.string(),
	pedido_estado: z.string(),
	forma_pago: z.string(),
	dias_credito: z.coerce.number(),
	cliente_id: z.uuid(),
	cliente: z.string(),
	color: z.string().nullable(),
	subtotal_centavos: z.coerce.number(),
	anticipo_aplicado_centavos: z.coerce.number(),
	armada: z.string(),
	salio: z.string().nullable(),
	entregada: z.string().nullable(),
	recibio: z.string().nullable(),
	armo: z.string().nullable(),
	despacho: z.string().nullable(),
});

/** Una nota de entrega con su pedido y su cliente. */
export type NotaLeida = z.infer<typeof notaLeida>;

/**
 * Las notas de entrega con su pedido y su cliente: las que no se cancelaron, o una sola.
 * @param base La base.
 * @param notaId Una nota; sin ella, todas las que no se cancelaron, la más nueva primero.
 */
export async function leerNotas(base: Base, notaId?: string): Promise<NotaLeida[]> {
	const { rows } = await base.execute(sql`SELECT n.id, n.folio, n.estado, n.version, n.numero_en_pedido,
			(SELECT max(o.numero_en_pedido) FROM notas_entrega o WHERE o.pedido_id = n.pedido_id) AS de,
			p.id AS pedido_id, p.folio AS pedido_folio, p.estado AS pedido_estado, p.forma_pago, p.dias_credito,
			c.id AS cliente_id, t.nombre AS cliente, e.color, n.subtotal_centavos, n.anticipo_aplicado_centavos,
			(n.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS armada,
			(n.despachado_en AT TIME ZONE 'America/Mexico_City')::date::text AS salio,
			n.fecha_entrega::text AS entregada, n.recibio_nombre AS recibio,
			coalesce(pe.nombre, u.nombre, u.correo) AS armo, d.folio AS despacho
		FROM notas_entrega n JOIN pedidos p ON p.id = n.pedido_id JOIN clientes c ON c.id = n.cliente_id
		JOIN terceros t ON t.id = c.tercero_id LEFT JOIN escuelas e ON e.id = c.escuela_id
		LEFT JOIN usuarios u ON u.id = n.creado_por LEFT JOIN personas pe ON pe.id = u.persona_id
		LEFT JOIN despachos d ON d.id = n.despacho_id
		WHERE ${notaId === undefined ? sql`n.estado <> 'cancelada'` : sql`n.id = ${notaId}`}
		ORDER BY n.creado_en DESC, n.folio DESC`);
	return z.array(notaLeida).parse(rows);
}

/** Un renglón de una nota con su prenda y su talla. */
const lineaLeida = z.object({
	id: z.uuid(),
	nota_id: z.uuid(),
	variante_id: z.uuid(),
	cantidad: z.coerce.number(),
	precio_unitario_centavos: z.coerce.number(),
	producto_id: z.uuid(),
	prenda: z.string(),
	escuela: z.string().nullable(),
	talla: z.string(),
	grupo: z.string(),
});

/** Un renglón de una nota con su prenda y su talla. */
export type LineaLeida = z.infer<typeof lineaLeida>;

/**
 * Los renglones de unas notas, por prenda y en el orden de sus tallas.
 * @param base La base.
 * @param notaIds Las notas.
 */
export async function leerLineas(base: Base, notaIds: readonly string[]): Promise<LineaLeida[]> {
	if (notaIds.length === 0) return [];
	const { rows } = await base.execute(sql`SELECT l.id, l.nota_entrega_id AS nota_id, l.variante_id, l.cantidad,
			l.precio_unitario_centavos, v.producto_id, p.nombre AS prenda, e.nombre AS escuela, t.nombre AS talla,
			g.nombre AS grupo
		FROM nota_entrega_lineas l JOIN variantes v ON v.id = l.variante_id JOIN productos p ON p.id = v.producto_id
		JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id LEFT JOIN escuelas e ON e.id = p.escuela_id
		WHERE l.nota_entrega_id IN (${sql.join(
			notaIds.map((id) => sql`${id}::uuid`),
			sql`, `,
		)}) ORDER BY p.nombre, ${ordenDeTallas("t")}`);
	return z.array(lineaLeida).parse(rows);
}
