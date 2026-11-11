/**
 * Las internas de las órdenes y los lotes: las de Ventas (mandar un pedido a producción, pasarlo a temporada,
 * cambiar su entrega) y las que mueven la etapa del lote (revisado y en aduana).
 * Fase 12 · docs/modulos/produccion/ordenes-de-produccion.md («Acciones internas») y lotes.md («Acciones internas»)
 *
 * Ventas (fase 16), Calidad (fase 13) y Aduana (fase 14) las llaman en su transacción; aquí se prueban directo. Cada
 * cambio a un lote o a sus tallas sube su versión (regla 12). Saber si un lote ya tiene tela entregada y recalcular
 * los rollos sugeridos llegan con las entregas a corte, en la parte 3 (decisión 596).
 */

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { subirVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { variantes } from "../../catalogo/tablas.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import {
	avisoSinReceta,
	lotesDelPedido,
	nuevaOrden,
	nuevoLote,
	type PiezasDeTalla,
	prendaQueSeFabrica,
	tallasQueSeFabrican,
} from "../dominio/lotes.ts";
import { lotes, loteTallas, ordenesProduccion } from "../tablas.ts";

/** Lo que recibe `produccion.mandar_a_produccion`. */
const pedidoAProduccion = z.object({
	pedido_id: z.uuid(),
	pedido_version_id: z.uuid(),
	fecha_entrega: z.iso.date(),
	renglones: z.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive() })).min(1),
});

/** Un lote que tocó el pedido: nuevo o con piezas sumadas. */
interface LoteDelPedido {
	lote_id: string;
	folio: string;
	nuevo: boolean;
}

/**
 * Suma piezas a las tallas de un lote por cortar; la talla que no tenía nace.
 * @param contexto El contexto de la acción.
 * @param loteId El lote.
 * @param tallas Las piezas por talla.
 */
async function sumarPiezas(contexto: ContextoDeAccion, loteId: string, tallas: readonly PiezasDeTalla[]) {
	const quien = quienCambia(contexto);
	for (const { varianteId, piezas } of tallas) {
		await contexto.transaccion
			.insert(loteTallas)
			.values({ id: uuidv7(), loteId, varianteId, piezasPlaneadas: piezas, creadoPor: quien })
			.onConflictDoUpdate({
				target: [loteTallas.loteId, loteTallas.varianteId],
				set: { piezasPlaneadas: sql`${loteTallas.piezasPlaneadas} + ${piezas}` },
			});
	}
	await subirVersion(contexto.transaccion, lotes, loteId);
}

/**
 * `produccion.mandar_a_produccion`: por prenda, suma las piezas al lote por cortar de ese pedido y esa prenda; si no
 * hay, una sola orden `cliente_externo` para el pedido, con un lote por prenda (regla 2).
 * @param contexto El contexto de Ventas: `creado_por` es su cuenta.
 * @param datos El pedido, su versión, su entrega y sus renglones.
 * @returns La orden nueva (si nació), cada lote y el aviso de cada prenda sin receta.
 */
export async function mandarAProduccion(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoAProduccion.parse(datos);
	const { transaccion } = contexto;
	const deLosRenglones = await transaccion
		.select({ id: variantes.id, productoId: variantes.productoId })
		.from(variantes)
		.where(
			inArray(
				variantes.id,
				pedido.renglones.map((renglon) => renglon.variante_id),
			),
		);
	const porPrenda = new Map<string, PiezasDeTalla[]>();
	for (const renglon of pedido.renglones) {
		const productoId = deLosRenglones.find((variante) => variante.id === renglon.variante_id)?.productoId;
		if (productoId === undefined) throw new Error(`la talla ${renglon.variante_id} no existe`);
		porPrenda.set(productoId, [
			...(porPrenda.get(productoId) ?? []),
			{ varianteId: renglon.variante_id, piezas: renglon.piezas },
		]);
	}
	const porCortar = await lotesDelPedido(contexto, pedido.pedido_id, ["por_cortar"]);
	const lotesTocados: LoteDelPedido[] = [];
	const avisos: string[] = [];
	const nuevos: { prendaId: string; tallas: PiezasDeTalla[] }[] = [];
	for (const [productoId, pedidas] of [...porPrenda].sort(([uno], [otro]) => uno.localeCompare(otro))) {
		const prenda = await prendaQueSeFabrica(contexto, productoId);
		const tallas = await tallasQueSeFabrican(contexto, prenda, pedidas);
		if (!prenda.tieneReceta) avisos.push(`${prenda.nombre}: ${avisoSinReceta}`);
		const suyo = porCortar.find((lote) => lote.productoId === productoId);
		if (suyo === undefined) {
			nuevos.push({ prendaId: productoId, tallas });
			continue;
		}
		await sumarPiezas(contexto, suyo.id, tallas);
		contexto.guardarEvento({
			tipo: "lote.piezas_sumadas",
			datos: { lote_id: suyo.id },
			tablas: ["lotes", "lote_tallas"],
			entidad: "lotes",
			entidadId: suyo.id,
			entidadFolio: suyo.folio,
		});
		lotesTocados.push({ lote_id: suyo.id, folio: suyo.folio, nuevo: false });
	}
	let orden: { id: string; folio: string } | undefined;
	if (nuevos.length > 0) {
		orden = await nuevaOrden(contexto, {
			motivo: "cliente_externo",
			pedidoId: pedido.pedido_id,
			pedidoVersionId: pedido.pedido_version_id,
			fechaEntrega: pedido.fecha_entrega,
		});
		const dias = Number(await contexto.lectura("admin.parametro", { clave: "produccion.dias_corte_lote_nuevo" }));
		for (const { prendaId, tallas } of nuevos) {
			const lote = await nuevoLote(contexto, {
				ordenProduccionId: orden.id,
				productoId: prendaId,
				destino: "pedido",
				pedidoId: pedido.pedido_id,
				fechaCorte: contexto.diaDeNegocio.add({ days: dias }).toString(),
				fechaEntrega: pedido.fecha_entrega,
				tallas,
			});
			lotesTocados.push({ lote_id: lote.id, folio: lote.folio, nuevo: true });
		}
	}
	return {
		...(orden === undefined ? {} : { orden_produccion_id: orden.id, folio: orden.folio }),
		lotes: lotesTocados,
		avisos,
	};
}

/** Lo que recibe `produccion.pasar_pedido_a_temporada`. */
const pedidoCancelado = z.object({ pedido_id: z.uuid() });

/** Las etapas de un lote que ya no cambian con su pedido: llegó a aduana o se canceló. */
const yaNoCambian = ["en_aduana", "cancelado"] as const;

/**
 * `produccion.pasar_pedido_a_temporada`: los lotes del pedido que no han llegado a aduana ni están cancelados pasan a
 * temporada, con Bodega como destino. Conservan su pedido, y su orden, su motivo (regla 6).
 * @returns Cuántos lotes pasaron.
 */
export async function pasarPedidoATemporada(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = pedidoCancelado.parse(datos);
	const { transaccion } = contexto;
	const [bodega] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.tipo, "bodega"));
	if (bodega === undefined) throw new Error("falta Bodega en la siembra");
	const suyos = await lotesDelPedido(contexto, pedido_id, ["por_cortar", "en_proceso", "terminado", "revisado"]);
	for (const lote of suyos) {
		if (lote.destino === "temporada") continue;
		await transaccion
			.update(lotes)
			.set({ destino: "temporada", ubicacionDestinoId: bodega.id, pasoATemporadaEn: contexto.ahora.toString() })
			.where(eq(lotes.id, lote.id));
		contexto.guardarEvento({
			tipo: "lote.paso_a_temporada",
			datos: { lote_id: lote.id },
			tablas: ["lotes"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
	}
	return { lotes: suyos.filter((lote) => lote.destino !== "temporada").length };
}

/** Lo que recibe `produccion.cambiar_fecha_entrega_pedido`. */
const nuevaEntrega = z.object({ pedido_id: z.uuid(), fecha_entrega: z.iso.date() });

/**
 * `produccion.cambiar_fecha_entrega_pedido`: la fecha en las órdenes del pedido y en sus lotes que no están en aduana
 * ni cancelados. La fecha de corte no cambia (regla 7).
 * @returns Cuántos lotes cambiaron.
 */
export async function cambiarFechaEntregaPedido(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id, fecha_entrega } = nuevaEntrega.parse(datos);
	const { transaccion } = contexto;
	await transaccion
		.update(ordenesProduccion)
		.set({ fechaEntrega: fecha_entrega })
		.where(eq(ordenesProduccion.pedidoId, pedido_id));
	const cambiados = await transaccion
		.update(lotes)
		.set({ fechaEntrega: fecha_entrega })
		.where(
			and(
				eq(lotes.pedidoId, pedido_id),
				notInArray(lotes.estado, [...yaNoCambian]),
				sql`${lotes.fechaEntrega} <> ${fecha_entrega}`,
			),
		)
		.returning({ id: lotes.id, folio: lotes.folio });
	for (const lote of cambiados) {
		contexto.guardarEvento({
			tipo: "lote.fecha_cambiada",
			datos: { lote_id: lote.id },
			tablas: ["lotes", "ordenes_produccion"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
	}
	return { lotes: cambiados.length };
}

/** Lo que reciben las internas que mueven la etapa del lote. */
const cambioDeEtapa = z.object({
	lote_id: z.uuid(),
	revision_id: z.uuid().optional(),
	recepcion_id: z.uuid().optional(),
});

/**
 * Pasa un lote de una etapa a la siguiente, con su momento, y guarda su evento.
 * @throws Error si no está en la etapa de la que sale: quien llama ya lo revisó.
 */
async function pasarDeEtapa(
	contexto: ContextoDeAccion,
	loteId: string,
	cambio: { de: "terminado" | "revisado"; a: "revisado" | "en_aduana"; evento: "lote.revisado" | "lote.en_aduana" },
) {
	const momento = contexto.ahora.toString();
	const [lote] = await contexto.transaccion
		.update(lotes)
		.set(
			cambio.a === "revisado"
				? { estado: "revisado", revisadoEn: momento }
				: { estado: "en_aduana", enAduanaEn: momento },
		)
		.where(and(eq(lotes.id, loteId), eq(lotes.estado, cambio.de)))
		.returning({ id: lotes.id, folio: lotes.folio });
	if (lote === undefined) throw new Error(`el lote ${loteId} no está ${cambio.de}`);
	// Sus tallas dejan de bajar a la tablet por algo que vive en el lote: se tocan, para que bajen como `quitar`.
	if (cambio.a === "revisado") {
		await contexto.transaccion
			.update(loteTallas)
			.set({ actualizadoEn: sql`now()` })
			.where(eq(loteTallas.loteId, lote.id));
	}
	contexto.guardarEvento({
		tipo: cambio.evento,
		datos: { lote_id: lote.id },
		tablas: ["lotes"],
		entidad: "lotes",
		entidadId: lote.id,
		entidadFolio: lote.folio,
	});
	return { folio: lote.folio };
}

/** `produccion.marcar_lote_revisado`: Calidad cerró su revisión; `terminado` → `revisado`. */
export async function marcarLoteRevisado(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id } = cambioDeEtapa.parse(datos);
	return pasarDeEtapa(contexto, lote_id, { de: "terminado", a: "revisado", evento: "lote.revisado" });
}

/** `produccion.marcar_lote_en_aduana`: Aduana lo recibió; `revisado` → `en_aduana`. */
export async function marcarLoteEnAduana(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id } = cambioDeEtapa.parse(datos);
	return pasarDeEtapa(contexto, lote_id, { de: "revisado", a: "en_aduana", evento: "lote.en_aduana" });
}
