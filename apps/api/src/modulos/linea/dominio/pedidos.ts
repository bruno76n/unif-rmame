/**
 * Lo común de los pedidos en línea: los estados en palabras, leer y bloquear un W-, el candado y la revisión del pago
 * repetido, los totales que no cuadran, la promesa y los eventos.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Reglas» y «Estados»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { type EstadoDePedidoLinea, pedidosLinea } from "../tablas.ts";

/** Un W- como está en la tabla. */
export type PedidoLinea = typeof pedidosLinea.$inferSelect;

/** Cada estado como se lee en un mensaje. */
export const estadoEnPalabras: Readonly<Record<EstadoDePedidoLinea, string>> = {
	esperando_pago: "esperando pago",
	por_surtir: "por surtir",
	esperando_prendas: "esperando prendas",
	listo_para_empacar: "listo para empacar",
	cancelado: "cancelado",
	vencido: "vencido",
};

/**
 * El estado de un W- en palabras.
 * @param estado Su estado, como está en la tabla.
 */
export function enPalabras(estado: string): string {
	return estadoEnPalabras[estado as EstadoDePedidoLinea] ?? estado;
}

/**
 * Lee y bloquea un W-.
 * @param transaccion La transacción.
 * @param id El W-.
 * @throws `404 no_existe`.
 */
export async function bloquearPedidoLinea(transaccion: Transaccion, id: string): Promise<PedidoLinea> {
	const [pedido] = await transaccion.select().from(pedidosLinea).where(eq(pedidosLinea.id, id)).for("update");
	if (pedido === undefined) throw noExiste();
	return pedido;
}

/**
 * El candado de un W- que llega: el mismo W- mandado dos veces a la vez se pone en fila.
 * @param transaccion La transacción.
 * @param id El W-.
 */
export async function candadoDelPedido(transaccion: Transaccion, id: string): Promise<void> {
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pedido_linea:${id}`}, 0))`);
}

/**
 * El candado de un pago de la pasarela: dos W- con la misma referencia se ponen en fila (regla 6).
 * @param transaccion La transacción.
 * @param pasarela La pasarela.
 * @param referencia Su referencia.
 */
export async function candadoDelPago(transaccion: Transaccion, pasarela: string, referencia: string): Promise<void> {
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pago_linea:${pasarela}:${referencia}`}, 0))`,
	);
}

/**
 * El folio del W- que ya tiene ese pago, si no es el que se dice.
 * @param transaccion La transacción, con el candado del pago.
 * @param pago La pasarela y la referencia.
 * @param salvo El W- que se está pagando, que puede tenerlo.
 */
export async function folioConElPago(
	transaccion: Transaccion,
	pago: { pasarela: string; referencia: string },
	salvo?: string,
): Promise<string | undefined> {
	const [otro] = await transaccion
		.select({ folio: pedidosLinea.folio })
		.from(pedidosLinea)
		.where(
			and(
				eq(pedidosLinea.pagoPasarela, pago.pasarela),
				eq(pedidosLinea.pagoReferencia, pago.referencia),
				salvo === undefined ? undefined : ne(pedidosLinea.id, salvo),
			),
		);
	return otro?.folio;
}

/** Un renglón como llega del sitio, para revisar sus totales. */
export interface RenglonConMontos {
	cantidad: number;
	precio_unitario_centavos: number;
	descuento_paquete_centavos?: number | undefined;
	descuento_centavos?: number | undefined;
}

/** Los totales de un W- como llegaron. */
export interface TotalesDelPedido {
	subtotal_centavos: number;
	descuento_centavos: number;
	descuento_envio_centavos: number;
	total_centavos: number;
	envio_costo_centavos: number;
}

/**
 * Lo que no cuadra en los totales de un W- (regla 3): el subtotal sale de sus renglones, el descuento es el de sus
 * renglones, y el total es subtotal − descuentos + envío − descuento del envío.
 * @param totales Los totales que mandó el sitio.
 * @param renglones Sus renglones.
 * @returns Una frase por total que no cuadra; vacía si todo cuadra.
 * Es una función pura: el W- se guarda como llegó y lo que no cuadra abre `totales_no_cuadran`.
 */
export function totalesQueNoCuadran(totales: TotalesDelPedido, renglones: readonly RenglonConMontos[]): string[] {
	const subtotal = renglones.reduce((suma, renglon) => suma + renglon.cantidad * renglon.precio_unitario_centavos, 0);
	const descuento = renglones.reduce(
		(suma, renglon) => suma + (renglon.descuento_paquete_centavos ?? 0) + (renglon.descuento_centavos ?? 0),
		0,
	);
	const total =
		totales.subtotal_centavos -
		totales.descuento_centavos +
		totales.envio_costo_centavos -
		totales.descuento_envio_centavos;
	const frases: string[] = [];
	if (totales.subtotal_centavos !== subtotal) {
		frases.push(`el subtotal dice ${enPesos(totales.subtotal_centavos)} y sus renglones suman ${enPesos(subtotal)}`);
	}
	if (totales.descuento_centavos !== descuento) {
		frases.push(
			`el descuento dice ${enPesos(totales.descuento_centavos)} y el de sus renglones suma ${enPesos(descuento)}`,
		);
	}
	if (totales.total_centavos !== total) {
		frases.push(`el total dice ${enPesos(totales.total_centavos)} y sus totales dan ${enPesos(total)}`);
	}
	return frases;
}

/**
 * La promesa de un W- por la de sus renglones: «Sale mañana» si alguno sale mañana; si no, «Sale hoy».
 * @param promesas La promesa de cada renglón apartado.
 */
export function promesaDePedido(
	promesas: readonly ("sale_hoy" | "sale_manana" | undefined)[],
): "sale_hoy" | "sale_manana" {
	return promesas.includes("sale_manana") ? "sale_manana" : "sale_hoy";
}

/** Los tipos de evento de un W-. */
export type EventoDePedidoLinea =
	| "pedido_linea.recibido"
	| "pedido_linea.pagado"
	| "pedido_linea.esperando_prendas"
	| "pedido_linea.listo_para_empacar"
	| "pedido_linea.cancelado"
	| "pedido_linea.vencido";

/**
 * Guarda el evento de un W-.
 * @param contexto El contexto de la acción.
 * @param tipo El evento.
 * @param pedido El W-.
 */
export function eventoDePedido(
	contexto: ContextoDeAccion,
	tipo: EventoDePedidoLinea,
	pedido: Pick<PedidoLinea, "id" | "folio">,
): void {
	contexto.guardarEvento({
		tipo,
		datos: { pedido_linea_id: pedido.id },
		tablas: ["pedidos_linea"],
		entidad: "pedidos_linea",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
	});
}
