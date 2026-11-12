/**
 * `inventario.surtir_a_aduana`: Bodega surte a aduana lo reservado de un pedido externo o de un pedido en línea, o lo de
 * más que regresa al proveedor. Pasa de Bodega a En camino a aduana con su A-, y las reservas viajan con su pieza.
 * Fase 11 · docs/modulos/inventario/surtido-y-despachos.md (reglas 1 y 2, «`inventario.surtir_a_aduana`»)
 *
 * Los pedidos externos (fase 16) y en línea (fase 18) todavía no existen: el mensaje nombra el A-, y la fecha de
 * entrega del pedido llega con Ventas (decisión 573).
 */

import { aMilesimosConSigno, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { surtirAAduana } from "@uniformame/compartido/contratos/inventario/despachos";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { bloquearExistenciasMaterial, tomarCandadosDeInventario } from "../dominio/candados.ts";
import {
	datosDeDevolucion,
	loQueRegresa,
	ponerRollosEnDevolucion,
	rollosQueRegresan,
} from "../dominio/devoluciones.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { nombreDeVariante, reservasActivas } from "../dominio/reservas.ts";
import { cambiarEstadoTraspaso, crearTraspaso } from "../dominio/traspasos.ts";
import { existencias, existenciasMaterial, reservas, traspasos } from "../tablas.ts";

/** Lo que pide la acción. */
type Pedido = z.infer<typeof surtirAAduana.entrada>;

/** El evento de un traspaso que va a aduana. */
function enCamino(contexto: ContextoDeAccion, traspaso: { traspasoId: string; folio: string }) {
	contexto.guardarEvento({
		tipo: "traspaso.en_camino_aduana",
		datos: { traspaso_id: traspaso.traspasoId },
		tablas: ["traspasos", "traspaso_lineas", "existencias", "existencias_material", "reservas"],
		entidad: "traspasos",
		entidadId: traspaso.traspasoId,
		entidadFolio: traspaso.folio,
	});
}

/**
 * Surte lo reservado en Bodega de un pedido externo o un pedido en línea: un A- en camino a aduana con destino su
 * cliente, sus reservas atadas a él, y el movimiento `surtido_bodega`.
 * @throws `422 esperando_pago` si el W- espera su pago; `422 nada_en_bodega` sin reservas en Bodega;
 * `422 no_hay_en_bodega` si la existencia no cubre lo reservado.
 */
async function surtirPedido(contexto: ContextoDeAccion, pedido: Pedido) {
	const { transaccion } = contexto;
	const esLinea = pedido.documento_tipo === "pedido_linea";
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const delDocumento = and(
		eq(reservas.ubicacionId, bodega),
		isNull(reservas.traspasoId),
		esLinea ? eq(reservas.pedidoLineaId, pedido.documento_id) : eq(reservas.pedidoId, pedido.documento_id),
	);
	// Primero el W-, como el pago y el vencimiento (el mismo orden de candados): uno que espera su pago no se surte, y
	// uno por surtir queda esperando sus prendas. Si después no hay qué surtir, todo se deshace.
	if (esLinea) await contexto.interna("linea.prendas_en_camino", { pedido_linea_id: pedido.documento_id });
	const antes = await reservasActivas(transaccion, delDocumento);
	const varianteIds = [
		...new Set(antes.flatMap((reserva) => (reserva.varianteId === null ? [] : [reserva.varianteId]))),
	];
	await tomarCandadosDeInventario(transaccion, { varianteIds });
	// Con el candado, se vuelven a leer: otra acción pudo cambiarlas mientras.
	const suyas = await reservasActivas(transaccion, delDocumento);
	if (suyas.length === 0) {
		throw errorDeRegla(
			"nada_en_bodega",
			`Nada que surtir de bodega para ${esLinea ? "ese pedido en línea" : "ese pedido"}`,
		);
	}
	const porVariante = new Map<string, number>();
	for (const reserva of suyas) {
		if (reserva.varianteId === null) continue;
		porVariante.set(reserva.varianteId, (porVariante.get(reserva.varianteId) ?? 0) + reserva.piezas);
	}
	for (const [varianteId, piezas] of porVariante) {
		const [hay] = await transaccion
			.select({ piezas: existencias.piezas })
			.from(existencias)
			.where(and(eq(existencias.ubicacionId, bodega), eq(existencias.varianteId, varianteId)));
		if ((hay?.piezas ?? 0) < piezas) {
			const { prenda, talla } = await nombreDeVariante(transaccion, varianteId);
			throw errorDeRegla("no_hay_en_bodega", `No hay ${prenda} ${talla} en bodega: hay que pedirla a una tienda`);
		}
	}
	const traspaso = await crearTraspaso(contexto, {
		tipo: esLinea ? "pedido_linea" : "surtido_pedido_externo",
		estado: "en_camino_aduana",
		origen: { ubicacionId: bodega },
		destino: { externo: esLinea ? "cliente_linea" : "cliente_externo" },
		renglones: [...porVariante].map(([varianteId, piezas]) => ({
			varianteId,
			piezas,
			...(esLinea ? { pedidoLineaId: pedido.documento_id } : {}),
		})),
		...(esLinea ? {} : { referencias: { pedidoId: pedido.documento_id } }),
		fechaSalidaEsperada: esLinea ? contexto.diaDeNegocio.toString() : null,
	});
	// Las reservas viajan con su pieza: van atadas al A- y el movimiento las lleva.
	await transaccion
		.update(reservas)
		.set({ traspasoId: traspaso.traspasoId })
		.where(and(delDocumento, eq(reservas.estado, "activa")));
	const enCaminoAAduana = await ubicacionDeTipo(transaccion, "en_camino_aduana");
	await escribirMovimiento(contexto, {
		tipo: "surtido_bodega",
		documento: { tipo: "traspaso", id: traspaso.traspasoId, folio: traspaso.folio },
		renglones: [...porVariante].map(([varianteId, piezas]) => ({
			origen: bodega,
			destino: enCaminoAAduana,
			varianteId,
			piezas,
			traspasoId: traspaso.traspasoId,
		})),
	});
	const total = [...porVariante.values()].reduce((suma, piezas) => suma + piezas, 0);
	contexto.bitacora({
		descripcion: `Surtió a aduana ${traspaso.folio}`,
		entidad: "traspasos",
		entidadId: traspaso.traspasoId,
		entidadFolio: traspaso.folio,
		despues: { piezas: total, documento: pedido.documento_tipo },
	});
	enCamino(contexto, traspaso);
	return {
		resultado: {
			traspaso_id: traspaso.traspasoId,
			folio: traspaso.folio,
			mensaje: esLinea
				? `${traspaso.folio} va a aduana: queda en camino hasta que aduana lo reciba`
				: `${traspaso.folio}: ${total} piezas van a aduana. Quedan en camino hasta que aduana las reciba`,
		},
		entidad: { nombre: "traspasos", id: traspaso.traspasoId },
	};
}

/**
 * Surte lo de más que regresa al proveedor y espera en Bodega: la tela con los rollos escogidos, enteros; lo demás, por
 * su cantidad. La devolución pasa a en camino a aduana.
 * @throws `422 nada_en_bodega` si no espera en Bodega; `400` sin los rollos de una tela; `422 rollo_ajeno`;
 * `422 no_hay_en_bodega` si lo que no es tela todavía no está en Bodega.
 */
async function surtirDevolucion(contexto: ContextoDeAccion, pedido: Pedido) {
	const { transaccion } = contexto;
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	await tomarCandadosDeInventario(transaccion, { traspasoIds: [pedido.documento_id] });
	const [devolucion] = await transaccion.select().from(traspasos).where(eq(traspasos.id, pedido.documento_id));
	if (devolucion === undefined || devolucion.tipo !== "devolucion_proveedor") throw noExiste();
	if (devolucion.estado !== "esperado" || devolucion.origenUbicacionId !== bodega) {
		throw errorDeRegla("nada_en_bodega", `Nada que surtir de bodega para ${devolucion.folio}`);
	}
	const datos = await datosDeDevolucion(contexto, devolucion);
	if (datos.esTela) {
		if ((pedido.rollo_ids ?? []).length === 0) throw errorDeCampo("rollo_ids", "Escoge los rollos que regresan");
		const regresan = await rollosQueRegresan(contexto, devolucion, datos, pedido.rollo_ids ?? [], {
			ubicacionId: bodega,
			nombre: "bodega",
		});
		await ponerRollosEnDevolucion(contexto, devolucion, regresan);
	}
	const lineas = await loQueRegresa(contexto, devolucion.id);
	const enCaminoAAduana = await ubicacionDeTipo(transaccion, "en_camino_aduana");
	// Lo que no es tela sale de lo que Bodega tiene sin rollo: si no lo tiene (va todavía en tránsito), no surte. Sus
	// dos renglones se bloquean antes de leerlo, en el orden fijo, para que otro surtido o un consumible no lo cuenten
	// a la vez.
	if (!datos.esTela) {
		await bloquearExistenciasMaterial(
			transaccion,
			[bodega, enCaminoAAduana].map((ubicacionId) => ({ ubicacionId, materialId: datos.materialId, rolloId: null })),
		);
		const [hay] = await transaccion
			.select({ cantidad: existenciasMaterial.cantidad })
			.from(existenciasMaterial)
			.where(
				and(
					eq(existenciasMaterial.ubicacionId, bodega),
					eq(existenciasMaterial.materialId, datos.materialId),
					isNull(existenciasMaterial.rolloId),
				),
			);
		const pide = lineas.reduce((suma, linea) => suma + linea.milesimos, 0n);
		if (aMilesimosConSigno(hay?.cantidad ?? "0") < pide) {
			throw errorDeRegla(
				"no_hay_en_bodega",
				`No hay ${cantidadEnTexto(pide)} ${datos.unidad} de ${datos.material} en bodega: espera a que llegue`,
			);
		}
	}
	await escribirMovimiento(contexto, {
		tipo: "surtido_bodega",
		documento: { tipo: "traspaso", id: devolucion.id, folio: devolucion.folio },
		renglones: lineas.map((linea) => ({
			origen: bodega,
			destino: enCaminoAAduana,
			materialId: linea.materialId,
			rolloId: linea.rolloId,
			cantidad: deMilesimos(linea.milesimos),
			traspasoId: devolucion.id,
		})),
	});
	await cambiarEstadoTraspaso(contexto, devolucion.id, "en_camino_aduana");
	// Lo que regresa es lo que baja lo recibido: la orden se recalcula.
	await contexto.interna("compras.recalcular_estado_orden", { orden_compra_id: devolucion.ordenCompraId });
	const total = cantidadEnTexto(lineas.reduce((suma, linea) => suma + linea.milesimos, 0n));
	contexto.bitacora({
		descripcion: `Surtió a aduana ${devolucion.folio}`,
		entidad: "traspasos",
		entidadId: devolucion.id,
		entidadFolio: devolucion.folio,
		despues: {
			material: datos.material,
			cantidad: total,
			rollos: lineas.flatMap((l) => (l.rolloId === null ? [] : [l.rolloId])),
		},
	});
	enCamino(contexto, { traspasoId: devolucion.id, folio: devolucion.folio });
	return {
		resultado: {
			traspaso_id: devolucion.id,
			folio: devolucion.folio,
			mensaje: `${total} ${datos.unidad} de ${datos.material} van a aduana para regresar a ${datos.proveedor}`,
		},
		entidad: { nombre: "traspasos", id: devolucion.id },
	};
}

export const accionSurtirAAduana = implementarAccion(surtirAAduana, async (contexto, datos) =>
	datos.documento_tipo === "devolucion_proveedor" ? surtirDevolucion(contexto, datos) : surtirPedido(contexto, datos),
);
