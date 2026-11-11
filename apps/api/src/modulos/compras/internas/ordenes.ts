/**
 * Las internas de la orden de compra que llaman otros módulos: recalcular su estado al recibir, cerrarla al quedar
 * pagada, reabrirla si se cancela el pago, y los precios de la nota del proveedor.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md («Acciones internas») y proveedores-y-precios.md
 * («`compras.registrar_precios_nota`»)
 *
 * Las usan Aduana (fase 11) y Contaduría (fase 17); se construyen aquí y se prueban directo.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { registrarPrecio } from "../dominio/comunes.ts";
import {
	eventoDeOrden,
	faltanteDeLineas,
	leerOrden,
	lineasDeOrdenes,
	precioVigente,
	subirVersionDeOrden,
} from "../dominio/ordenes.ts";
import { ordenCompraLineas, ordenesCompra } from "../tablas.ts";

/** Lo que reciben las internas de una orden. */
const deUnaOrden = z.object({ orden_compra_id: z.uuid() }).strict();

/** Lo que recibe `compras.registrar_precios_nota`. */
const pedidoDeNota = z
	.object({
		orden_compra_id: z.uuid(),
		lineas: z.array(z.object({ orden_compra_linea_id: z.uuid(), precio_centavos: z.number().int().positive() })),
	})
	.strict();

/** Los estados en que la recepción ya no cambia nada. */
const sinRecalcular = new Set(["borrador", "cancelada", "cerrada", "cerrada_con_faltante"]);

/**
 * `compras.recalcular_estado_orden`: `recibida` si en cada línea lo recibido llega a lo pedido; si no,
 * `recibida_en_parte`. No toca una orden en borrador, cancelada, cerrada ni cerrada con faltante.
 * @param contexto El contexto de la recepción.
 * @param datos `orden_compra_id`.
 * @returns El estado en que quedó.
 */
export async function recalcularEstadoOrden(contexto: ContextoDeAccion, datos: unknown): Promise<{ estado: string }> {
	const { orden_compra_id } = deUnaOrden.parse(datos);
	const orden = await leerOrden(contexto, orden_compra_id);
	if (sinRecalcular.has(orden.estado)) return { estado: orden.estado };
	const faltante = await faltanteDeLineas(contexto, await lineasDeOrdenes(contexto.transaccion, [orden.id]));
	const estado = [...faltante.values()].every((falta) => falta === 0) ? "recibida" : "recibida_en_parte";
	if (estado !== orden.estado) {
		await contexto.transaccion.update(ordenesCompra).set({ estado }).where(eq(ordenesCompra.id, orden.id));
	}
	eventoDeOrden(contexto, "orden_compra.recibida", orden);
	return { estado };
}

/**
 * `compras.cerrar_orden_pagada`: una orden `recibida` cuyas facturas quedaron pagadas pasa a `cerrada`, sin quién:
 * la cerró el sistema. En otro estado no hace nada.
 * @param contexto El contexto del pago.
 * @param datos `orden_compra_id`.
 * @returns Si la cerró.
 */
export async function cerrarOrdenPagada(contexto: ContextoDeAccion, datos: unknown): Promise<{ cerrada: boolean }> {
	const { orden_compra_id } = deUnaOrden.parse(datos);
	const orden = await leerOrden(contexto, orden_compra_id);
	if (orden.estado !== "recibida") return { cerrada: false };
	await contexto.transaccion
		.update(ordenesCompra)
		.set({ estado: "cerrada", cerradaEn: contexto.ahora.toString(), cerradaPor: null })
		.where(eq(ordenesCompra.id, orden.id));
	eventoDeOrden(contexto, "orden_compra.cambiada", orden);
	return { cerrada: true };
}

/**
 * `compras.reabrir_orden_pagada`: solo la orden que cerró `cerrar_orden_pagada` (`cerrada` sin quién) vuelve a
 * `recibida`. En otro estado no hace nada; no rechaza: la cancelación del pago ya la decidió Contaduría.
 * @param contexto El contexto de la cancelación del pago.
 * @param datos `orden_compra_id`.
 * @returns Si la reabrió.
 */
export async function reabrirOrdenPagada(contexto: ContextoDeAccion, datos: unknown): Promise<{ reabierta: boolean }> {
	const { orden_compra_id } = deUnaOrden.parse(datos);
	const orden = await leerOrden(contexto, orden_compra_id);
	if (orden.estado !== "cerrada" || orden.cerradaPor !== null) return { reabierta: false };
	await contexto.transaccion
		.update(ordenesCompra)
		.set({ estado: "recibida", cerradaEn: null })
		.where(eq(ordenesCompra.id, orden.id));
	eventoDeOrden(contexto, "orden_compra.reabierta", orden);
	return { reabierta: true };
}

/**
 * `compras.registrar_precios_nota`: en cada línea con un precio distinto del vigente, el de la nota, su renglón
 * «según la nota» en el historial y el último precio del par. Una línea con el mismo precio no cambia.
 * @param contexto El contexto de la captura de la nota (Contaduría).
 * @param datos La orden y el precio de cada línea.
 * @returns Las líneas que cambiaron, con su precio anterior y el nuevo.
 * @throws `422 orden_no_enviada`: «{OC} no se ha enviado: no tiene nota que capturar.» (en borrador o cancelada).
 */
export async function registrarPreciosNota(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ lineas: { orden_compra_linea_id: string; antes: number; nuevo: number }[] }> {
	const pedido = pedidoDeNota.parse(datos);
	const orden = await leerOrden(contexto, pedido.orden_compra_id);
	if (orden.estado === "borrador" || orden.estado === "cancelada") {
		throw errorDeRegla("orden_no_enviada", `${orden.folio} no se ha enviado: no tiene nota que capturar.`);
	}
	const lineas = await lineasDeOrdenes(contexto.transaccion, [orden.id]);
	const cambiaron: { orden_compra_linea_id: string; antes: number; nuevo: number }[] = [];
	for (const renglon of pedido.lineas) {
		const linea = lineas.find((suya) => suya.id === renglon.orden_compra_linea_id);
		if (linea === undefined) throw new Error(`la línea ${renglon.orden_compra_linea_id} no es de ${orden.folio}`);
		const antes = precioVigente(linea);
		if (antes === renglon.precio_centavos) continue;
		await contexto.transaccion
			.update(ordenCompraLineas)
			.set({
				precioNotaCentavos: renglon.precio_centavos,
				precioNotaEn: contexto.ahora.toString(),
				precioNotaPor: quienCambia(contexto),
			})
			.where(eq(ordenCompraLineas.id, linea.id));
		await registrarPrecio(contexto, {
			materialId: linea.materialId,
			proveedorId: orden.proveedorId,
			precioCentavos: renglon.precio_centavos,
			origen: "nota",
			orden: { id: orden.id, lineaId: linea.id },
			anterior: antes,
		});
		cambiaron.push({ orden_compra_linea_id: linea.id, antes, nuevo: renglon.precio_centavos });
	}
	if (cambiaron.length > 0) {
		await subirVersionDeOrden(contexto.transaccion, orden.id);
		eventoDeOrden(contexto, "orden_compra.cambiada", orden);
	}
	return { lineas: cambiaron };
}
