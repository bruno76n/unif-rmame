/**
 * `produccion.crear_cambio_pedido` (interna) y `produccion.aplicar_cambio_pedido`: si el cliente pide menos, Producción
 * no corta de más. La versión que deja piezas de más en producción crea su cambio; aplicarlo resta de los lotes por
 * cortar y manda a Bodega lo ya cortado.
 * Fase 16 · docs/modulos/produccion/cambios-a-pedido.md (reglas 1 a 6, «Acciones»)
 *
 * Aplicar toma la versión del cambio y, en orden de id, los lotes del pedido; cada lote tocado sube su versión.
 */

import { aplicarCambioPedido } from "@uniformame/compartido/contratos/produccion/cambios";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { subirVersion, tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { pedidos, pedidoVersiones } from "../../ventas/tablas.ts";
import { type LineaDelReparto, repartirPiezasDeMas } from "../dominio/reparto-de-cambio.ts";
import { cambioPedidoLineas, cambiosPedido, lotes, loteTallas, ordenesProduccion } from "../tablas.ts";

/** Lo que recibe `produccion.crear_cambio_pedido`. */
const pedidoDeCambio = z.object({ pedido_id: z.uuid(), pedido_version_id: z.uuid() }).strict();

/**
 * `produccion.crear_cambio_pedido`: el cambio de una versión, por aplicar (regla 1). Una versión, un cambio.
 * @param contexto El contexto de `ventas.guardar_version_pedido`; su bitácora es la de la versión.
 * @param datos El pedido y su versión.
 * @returns `cambio_pedido_id`.
 */
export async function crearCambioPedido(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeCambio.parse(datos);
	const id = uuidv7();
	await contexto.transaccion.insert(cambiosPedido).values({
		id,
		pedidoId: pedido.pedido_id,
		pedidoVersionId: pedido.pedido_version_id,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "cambio_pedido.creado",
		datos: { cambio_pedido_id: id, pedido_id: pedido.pedido_id },
		tablas: ["cambios_pedido"],
		entidad: "cambios_pedido",
		entidadId: id,
	});
	return { cambio_pedido_id: id };
}

/** Lo que regresa `ventas.avance_pedido`: lo de más de cada talla. */
const avance = z.object({
	tallas: z.array(z.object({ variante_id: z.uuid(), de_mas: z.number().int() })),
});

export const accionAplicarCambioPedido = implementarAccion(aplicarCambioPedido, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [leido] = await transaccion.select().from(cambiosPedido).where(eq(cambiosPedido.id, datos.cambio_pedido_id));
	await tomarVersion(contexto, cambiosPedido, datos.cambio_pedido_id, version, async () =>
		leido === undefined ? undefined : { cambio_pedido_id: leido.id, estado: leido.estado },
	);
	if (leido === undefined || leido.estado !== "por_aplicar") {
		throw errorDeRegla("cambio_ya_aplicado", "Ese cambio ya se aplicó.");
	}
	// Se aplica el más nuevo del pedido; los anteriores quedan reemplazados (regla 2).
	const porAplicar = await transaccion
		.select({ id: cambiosPedido.id, numero: pedidoVersiones.numero })
		.from(cambiosPedido)
		.innerJoin(pedidoVersiones, eq(pedidoVersiones.id, cambiosPedido.pedidoVersionId))
		.where(and(eq(cambiosPedido.pedidoId, leido.pedidoId), eq(cambiosPedido.estado, "por_aplicar")))
		.orderBy(desc(pedidoVersiones.numero))
		.for("update", { of: cambiosPedido });
	const [elMasNuevo] = porAplicar;
	if (elMasNuevo === undefined) throw errorDeRegla("cambio_ya_aplicado", "Ese cambio ya se aplicó.");
	const [pedido] = await transaccion
		.select({ folio: pedidos.folio })
		.from(pedidos)
		.where(eq(pedidos.id, leido.pedidoId));
	const folio = pedido?.folio ?? "";
	// Los lotes del pedido que siguen en producción, bloqueados en orden de id.
	const suyos = await transaccion
		.select()
		.from(lotes)
		.where(
			and(
				eq(lotes.pedidoId, leido.pedidoId),
				inArray(lotes.estado, ["por_cortar", "en_proceso", "terminado", "revisado"]),
			),
		)
		.orderBy(asc(lotes.id))
		.for("update");
	const deMas = avance.parse(await contexto.lectura("ventas.avance_pedido", { pedido_id: leido.pedidoId }));
	const tallas =
		suyos.length === 0
			? []
			: await transaccion
					.select()
					.from(loteTallas)
					.where(
						inArray(
							loteTallas.loteId,
							suyos.map((lote) => lote.id),
						),
					);
	// El reparto (reglas 4 y 5); aquí solo se guarda lo que dice.
	const { lineas } = repartirPiezasDeMas(
		deMas.tallas.map((talla) => ({ varianteId: talla.variante_id, piezas: talla.de_mas })),
		suyos.map((lote) => ({
			id: lote.id,
			folio: lote.folio,
			estado: lote.estado,
			fechaCorte: lote.fechaCorte,
			cortadoEn: lote.cortadoEn,
			tallas: tallas
				.filter((talla) => talla.loteId === lote.id)
				.map((talla) => ({
					varianteId: talla.varianteId,
					planeadas: talla.piezasPlaneadas,
					cortadas: talla.piezasCortadas ?? 0,
					merma: talla.piezasMerma,
					aBodega: talla.piezasABodega,
				})),
		})),
	);
	for (const linea of lineas) {
		const suya = tallas.find((una) => una.loteId === linea.loteId && una.varianteId === linea.varianteId);
		if (suya === undefined) continue;
		suya.piezasPlaneadas -= linea.restadas;
		suya.piezasABodega += linea.aBodega;
	}
	const quien = quienCambia(contexto);
	const ahora = contexto.ahora.toString();
	for (const linea of lineas) {
		const suya = tallas.find((una) => una.loteId === linea.loteId && una.varianteId === linea.varianteId);
		if (suya === undefined) continue;
		await transaccion
			.update(loteTallas)
			.set({ piezasPlaneadas: suya.piezasPlaneadas, piezasABodega: suya.piezasABodega })
			.where(eq(loteTallas.id, suya.id));
	}
	const tocados = [...new Set(lineas.map((linea) => linea.loteId))];
	for (const loteId of tocados) await subirVersion(transaccion, lotes, loteId);
	// Un lote por cortar que queda en 0 se cancela; si tenía tela entregada, su entrega queda devuelta (regla 5).
	const cancelados: string[] = [];
	for (const lote of suyos.filter((uno) => uno.estado === "por_cortar" && tocados.includes(uno.id))) {
		const quedan = tallas
			.filter((una) => una.loteId === lote.id)
			.reduce((total, una) => total + una.piezasPlaneadas, 0);
		if (quedan > 0) continue;
		await transaccion
			.update(lotes)
			.set({
				estado: "cancelado",
				canceladoEn: ahora,
				canceladoPor: quien,
				motivoCancelacion: `Cambio de pedido ${folio} versión ${elMasNuevo.numero}`,
			})
			.where(eq(lotes.id, lote.id));
		await contexto.interna("inventario.devolver_entrega_corte", { lote_id: lote.id });
		contexto.guardarEvento({
			tipo: "lote.cancelado",
			datos: { lote_id: lote.id },
			tablas: ["lotes"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
		cancelados.push(lote.folio);
	}
	// Una orden con todos sus lotes cancelados se cancela.
	const ordenesCanceladas: string[] = [];
	const ordenes = [
		...new Set(suyos.filter((lote) => cancelados.includes(lote.folio)).map((lote) => lote.ordenProduccionId)),
	];
	for (const ordenId of ordenes) {
		const [vivo] = await transaccion
			.select({ id: lotes.id })
			.from(lotes)
			.where(and(eq(lotes.ordenProduccionId, ordenId), ne(lotes.estado, "cancelado")))
			.limit(1);
		if (vivo !== undefined) continue;
		await transaccion
			.update(ordenesProduccion)
			.set({
				estado: "cancelada",
				canceladoEn: ahora,
				canceladoPor: quien,
				motivoCancelacion: `Cambio de pedido ${folio} versión ${elMasNuevo.numero}`,
			})
			.where(eq(ordenesProduccion.id, ordenId));
		contexto.guardarEvento({
			tipo: "orden_produccion.cancelada",
			datos: { orden_produccion_id: ordenId },
			tablas: ["ordenes_produccion"],
			entidad: "ordenes_produccion",
			entidadId: ordenId,
		});
		ordenesCanceladas.push(ordenId);
	}
	if (lineas.length > 0) {
		await transaccion.insert(cambioPedidoLineas).values(
			lineas.map((linea) => ({
				id: uuidv7(),
				cambioPedidoId: elMasNuevo.id,
				loteId: linea.loteId,
				varianteId: linea.varianteId,
				piezasRestadas: linea.restadas,
				piezasABodega: linea.aBodega,
				creadoPor: quien,
			})),
		);
		await contexto.interna("inventario.recalcular_rollos_sugeridos", {});
	}
	await transaccion
		.update(cambiosPedido)
		.set({ estado: "aplicado", aplicadoEn: ahora, aplicadoPor: quien })
		.where(eq(cambiosPedido.id, elMasNuevo.id));
	const reemplazados = porAplicar.filter((uno) => uno.id !== elMasNuevo.id).map((uno) => uno.id);
	if (reemplazados.length > 0) {
		await transaccion
			.update(cambiosPedido)
			.set({ estado: "reemplazado" })
			.where(inArray(cambiosPedido.id, reemplazados));
	}
	if (elMasNuevo.id !== leido.id) await subirVersion(transaccion, cambiosPedido, elMasNuevo.id);
	contexto.guardarEvento({
		tipo: "cambio_pedido.aplicado",
		datos: { cambio_pedido_id: elMasNuevo.id, pedido_id: leido.pedidoId },
		tablas: ["cambios_pedido", "lotes", "lote_tallas"],
		entidad: "cambios_pedido",
		entidadId: elMasNuevo.id,
	});
	const comoQuedo = (linea: LineaDelReparto) =>
		tallas.find((una) => una.loteId === linea.loteId && una.varianteId === linea.varianteId);
	const detalle =
		lineas.length === 0
			? "sin ajustes"
			: lineas
					.map((linea) =>
						linea.restadas > 0
							? `${linea.loteFolio} −${linea.restadas}`
							: `${linea.loteFolio} ${linea.aBodega} a Bodega`,
					)
					.join(", ");
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} aplicó la versión ${elMasNuevo.numero} del pedido ${folio}: ${detalle}`,
		entidad: "cambios_pedido",
		entidadId: elMasNuevo.id,
		// Las planeadas y lo que va a Bodega de cada lote y talla tocados, y los estados de lotes y órdenes.
		antes: {
			lineas: lineas.map((linea) => ({
				lote_id: linea.loteId,
				variante_id: linea.varianteId,
				piezas_planeadas: (comoQuedo(linea)?.piezasPlaneadas ?? 0) + linea.restadas,
				piezas_a_bodega: (comoQuedo(linea)?.piezasABodega ?? 0) - linea.aBodega,
			})),
			lotes: suyos
				.filter((lote) => tocados.includes(lote.id))
				.map((lote) => ({ lote_id: lote.id, estado: lote.estado })),
		},
		despues: {
			lineas: lineas.map((linea) => ({
				lote_id: linea.loteId,
				variante_id: linea.varianteId,
				piezas_planeadas: comoQuedo(linea)?.piezasPlaneadas ?? 0,
				piezas_a_bodega: comoQuedo(linea)?.piezasABodega ?? 0,
			})),
			lotes_cancelados: cancelados,
			ordenes_canceladas: ordenesCanceladas,
		},
	});
	return {
		resultado: {
			mensaje: lineas.length === 0 ? "Sin ajustes" : `${folio} versión ${elMasNuevo.numero} aplicada en producción`,
			cambio_pedido_id: elMasNuevo.id,
			lineas: lineas.length,
			version: await versionActual(transaccion, cambiosPedido, leido.id),
		},
		entidad: { nombre: "cambios_pedido", id: elMasNuevo.id },
	};
});
