/**
 * Lo que comparten las consultas de Tienda en línea: leer los W- con sus renglones, dónde está cada prenda (de sus
 * reservas activas, sus traspasos y sus excepciones abiertas), las etapas con su color y cómo se escriben las fechas.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md y docs/interfaz/TEXTOS.md («Las etapas de pedidos, notas y
 * lotes»: pedido en línea)
 *
 * Lee las tablas de Inventario (reservas, traspasos, ubicaciones y excepciones) solo para leer: dónde está una prenda
 * lo dicen sus reservas, que viajan con la pieza (ver docs/modulos/inventario/reservas.md, regla 2).
 */

import { textoDeMomentoCorto, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import type { coloresDeEstado } from "@uniformame/compartido/contratos/estados";
import { estadosDeW } from "@uniformame/compartido/contratos/linea/consultas";
import { type SQL, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";

/** Un estado de un W-. */
export type EstadoDeW = (typeof estadosDeW)[number];

/** Un color de estado. */
export type Color = (typeof coloresDeEstado)[number];

/** Cada etapa de un W- con su texto y su color, como dice la guía de textos. */
export const etapas: Readonly<Record<EstadoDeW, { texto: string; color: Color }>> = {
	esperando_pago: { texto: "Esperando pago", color: "gris" },
	por_surtir: { texto: "Por surtir", color: "azul" },
	esperando_prendas: { texto: "Esperando prendas", color: "ambar" },
	listo_para_empacar: { texto: "Listo para empacar", color: "verde-azulado" },
	cancelado: { texto: "Cancelado", color: "rojo" },
	vencido: { texto: "Vencido", color: "gris" },
};

/** La promesa de un W- pagado, con su color. */
export const promesas: Readonly<Record<string, { texto: string; color: Color }>> = {
	sale_hoy: { texto: "Sale hoy", color: "verde" },
	sale_manana: { texto: "Sale mañana", color: "ambar" },
};

/** Los W- abiertos que la fábrica todavía mueve: ya pagados y sin empacar. */
export const pagadosAbiertos = ["por_surtir", "esperando_prendas", "listo_para_empacar"] as const;

/** Un momento de la base como texto ISO en UTC, que se lee con Temporal. */
const iso = (columna: string) => sql.raw(`to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

/** Un W- como lo leen las consultas. */
const pedidoLeido = z.object({
	id: z.uuid(),
	folio: z.string(),
	cliente_nombre: z.string(),
	cliente_correo: z.string(),
	cliente_telefono: z.string().nullable(),
	envio_destinatario: z.string(),
	envio_telefono: z.string().nullable(),
	envio_calle: z.string(),
	envio_numero_exterior: z.string(),
	envio_numero_interior: z.string().nullable(),
	envio_colonia: z.string(),
	envio_municipio: z.string(),
	envio_entidad_federativa: z.string(),
	envio_codigo_postal: z.string(),
	envio_referencias: z.string().nullable(),
	envio_metodo: z.string(),
	envio_paqueteria: z.string(),
	envio_costo_centavos: z.coerce.number(),
	cupon_codigo: z.string().nullable(),
	subtotal_centavos: z.coerce.number(),
	descuento_centavos: z.coerce.number(),
	descuento_envio_centavos: z.coerce.number(),
	total_centavos: z.coerce.number(),
	estado: z.enum(estadosDeW),
	estado_en: z.string(),
	promesa: z.string().nullable(),
	pago_estado: z.string(),
	pago_pasarela: z.string(),
	pago_referencia: z.string(),
	pago_metodo: z.string(),
	pago_comision_centavos: z.coerce.number().nullable(),
	pagado_en: z.string().nullable(),
	pago_vence_en: z.string().nullable(),
	cancelado_en: z.string().nullable(),
	cancelado_por: z.string().nullable(),
	motivo_cancelacion: z.string().nullable(),
	version: z.coerce.number(),
});

/** Un W- leído. */
export type PedidoLeido = z.infer<typeof pedidoLeido>;

/**
 * Lee los W- que cumplen el filtro, con quién canceló cada uno.
 * @param base La base.
 * @param donde El filtro, sobre `p` (`pedidos_linea`).
 * @param orden El orden y el tope, si los lleva.
 */
export async function leerPedidos(base: Base, donde: SQL, orden: SQL = sql``): Promise<PedidoLeido[]> {
	const { rows } = await base.execute(sql`SELECT p.id, p.folio, p.cliente_nombre, p.cliente_correo, p.cliente_telefono,
			p.envio_destinatario, p.envio_telefono, p.envio_calle, p.envio_numero_exterior, p.envio_numero_interior,
			p.envio_colonia, p.envio_municipio, p.envio_entidad_federativa, p.envio_codigo_postal, p.envio_referencias,
			p.envio_metodo, p.envio_paqueteria, p.envio_costo_centavos, p.cupon_codigo, p.subtotal_centavos,
			p.descuento_centavos, p.descuento_envio_centavos, p.total_centavos, p.estado, ${iso("p.estado_en")} AS estado_en,
			p.promesa, p.pago_estado, p.pago_pasarela, p.pago_referencia, p.pago_metodo, p.pago_comision_centavos,
			${iso("p.pagado_en")} AS pagado_en, ${iso("p.pago_vence_en")} AS pago_vence_en,
			${iso("p.cancelado_en")} AS cancelado_en,
			(SELECT coalesce(pe.nombre, u.nombre, u.correo) FROM usuarios u LEFT JOIN personas pe ON pe.id = u.persona_id
				WHERE u.id = p.cancelado_por) AS cancelado_por,
			p.motivo_cancelacion, p.version
		FROM pedidos_linea p WHERE ${donde} ${orden}`);
	return z.array(pedidoLeido).parse(rows);
}

/** Un renglón de un W-, con dónde está cada parte. */
const renglonLeido = z.object({
	id: z.uuid(),
	pedido_linea_id: z.uuid(),
	renglon: z.coerce.number(),
	variante_id: z.uuid(),
	producto_nombre: z.string(),
	talla: z.string(),
	cantidad: z.coerce.number(),
	precio_unitario_centavos: z.coerce.number(),
	paquete_numero: z.coerce.number().nullable(),
	descuento_paquete_centavos: z.coerce.number(),
	importe_centavos: z.coerce.number(),
	partes: z.array(
		z.object({
			piezas: z.coerce.number(),
			tipo: z.string(),
			ubicacion: z.string(),
			traspaso: z.string().nullable(),
			sin_pieza: z.boolean(),
		}),
	),
});

/** Un renglón leído. */
export type RenglonLeido = z.infer<typeof renglonLeido>;

/**
 * Lee los renglones de unos W- con sus reservas activas: dónde está cada parte, con el A- que la lleva y si su variante
 * tiene abierta la excepción de un W- sin pieza.
 * @param base La base.
 * @param pedidoIds Los W-.
 */
export async function leerRenglones(base: Base, pedidoIds: readonly string[]): Promise<RenglonLeido[]> {
	if (pedidoIds.length === 0) return [];
	const ids = sql.join(
		pedidoIds.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	const { rows } = await base.execute(sql`SELECT r.id, r.pedido_linea_id, r.renglon, r.variante_id, r.producto_nombre,
			r.talla, r.cantidad, r.precio_unitario_centavos, r.paquete_numero, r.descuento_paquete_centavos,
			r.importe_centavos,
			coalesce((SELECT json_agg(json_build_object('piezas', re.piezas, 'tipo', u.tipo, 'ubicacion', u.nombre,
					'traspaso', t.folio,
					'sin_pieza', u.tipo = 'bodega' AND EXISTS (SELECT 1 FROM excepciones x
						WHERE x.estado = 'por_revisar' AND x.documento_id = r.pedido_linea_id AND x.variante_id = r.variante_id
							AND x.tipo IN ('pedido_linea_sin_pieza', 'pago_despues_de_vencer')))
					ORDER BY u.orden)
				FROM reservas re JOIN ubicaciones u ON u.id = re.ubicacion_id LEFT JOIN traspasos t ON t.id = re.traspaso_id
				WHERE re.estado = 'activa' AND re.pedido_linea_renglon_id = r.id), '[]') AS partes
		FROM pedido_linea_renglones r WHERE r.pedido_linea_id IN (${ids}) ORDER BY r.pedido_linea_id, r.renglon`);
	return z.array(renglonLeido).parse(rows);
}

/** Una parte de una prenda: sus piezas en un lugar. */
type Parte = RenglonLeido["partes"][number];

/**
 * Dónde está una parte de una prenda, con su punto: verde en aduana, ámbar si falta, rojo sin pieza.
 * @param parte La parte.
 * @param conFolio Si lleva el A- que la trae (el cajón y el tablero); Pendientes no lo lleva.
 */
export function dondeEsta(parte: Parte, conFolio = true): { texto: string; color: Color } {
	if (parte.tipo === "aduana") return { texto: "En aduana", color: "verde" };
	if (parte.tipo === "en_camino_aduana") {
		return {
			texto: conFolio && parte.traspaso !== null ? `En camino a aduana · ${parte.traspaso}` : "En camino a aduana",
			color: "ambar",
		};
	}
	if (parte.sin_pieza) return { texto: "Sin pieza: Bodega la busca", color: "rojo" };
	if (parte.tipo === "bodega") return { texto: "Bodega la surte", color: "ambar" };
	return { texto: `${parte.ubicacion} la surte`, color: "ambar" };
}

/**
 * Si todas las piezas de un renglón ya están en aduana.
 * @param renglon El renglón.
 */
export function enAduana(renglon: RenglonLeido): boolean {
	return renglon.partes.length > 0 && renglon.partes.every((parte) => parte.tipo === "aduana");
}

/**
 * Lo que falta de un renglón: sus partes que no están en aduana.
 * @param renglon El renglón.
 */
export function loQueFalta(renglon: RenglonLeido): Parte[] {
	return renglon.partes.filter((parte) => parte.tipo !== "aduana");
}

/**
 * Un momento en hora de México.
 * @param momento El momento, en ISO.
 */
function enMexico(momento: string): Temporal.ZonedDateTime {
	return Temporal.Instant.from(momento).toZonedDateTimeISO(zonaDelNegocio);
}

/**
 * El día de negocio de un momento.
 * @param momento El momento, en ISO.
 */
export function diaDe(momento: string): Temporal.PlainDate {
	return enMexico(momento).toPlainDate();
}

/**
 * Un momento con su hora: «11 oct 16:30», en hora de México.
 * @param momento El momento, en ISO.
 */
export function diaYHora(momento: string): string {
	const enHora = enMexico(momento);
	const hora = `${String(enHora.hour).padStart(2, "0")}:${String(enHora.minute).padStart(2, "0")}`;
	return `${textoDeMomentoCorto(momento)} ${hora}`;
}

/**
 * La fecha que importa de un W- abierto: «Pagado 11 oct» o, si espera su pago, «Vence 12 oct 18:30».
 * @param pedido El W-.
 */
export function fechaDelPedido(pedido: PedidoLeido): string {
	if (pedido.pagado_en !== null) return `Pagado ${textoDeMomentoCorto(pedido.pagado_en)}`;
	return pedido.pago_vence_en === null ? "Sin pago" : `Vence ${diaYHora(pedido.pago_vence_en)}`;
}

/**
 * Cuántos días lleva pagado un W-, en días de negocio.
 * @param pedido El W-.
 * @param hoy El día de negocio de hoy.
 */
export function diasDePagado(pedido: PedidoLeido, hoy: Temporal.PlainDate): number {
	return pedido.pagado_en === null ? 0 : diaDe(pedido.pagado_en).until(hoy).days;
}
