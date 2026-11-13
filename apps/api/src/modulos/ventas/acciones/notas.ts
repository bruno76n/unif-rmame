/**
 * Las notas de entrega: armarla con lo listo de un pedido, cancelarla antes de que salga, su paso a en camino cuando
 * Aduana la despacha, confirmar la entrega con quién recibió y pasar a bodega lo listo que el cliente ya no quiere.
 * Fase 16 · docs/modulos/ventas/notas-de-entrega.md (reglas 1 a 8, «Acciones», «Acciones internas»)
 *
 * Los candados van en el orden fijo: primero el pedido, después su nota; Inventario y Contaduría toman los suyos
 * después (las variantes, el anticipo del pedido, la cuenta por cobrar).
 */

import { anticipoAplicado } from "@uniformame/compartido/calculos/ventas";
import {
	armarNotaEntrega,
	cancelarNotaEntrega,
	confirmarEntrega,
	pasarABodega,
} from "@uniformame/compartido/contratos/ventas/notas";
import { eq, inArray, max } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { avanceDeLasTallas } from "../dominio/avance-de-pedido.ts";
import { leerNota, type NotaEntrega } from "../dominio/notas.ts";
import {
	eventoDePedido,
	leerPedido,
	type PedidoConCliente,
	renglonesVigentes,
	variantesParaVender,
} from "../dominio/pedidos.ts";
import { notaEntregaLineas, notasEntrega, pedidoRenglones, pedidos } from "../tablas.ts";
import { entregarSiCubre, escribirVersion, pedidoConSuVersion } from "./pedidos.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `contaduria.anticipo_del_pedido` que se usa aquí: lo disponible. */
const anticipoDelPedido = z.object({ disponible_centavos: z.number().int() });

/** Lo que regresa `contaduria.crear_cuenta_por_cobrar`. */
const cuentaCreada = z.object({ importe_centavos: z.number().int(), vence: z.string() });

/**
 * Revisa que el pedido esté confirmado.
 * @throws `422 pedido_no_confirmado`.
 */
function revisarConfirmado(pedido: PedidoConCliente): void {
	if (pedido.estado !== "confirmado") {
		throw errorDeRegla(
			"pedido_no_confirmado",
			`${pedido.folio} está ${pedido.estado}: solo un pedido confirmado lleva notas de entrega.`,
		);
	}
}

/**
 * Lee una nota con su pedido, en el orden fijo: el pedido bloqueado y después la nota bloqueada con su versión tomada.
 * @param contexto El contexto de la acción.
 * @param notaId La nota.
 * @param version La versión que trajo la acción.
 */
async function notaConSuPedido(contexto: ContextoDeAccion, notaId: string, version: number | undefined) {
	const { transaccion } = contexto;
	const [suya] = await transaccion
		.select({ pedidoId: notasEntrega.pedidoId })
		.from(notasEntrega)
		.where(eq(notasEntrega.id, notaId));
	const pedido = suya === undefined ? undefined : await leerPedido(transaccion, suya.pedidoId, true);
	const nota = await leerNota(transaccion, notaId);
	await tomarVersion(contexto, notasEntrega, nota.id, version, async () => ({
		nota_id: nota.id,
		folio: nota.folio,
		estado: nota.estado,
	}));
	if (pedido === undefined) throw new Error(`${nota.folio} sin pedido`);
	return { nota, pedido };
}

/** Las piezas de los renglones de una nota. */
async function piezasDeLaNota(contexto: ContextoDeAccion, notaId: string): Promise<number> {
	const lineas = await contexto.transaccion
		.select({ cantidad: notaEntregaLineas.cantidad })
		.from(notaEntregaLineas)
		.where(eq(notaEntregaLineas.notaEntregaId, notaId));
	return lineas.reduce((total, linea) => total + linea.cantidad, 0);
}

/** Guarda un evento de una nota, con sus tablas. */
function eventoDeNota(
	contexto: ContextoDeAccion,
	tipo: "nota_entrega.creada" | "nota_entrega.cancelada" | "nota_entrega.despachada" | "nota_entrega.entregada",
	nota: Pick<NotaEntrega, "id" | "folio" | "pedidoId">,
): void {
	contexto.guardarEvento({
		tipo,
		datos: { nota_entrega_id: nota.id, pedido_id: nota.pedidoId },
		tablas: ["notas_entrega", "nota_entrega_lineas"],
		entidad: "notas_entrega",
		entidadId: nota.id,
		entidadFolio: nota.folio,
	});
}

/** Si quien hace la acción ve precios: Ventas, Contaduría y la dueña; a Aduana nunca le viajan importes (regla 8). */
function vePrecios(contexto: ContextoDeAccion): boolean {
	const { quien } = contexto;
	return (
		quien.tipo === "cuenta" &&
		(quien.esDuena || quien.departamentos.some((departamento) => ["ventas", "contaduria"].includes(departamento)))
	);
}

export const accionArmarNotaEntrega = implementarAccion(armarNotaEntrega, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const pedido = await pedidoConSuVersion(contexto, datos.pedido_id, version);
	revisarConfirmado(pedido);
	const ids = datos.renglones.map((renglon) => renglon.variante_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("renglones", "Cada talla va una sola vez");
	// Cada talla copia el precio de su renglón vigente del pedido (regla 1).
	const vigentes = await renglonesVigentes(transaccion, pedido.id);
	const nombres = await variantesParaVender(transaccion, ids);
	const lineas = datos.renglones.map((renglon) => {
		const vigente = vigentes.find((uno) => uno.varianteId === renglon.variante_id);
		if (vigente === undefined) {
			const variante = nombres.get(renglon.variante_id);
			throw errorDeRegla(
				"talla_fuera_del_pedido",
				`${variante?.prenda ?? "La prenda"} talla ${variante?.talla ?? ""} ya no está en ${pedido.folio}: pásala a bodega.`,
			);
		}
		return { ...renglon, renglonId: vigente.id, precio: vigente.precioUnitarioCentavos };
	});
	const subtotal = lineas.reduce((total, linea) => total + linea.cantidad * linea.precio, 0);
	const piezas = lineas.reduce((total, linea) => total + linea.cantidad, 0);
	// Nota i de n: el número que sigue en el pedido, aunque se hayan cancelado (regla 3). El pedido está bloqueado.
	const [ultima] = await transaccion
		.select({ numero: max(notasEntrega.numeroEnPedido) })
		.from(notasEntrega)
		.where(eq(notasEntrega.pedidoId, pedido.id));
	const notaId = uuidv7();
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "nota_entrega" }));
	const quien = quienCambia(contexto);
	await transaccion.insert(notasEntrega).values({
		id: notaId,
		folio,
		pedidoId: pedido.id,
		clienteId: pedido.clienteId,
		numeroEnPedido: (ultima?.numero ?? 0) + 1,
		estado: "por_despachar",
		subtotalCentavos: subtotal,
		creadoPor: quien,
	});
	await transaccion.insert(notaEntregaLineas).values(
		lineas.map((linea) => ({
			id: uuidv7(),
			notaEntregaId: notaId,
			pedidoRenglonId: linea.renglonId,
			varianteId: linea.variante_id,
			cantidad: linea.cantidad,
			precioUnitarioCentavos: linea.precio,
			creadoPor: quien,
		})),
	);
	// Lo listo en aduana pasa a la nota; si no alcanza, Inventario lo dice.
	await contexto.interna("inventario.apartar_para_nota", {
		nota_entrega_id: notaId,
		pedido_id: pedido.id,
		renglones: lineas.map((linea) => ({ variante_id: linea.variante_id, piezas: linea.cantidad })),
	});
	// El anticipo: lo menor entre el disponible del pedido y el subtotal (regla 2).
	const { disponible_centavos } = anticipoDelPedido.parse(
		await contexto.lectura("contaduria.anticipo_del_pedido", { pedido_id: pedido.id }),
	);
	const anticipo = anticipoAplicado(disponible_centavos, subtotal);
	if (anticipo > 0) {
		await contexto.interna("contaduria.aplicar_anticipo_a_nota", {
			pedido_id: pedido.id,
			cliente_id: pedido.clienteId,
			nota_entrega_id: notaId,
			monto_centavos: anticipo,
		});
		await transaccion
			.update(notasEntrega)
			.set({ anticipoAplicadoCentavos: anticipo })
			.where(eq(notasEntrega.id, notaId));
	}
	eventoDeNota(contexto, "nota_entrega.creada", { id: notaId, folio, pedidoId: pedido.id });
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} armó la nota ${folio} con ${piezas} piezas`,
		entidad: "notas_entrega",
		entidadId: notaId,
		entidadFolio: folio,
		despues: {
			pedido_id: pedido.id,
			renglones: lineas.map((linea) => ({ variante_id: linea.variante_id, cantidad: linea.cantidad })),
			subtotal_centavos: subtotal,
			anticipo_centavos: anticipo,
		},
	});
	return {
		resultado: {
			mensaje: `${folio} lista: ${piezas} piezas por despachar en aduana`,
			nota_id: notaId,
			folio,
			subtotal_centavos: subtotal,
			anticipo_centavos: anticipo,
			por_cobrar_centavos: subtotal - anticipo,
			version: await versionActual(transaccion, notasEntrega, notaId),
		},
		entidad: { nombre: "notas_entrega", id: notaId },
	};
});

export const accionCancelarNotaEntrega = implementarAccion(cancelarNotaEntrega, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const { nota, pedido } = await notaConSuPedido(contexto, datos.nota_id, version);
	// Solo antes de salir de aduana (regla 4).
	if (nota.estado !== "por_despachar") {
		throw errorDeRegla("nota_ya_salio", `${nota.folio} ya salió de aduana: no se puede cancelar.`);
	}
	const motivo = datos.motivo.trim();
	const quien = quienCambia(contexto);
	await transaccion
		.update(notasEntrega)
		.set({
			estado: "cancelada",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: motivo,
		})
		.where(eq(notasEntrega.id, nota.id));
	// Sus piezas regresan a lo listo del pedido y su anticipo, al pedido.
	await contexto.interna("inventario.devolver_de_nota", { nota_entrega_id: nota.id, folio: nota.folio });
	await contexto.interna("contaduria.regresar_anticipo_a_pedido", { nota_entrega_id: nota.id });
	eventoDeNota(contexto, "nota_entrega.cancelada", nota);
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} canceló la nota ${nota.folio}: ${motivo}`,
		entidad: "notas_entrega",
		entidadId: nota.id,
		entidadFolio: nota.folio,
		antes: { estado: nota.estado },
		despues: { estado: "cancelada", motivo },
	});
	return {
		resultado: {
			mensaje: `${nota.folio} cancelada: sus piezas regresan a lo listo del pedido ${pedido.folio}`,
			nota_id: nota.id,
			version: await versionActual(transaccion, notasEntrega, nota.id),
		},
		entidad: { nombre: "notas_entrega", id: nota.id },
	};
});

export const accionConfirmarEntrega = implementarAccion(confirmarEntrega, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const minimo = z
		.number()
		.int()
		.parse(await contexto.lectura("admin.parametro", { clave: "ventas.largo_minimo_quien_recibio" }));
	const recibio = datos.recibio_nombre.trim();
	if (recibio.length < minimo) throw errorDeCampo("recibio_nombre", "Escribe quién recibió");
	const { nota, pedido } = await notaConSuPedido(contexto, datos.nota_id, version);
	if (nota.estado === "entregada") throw errorDeRegla("nota_ya_entregada", `${nota.folio} ya está entregada.`);
	if (nota.estado !== "en_camino" || nota.despachoId === null) {
		throw errorDeRegla("nota_no_en_camino", `${nota.folio} no ha salido de aduana: primero se despacha.`);
	}
	// Las piezas salen de Tránsito con quién recibió (regla 6).
	await contexto.interna("inventario.entregar_a_cliente_externo", {
		nota_entrega_id: nota.id,
		despacho_id: nota.despachoId,
		recibio_nombre: recibio,
		ocurrido_en: contexto.ahora.toString(),
	});
	const quien = quienCambia(contexto);
	if (quien === null) throw new Error("confirma la entrega una cuenta de Ventas o de Aduana");
	const fecha = contexto.diaDeNegocio.toString();
	await transaccion
		.update(notasEntrega)
		.set({
			estado: "entregada",
			fechaEntrega: fecha,
			entregadaEn: contexto.ahora.toString(),
			recibioNombre: recibio,
			entregadaPor: quien,
		})
		.where(eq(notasEntrega.id, nota.id));
	// Nace su cuenta por cobrar, con los días de crédito del pedido.
	const cuenta = cuentaCreada.parse(
		await contexto.interna("contaduria.crear_cuenta_por_cobrar", {
			nota_entrega_id: nota.id,
			pedido_id: pedido.id,
			cliente_id: pedido.clienteId,
			fecha_entrega: fecha,
			dias_credito: pedido.diasCredito,
			total_nota_centavos: nota.subtotalCentavos,
		}),
	);
	const entregado = await entregarSiCubre(
		contexto,
		pedido,
		await avanceDeLasTallas(contexto, pedido.id, await renglonesVigentes(transaccion, pedido.id)),
	);
	eventoDeNota(contexto, "nota_entrega.entregada", nota);
	const piezas = await piezasDeLaNota(contexto, nota.id);
	contexto.bitacora({
		descripcion: `Entregada a ${pedido.cliente}: ${piezas} piezas, recibió ${recibio}`,
		entidad: "notas_entrega",
		entidadId: nota.id,
		entidadFolio: nota.folio,
		antes: { estado: nota.estado },
		despues: {
			estado: "entregada",
			recibio,
			importe_centavos: cuenta.importe_centavos,
			vence: cuenta.vence,
			pedido_entregado: entregado,
		},
	});
	return {
		resultado: {
			mensaje: `${nota.folio} entregada a ${pedido.cliente}. Contaduría ya la cobra`,
			nota_id: nota.id,
			pedido_entregado: entregado,
			...(vePrecios(contexto) ? { por_cobrar_centavos: cuenta.importe_centavos } : {}),
			version: await versionActual(transaccion, notasEntrega, nota.id),
		},
		entidad: { nombre: "notas_entrega", id: nota.id },
	};
});

export const accionPasarABodega = implementarAccion(pasarABodega, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const pedido = await pedidoConSuVersion(contexto, datos.pedido_id, version);
	revisarConfirmado(pedido);
	const ids = datos.renglones.map((renglon) => renglon.variante_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("renglones", "Cada talla va una sola vez");
	const vigentes = await renglonesVigentes(transaccion, pedido.id);
	// Nunca más de lo listo en aduana sin nota.
	const avance = await avanceDeLasTallas(contexto, pedido.id, vigentes);
	const nombres = await variantesParaVender(transaccion, ids);
	for (const renglon of datos.renglones) {
		const listo = avance.find((talla) => talla.varianteId === renglon.variante_id)?.listo ?? 0;
		if (renglon.piezas > listo) {
			const variante = nombres.get(renglon.variante_id);
			throw errorDeRegla(
				"piezas_de_mas",
				`${variante?.prenda ?? "La prenda"} talla ${variante?.talla ?? ""}: hay ${listo} listas en aduana sin nota.`,
			);
		}
	}
	// La versión nueva: cada talla baja esas piezas y conserva su precio (regla 7).
	const numero = pedido.versionVigente + 1;
	const cambian = vigentes.flatMap((vigente) => {
		const baja = datos.renglones.find((renglon) => renglon.variante_id === vigente.varianteId)?.piezas ?? 0;
		return baja === 0 ? [] : [{ vigente, cantidad: Math.max(0, vigente.cantidad - baja) }];
	});
	if (cambian.length > 0) {
		await transaccion
			.update(pedidoRenglones)
			.set({ hastaVersion: numero })
			.where(
				inArray(
					pedidoRenglones.id,
					cambian.map(({ vigente }) => vigente.id),
				),
			);
		await transaccion.insert(pedidoRenglones).values(
			cambian.map(({ vigente, cantidad }) => ({
				...vigente,
				id: uuidv7(),
				cantidad,
				desdeVersion: numero,
				hastaVersion: null,
				creadoPor: quienCambia(contexto),
				creadoEn: undefined,
				actualizadoEn: undefined,
				version: undefined,
			})),
		);
	}
	await transaccion.update(pedidos).set({ versionVigente: numero }).where(eq(pedidos.id, pedido.id));
	await escribirVersion(contexto, pedido.id, numero, "pasar_a_bodega", {
		fechaEntrega: pedido.fechaEntrega,
		formaPago: pedido.formaPago,
		diasCredito: pedido.diasCredito,
	});
	await contexto.interna("inventario.pasar_a_bodega", {
		pedido_id: pedido.id,
		renglones: datos.renglones,
	});
	await entregarSiCubre(
		contexto,
		pedido,
		await avanceDeLasTallas(contexto, pedido.id, await renglonesVigentes(transaccion, pedido.id)),
	);
	eventoDePedido(contexto, "pedido.version_guardada", pedido);
	const piezas = datos.renglones.reduce((total, renglon) => total + renglon.piezas, 0);
	const motivo = datos.motivo.trim();
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quienCambia(contexto))} pasó a bodega ${piezas} piezas de ${pedido.folio}: ${motivo}`,
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		antes: {
			renglones: cambian.map(({ vigente }) => ({ variante_id: vigente.varianteId, cantidad: vigente.cantidad })),
		},
		despues: {
			numero,
			renglones: cambian.map(({ vigente, cantidad }) => ({ variante_id: vigente.varianteId, cantidad })),
			motivo,
		},
	});
	return {
		resultado: {
			mensaje: `${piezas} piezas de ${pedido.folio} regresan a bodega. El pedido pasa a la versión ${numero}`,
			pedido_id: pedido.id,
			numero,
			version: await versionActual(transaccion, pedidos, pedido.id),
		},
		entidad: { nombre: "pedidos", id: pedido.id },
	};
});

/** Lo que recibe `ventas.marcar_nota_en_camino`. */
const pedidoDeEnCamino = z
	.object({ nota_entrega_id: z.uuid(), despacho_id: z.uuid(), despachado_en: z.string() })
	.strict();

/**
 * `ventas.marcar_nota_en_camino`: Aduana despachó la nota; pasa a en camino con su D- y la hora (regla 5). La
 * bitácora es el renglón del despacho.
 * @param contexto El contexto de `inventario.despachar`.
 * @param datos La nota, su despacho y cuándo salió.
 * @returns Su folio y el nombre de su cliente, sin precios, para el mensaje de Aduana.
 * @throws `422 nota_no_por_despachar` si ya salió o se canceló.
 */
export async function marcarNotaEnCamino(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeEnCamino.parse(datos);
	const nota = await leerNota(contexto.transaccion, pedido.nota_entrega_id);
	if (nota.estado !== "por_despachar") {
		throw errorDeRegla("nota_no_por_despachar", `${nota.folio} no está por despachar.`);
	}
	await contexto.transaccion
		.update(notasEntrega)
		.set({ estado: "en_camino", despachoId: pedido.despacho_id, despachadoEn: pedido.despachado_en })
		.where(eq(notasEntrega.id, nota.id));
	eventoDeNota(contexto, "nota_entrega.despachada", nota);
	const { cliente } = await leerPedido(contexto.transaccion, nota.pedidoId);
	return { folio: nota.folio, cliente };
}
