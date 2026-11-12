/**
 * El avance de un pedido con lo que dicen sus notas, Inventario y Producción: lo entregado y lo que va en nota, lo
 * listo en Aduana, lo de Bodega y lo que está en producción, junto con sus renglones vigentes.
 * Fase 16 · docs/modulos/ventas/pedidos.md («El avance, la etapa y la alerta»)
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { cambiosPedido, ordenesProduccion } from "../../produccion/tablas.ts";
import { type AvanceDeTalla, alertaDelPedido, avanceDeTalla, etapaDelPedido } from "./avance.ts";
import { piezasEnNotas } from "./notas.ts";
import type { PedidoConCliente, Renglon } from "./pedidos.ts";

/** Lo que regresa `inventario.listo_en_aduana`. */
const listoEnAduana = z.object({
	variantes: z.array(
		z.object({ variante_id: z.uuid(), listas: z.number(), de_bodega: z.number(), en_camino: z.number() }),
	),
});

/** Lo que regresa `produccion.piezas_en_produccion`. */
const enProduccion = z.object({ variantes: z.array(z.object({ variante_id: z.uuid(), piezas: z.number() })) });

/**
 * El avance de cada talla de un pedido, por variante.
 * @param contexto El contexto de la acción o de la lectura.
 * @param pedidoId El pedido.
 * @param renglones Sus renglones vigentes.
 */
export async function avanceDeLasTallas(
	contexto: ContextoDeAccion,
	pedidoId: string,
	renglones: readonly Pick<Renglon, "varianteId" | "cantidad">[],
): Promise<AvanceDeTalla[]> {
	const listo = listoEnAduana.parse(await contexto.lectura("inventario.listo_en_aduana", { pedido_id: pedidoId }));
	const produccion = enProduccion.parse(
		await contexto.lectura("produccion.piezas_en_produccion", { pedido_id: pedidoId }),
	);
	const enNotas = await piezasEnNotas(contexto.transaccion, pedidoId);
	// Las tallas del pedido y también las que tienen algo en nota, listo o en producción aunque ya no estén en él.
	const ids = new Set([
		...renglones.map((renglon) => renglon.varianteId),
		...enNotas.keys(),
		...listo.variantes.map((suya) => suya.variante_id),
		...produccion.variantes.map((suya) => suya.variante_id),
	]);
	return [...ids].sort().map((varianteId) => {
		const deAduana = listo.variantes.find((suya) => suya.variante_id === varianteId);
		return avanceDeTalla({
			varianteId,
			pedido: renglones.find((renglon) => renglon.varianteId === varianteId)?.cantidad ?? 0,
			entregado: enNotas.get(varianteId)?.entregado ?? 0,
			enNota: enNotas.get(varianteId)?.enNota ?? 0,
			listo: deAduana?.listas ?? 0,
			deBodega: (deAduana?.de_bodega ?? 0) + (deAduana?.en_camino ?? 0),
			enProduccion: produccion.variantes.find((suya) => suya.variante_id === varianteId)?.piezas ?? 0,
		});
	});
}

/**
 * El avance de un pedido con su etapa y su alerta.
 * @param contexto El contexto de la acción o de la lectura.
 * @param pedido El pedido.
 * @param renglones Sus renglones vigentes.
 */
export async function avanceDelPedido(
	contexto: ContextoDeAccion,
	pedido: PedidoConCliente,
	renglones: readonly Pick<Renglon, "varianteId" | "cantidad">[],
) {
	const tallas = await avanceDeLasTallas(contexto, pedido.id, renglones);
	const [orden] = await contexto.transaccion
		.select({ id: ordenesProduccion.id })
		.from(ordenesProduccion)
		.where(eq(ordenesProduccion.pedidoId, pedido.id))
		.limit(1);
	const [cambio] = await contexto.transaccion
		.select({ id: cambiosPedido.id })
		.from(cambiosPedido)
		.where(and(eq(cambiosPedido.pedidoId, pedido.id), eq(cambiosPedido.estado, "por_aplicar")))
		.limit(1);
	const diasEnRiesgo = z
		.number()
		.int()
		.parse(await contexto.lectura("admin.parametro", { clave: "ventas.dias_en_riesgo" }));
	return {
		tallas,
		etapa: etapaDelPedido(tallas),
		alerta:
			pedido.estado === "confirmado"
				? alertaDelPedido(tallas, {
						fechaEntrega: pedido.fechaEntrega,
						hoy: contexto.diaDeNegocio,
						diasEnRiesgo,
						conOrden: orden !== undefined,
						cambioPorAplicar: cambio !== undefined,
					})
				: null,
	};
}
