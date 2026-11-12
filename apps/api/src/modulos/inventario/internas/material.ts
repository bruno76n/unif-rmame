/**
 * Las internas del material de Inventario: el efecto de lo recibido de más, el costo del metro de los rollos de una
 * línea y los consumibles que toma el taller.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (regla 5, «`inventario.aplicar_decision_recepcion_de_mas`»)
 * y material-en-bodega.md (reglas 3 y 6, «Acciones internas»)
 * Fase 17 · la revisión de las facturas de la orden al rechazar lo de más (`contaduria.revisar_facturas_de_orden`)
 */

import { aMilesimosConSigno, deMilesimos, menor } from "@uniformame/compartido/calculos/cuenta-material";
import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { candadoDeLoRecibido, facturasRevisadas, ubicacionDeTipo } from "../dominio/recepciones.ts";
import { crearTraspaso } from "../dominio/traspasos.ts";
import { recepciones, recepcionLineas, rollos } from "../tablas.ts";

/** Lo que manda `direccion.decidir_autorizacion` al efecto de lo recibido de más. */
const decisionDeMas = z
	.object({
		autorizacion_id: z.uuid(),
		decision: z.enum(["autorizar", "rechazar"]),
		recepcion_id: z.uuid(),
		orden_compra_linea_id: z.uuid(),
		cantidad: z.string(),
	})
	.passthrough();

/**
 * Lo que de una orden y un material sigue en aduana y nadie ha apartado para regresar: lo que su A- tiene en aduana
 * (lo recibido en aduana menos lo repartido) menos las devoluciones que ya esperan en aduana.
 * @returns En milésimos.
 */
async function enAduanaSinApartar(
	contexto: ContextoDeAccion,
	ordenCompraId: string,
	materialId: string,
	aduanaId: string,
): Promise<bigint> {
	const { rows } = await contexto.transaccion.execute<{ queda: string }>(sql`
		SELECT (coalesce((
			SELECT sum(tl.cantidad_recibida_aduana - tl.cantidad_repartida) FROM traspaso_lineas tl
			JOIN traspasos t ON t.id = tl.traspaso_id
			WHERE t.tipo = 'material_proveedor' AND t.estado = 'en_aduana' AND t.orden_compra_id = ${ordenCompraId}
				AND tl.material_id = ${materialId}
		), 0) - coalesce((
			SELECT sum(tl.cantidad_enviada) FROM traspaso_lineas tl JOIN traspasos t ON t.id = tl.traspaso_id
			WHERE t.tipo = 'devolucion_proveedor' AND t.estado = 'esperado' AND t.orden_compra_id = ${ordenCompraId}
				AND t.origen_ubicacion_id = ${aduanaId} AND tl.material_id = ${materialId}
		), 0))::numeric(12, 3)::text AS queda`);
	return aMilesimosConSigno(rows[0]?.queda ?? "0");
}

/**
 * `inventario.aplicar_decision_recepcion_de_mas`: autorizada, lo de más se queda y no se mueve nada. Rechazada,
 * nace la devolución al proveedor por esa cantidad, `esperado`, donde está: en Aduana por lo que de esa orden sigue
 * ahí sin apartar, y en Bodega por lo demás; la línea baja su recibido y la orden se recalcula.
 * @param contexto El contexto de la decisión, sin bitácora (la escribe Dirección).
 * @param datos La decisión, la recepción, la línea y la cantidad de más.
 * @returns Las devoluciones que nacieron.
 */
export async function aplicarDecisionRecepcionDeMas(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = decisionDeMas.parse(datos);
	if (pedido.decision === "autorizar") return { despues: { lo_de_mas: "se queda" } };
	const { transaccion } = contexto;
	const [renglon] = await transaccion
		.select({ ordenCompraId: recepciones.ordenCompraId, materialId: recepcionLineas.materialId })
		.from(recepcionLineas)
		.innerJoin(recepciones, eq(recepciones.id, recepcionLineas.recepcionId))
		.where(
			and(
				eq(recepcionLineas.recepcionId, pedido.recepcion_id),
				eq(recepcionLineas.ordenCompraLineaId, pedido.orden_compra_linea_id),
			),
		)
		.limit(1);
	if (renglon?.ordenCompraId == null || renglon.materialId === null) {
		throw new Error(`la recepción ${pedido.recepcion_id} no recibió la línea ${pedido.orden_compra_linea_id}`);
	}
	const { ordenCompraId, materialId } = renglon;
	await candadoDeLoRecibido(contexto, ordenCompraId);
	const [aduana, bodega] = [await ubicacionDeTipo(transaccion, "aduana"), await ubicacionDeTipo(transaccion, "bodega")];
	const rechazado = aMilesimosConSigno(pedido.cantidad);
	const libreEnAduana = await enAduanaSinApartar(contexto, ordenCompraId, materialId, aduana);
	const deAduana = libreEnAduana > 0n ? menor(rechazado, libreEnAduana) : 0n;
	const devoluciones: { traspaso_id: string; folio: string; donde: string; cantidad: string }[] = [];
	for (const [ubicacionId, donde, cantidad] of [
		[aduana, "aduana", deAduana],
		[bodega, "bodega", rechazado - deAduana],
	] as const) {
		if (cantidad <= 0n) continue;
		const creado = await crearTraspaso(contexto, {
			tipo: "devolucion_proveedor",
			estado: "esperado",
			origen: { ubicacionId },
			destino: { externo: "proveedor" },
			renglones: [{ materialId, cantidad: deMilesimos(cantidad) }],
			referencias: { ordenCompraId },
		});
		contexto.guardarEvento({
			tipo: "traspaso.esperado",
			datos: { traspaso_id: creado.traspasoId },
			tablas: ["traspasos", "traspaso_lineas"],
			entidad: "traspasos",
			entidadId: creado.traspasoId,
			entidadFolio: creado.folio,
		});
		devoluciones.push({ traspaso_id: creado.traspasoId, folio: creado.folio, donde, cantidad: deMilesimos(cantidad) });
	}
	// La línea bajó su recibido: la orden se recalcula y Contaduría vuelve a revisar sus facturas; lo que cambió va en
	// el renglón de Dirección (un efecto no escribe bitácora).
	await contexto.interna("compras.recalcular_estado_orden", { orden_compra_id: ordenCompraId });
	const { facturas } = facturasRevisadas.parse(
		await contexto.interna("contaduria.revisar_facturas_de_orden", { orden_compra_id: ordenCompraId }),
	);
	return {
		despues: {
			devoluciones,
			...(facturas.length === 0 ? {} : { facturas: facturas.map((factura) => factura.descripcion) }),
		},
		datos: { devoluciones },
	};
}

/** Lo que recibe `inventario.actualizar_costo_rollos`. */
const pedidoDeCosto = z
	.object({ orden_compra_linea_id: z.uuid(), costo_metro_centavos: z.number().int().positive() })
	.strict();

/**
 * `inventario.actualizar_costo_rollos`: la nota del proveedor manda en el costo del metro de todos los rollos de
 * una línea, estén donde estén.
 * @param contexto El contexto de la captura de la nota.
 * @param datos La línea y el costo nuevo.
 * @returns Cuántos rollos cambiaron.
 */
export async function actualizarCostoRollos(contexto: ContextoDeAccion, datos: unknown): Promise<{ rollos: number }> {
	const pedido = pedidoDeCosto.parse(datos);
	const cambiados = await contexto.transaccion
		.update(rollos)
		.set({ costoMetroCentavos: pedido.costo_metro_centavos })
		.where(eq(rollos.ordenCompraLineaId, pedido.orden_compra_linea_id))
		.returning({ id: rollos.id });
	return { rollos: cambiados.length };
}

/** Lo que recibe `inventario.tomar_consumible`: lo que tomó alguien en la tablet, ya en la unidad de inventario. */
const pedidoDeConsumible = z
	.object({
		id: z.uuid(),
		renglones: z.array(z.object({ material_id: z.uuid(), cantidad: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/) })).min(1),
		persona_id: z.uuid().nullable(),
		dispositivo_id: z.uuid().nullable(),
		ocurrido_en: z.string(),
	})
	.strict();

/** Lo que regresa `compras.datos_materiales`, en lo que usa esta interna. */
const datosDeMateriales = z.record(z.string(), z.object({ nombre: z.string(), tipo: z.string() }).passthrough());

/**
 * `inventario.tomar_consumible`: lo que tomó el taller sale de `inventario.ubicacion_consumibles` a Fuera, un
 * renglón por material, con quién lo tomó. Nunca rechaza por existencia: puede quedar negativa.
 * @param contexto El contexto de quien aplica lo que subió la tablet.
 * @param datos El id que hizo la tablet, los renglones, la persona, el aparato y la hora.
 * @returns El movimiento.
 * @throws `422 no_es_consumible`: «{material} no es consumible.».
 */
export async function tomarConsumible(contexto: ContextoDeAccion, datos: unknown): Promise<{ movimiento_id: string }> {
	const pedido = pedidoDeConsumible.parse(datos);
	const materiales = datosDeMateriales.parse(
		await contexto.lectura("compras.datos_materiales", {
			material_ids: pedido.renglones.map((renglon) => renglon.material_id),
		}),
	);
	for (const renglon of pedido.renglones) {
		const material = materiales[renglon.material_id];
		if (material?.tipo !== "consumible") {
			throw errorDeRegla("no_es_consumible", `${material?.nombre ?? "Ese material"} no es consumible.`);
		}
	}
	const tipo = z
		.enum(["bodega", "taller", "aduana"])
		.parse(await contexto.lectura("admin.parametro", { clave: "inventario.ubicacion_consumibles" }));
	const origen = await ubicacionDeTipo(contexto.transaccion, tipo);
	const movimiento = await escribirMovimiento(contexto, {
		tipo: "consumible_tomado",
		documento: { tipo: "toma_consumible", id: pedido.id },
		renglones: pedido.renglones.map((renglon) => ({
			origen,
			destino: null,
			materialId: renglon.material_id,
			rolloId: null,
			cantidad: renglon.cantidad,
		})),
		ocurridoEn: Temporal.Instant.from(pedido.ocurrido_en),
		clave: pedido.id,
		personaId: pedido.persona_id,
		dispositivoId: pedido.dispositivo_id,
	});
	contexto.guardarEvento({
		tipo: "consumible.tomado",
		datos: { movimiento_id: movimiento.movimientoId },
		tablas: ["movimientos", "existencias_material"],
		entidad: "movimientos",
		entidadId: movimiento.movimientoId,
	});
	return { movimiento_id: movimiento.movimientoId };
}
