/**
 * `ventas.guardar_borrador_pedido`, `ventas.confirmar_pedido`, `ventas.guardar_version_pedido` y
 * `ventas.cancelar_pedido`: el pedido de un cliente externo, de su borrador a su cancelación.
 * Fase 16 · docs/modulos/ventas/pedidos.md (reglas 1 a 10, «Acciones»)
 *
 * El pedido es un agregado con sus renglones: cada acción toma la versión del pedido antes de cambiarlo, y cualquier
 * cambio en sus renglones la sube (regla 10). Guardar y confirmar crean o editan: la versión llega solo con un borrador
 * que ya existe (decisión 680). El folio PE- se toma al final, después de revisar todo.
 */

import { totalDe } from "@uniformame/compartido/calculos/ventas";
import {
	cancelarPedido,
	confirmarPedido,
	guardarBorradorPedido,
	guardarVersionPedido,
} from "@uniformame/compartido/contratos/ventas/pedidos";
import { eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import type { AvanceDeTalla } from "../dominio/avance.ts";
import { avanceDeLasTallas } from "../dominio/avance-de-pedido.ts";
import { notasDelPedido } from "../dominio/notas.ts";
import {
	enPesos,
	eventoDePedido,
	leerPedido,
	type MomentoDelPedido,
	type PedidoConCliente,
	precioDeHoy,
	type Renglon,
	type RenglonPedido,
	renglonesVigentes,
	revisarCliente,
	revisarRenglones,
} from "../dominio/pedidos.ts";
import { type origenesDeVersion, pedidoRenglones, pedidos, pedidoVersiones } from "../tablas.ts";

/** El pedido como lo traen guardar, confirmar y guardar una versión. */
interface PedidoQueLlega {
	cliente_id: string;
	fecha_entrega: string;
	forma_pago: "contado" | "anticipo" | "credito";
	renglones: RenglonPedido[];
}

/**
 * Revisa la fecha de entrega: no antes de hoy, salvo la que ya tenía y no cambió.
 * @throws `422 entrega_pasada`.
 */
function revisarEntrega(contexto: ContextoDeAccion, fecha: string, laQueTenia?: string): void {
	if (fecha === laQueTenia) return;
	if (Temporal.PlainDate.compare(Temporal.PlainDate.from(fecha), contexto.diaDeNegocio) < 0) {
		throw errorDeRegla("entrega_pasada", "La entrega no puede ser antes de hoy.");
	}
}

/**
 * Lee y bloquea un pedido que ya existe y toma su versión.
 * @param contexto El contexto de la acción.
 * @param pedidoId El pedido.
 * @param version La versión que trajo la acción.
 */
export async function pedidoConSuVersion(
	contexto: ContextoDeAccion,
	pedidoId: string,
	version: number | undefined,
): Promise<PedidoConCliente> {
	const pedido = await leerPedido(contexto.transaccion, pedidoId, true);
	await tomarVersion(contexto, pedidos, pedido.id, version, async () => ({
		pedido_id: pedido.id,
		folio: pedido.folio,
		estado: pedido.estado,
	}));
	return pedido;
}

/**
 * Revisa el pedido que llega y le pone el precio de hoy a cada renglón.
 * @param contexto El contexto de la acción.
 * @param llega El pedido.
 * @param momento Qué se hace, para el semáforo del cliente.
 * @returns Los renglones con su precio, los días de crédito y los avisos.
 */
async function pedidoRevisado(contexto: ContextoDeAccion, llega: PedidoQueLlega, momento: MomentoDelPedido) {
	const cliente = await revisarCliente(contexto, llega.cliente_id, llega.forma_pago, momento);
	const { variantes, avisos } = await revisarRenglones(contexto, llega.renglones);
	const renglones = [];
	for (const renglon of llega.renglones) {
		const variante = variantes.get(renglon.variante_id);
		if (variante === undefined) throw errorDeCampo("renglones", "Pon las piezas por talla");
		const precio = await precioDeHoy(contexto, llega.cliente_id, variante, renglon.precio_dado_centavos);
		renglones.push({ varianteId: renglon.variante_id, cantidad: renglon.cantidad, ...precio });
	}
	return { renglones, diasCredito: cliente.diasCredito, avisos: [...cliente.avisos, ...avisos] };
}

/** Un renglón con su precio, como lo escribe guardar. */
type RenglonConPrecio = Awaited<ReturnType<typeof pedidoRevisado>>["renglones"][number];

/**
 * Escribe los renglones de un borrador en su lugar (regla 2): los que siguen cambian sus piezas y su precio de hoy, los
 * nuevos nacen y los que ya no vienen se quitan (`hasta_version` = 1).
 * @param contexto El contexto de la acción.
 * @param pedidoId El borrador.
 * @param nuevos Los renglones que deben quedar.
 * @param congelar Si se congela el precio (al confirmar).
 */
async function escribirRenglonesDelBorrador(
	contexto: ContextoDeAccion,
	pedidoId: string,
	nuevos: readonly RenglonConPrecio[],
	congelar: boolean,
): Promise<void> {
	const { transaccion } = contexto;
	const actuales = await renglonesVigentes(transaccion, pedidoId);
	const congeladoEn = congelar ? contexto.ahora.toString() : null;
	const quitados = actuales.filter((actual) => !nuevos.some((nuevo) => nuevo.varianteId === actual.varianteId));
	if (quitados.length > 0) {
		await transaccion
			.update(pedidoRenglones)
			.set({ hastaVersion: 1 })
			.where(
				inArray(
					pedidoRenglones.id,
					quitados.map((quitado) => quitado.id),
				),
			);
	}
	for (const nuevo of nuevos) {
		const actual = actuales.find((uno) => uno.varianteId === nuevo.varianteId);
		if (actual === undefined) {
			await transaccion.insert(pedidoRenglones).values({
				id: uuidv7(),
				pedidoId,
				desdeVersion: 1,
				...nuevo,
				congeladoEn,
				creadoPor: quienCambia(contexto),
			});
		} else {
			await transaccion
				.update(pedidoRenglones)
				.set({ ...nuevo, congeladoEn })
				.where(eq(pedidoRenglones.id, actual.id));
		}
	}
}

/**
 * Crea un pedido nuevo con su folio, en borrador o ya confirmado.
 * @returns El pedido nuevo.
 */
async function pedidoNuevo(
	contexto: ContextoDeAccion,
	llega: PedidoQueLlega,
	diasCredito: number,
	confirmado: boolean,
): Promise<{ id: string; folio: string }> {
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "pedido" }));
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await contexto.transaccion.insert(pedidos).values({
		id,
		folio,
		clienteId: llega.cliente_id,
		estado: confirmado ? "confirmado" : "borrador",
		fechaEntrega: llega.fecha_entrega,
		formaPago: llega.forma_pago,
		diasCredito,
		...(confirmado ? { confirmadoEn: contexto.ahora.toString(), confirmadoPor: quien } : {}),
		creadoPor: quien,
	});
	return { id, folio };
}

export const accionGuardarBorradorPedido = implementarAccion(
	guardarBorradorPedido,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
		// Un borrador que ya existe se edita en su lugar; si no, nace con su folio.
		const existente =
			datos.pedido_id === undefined ? undefined : await pedidoConSuVersion(contexto, datos.pedido_id, version);
		if (existente !== undefined) {
			if (existente.estado !== "borrador") {
				throw errorDeRegla("pedido_no_es_borrador", `${existente.folio} ya está ${existente.estado}.`);
			}
			if (existente.clienteId !== datos.cliente_id) {
				throw errorDeRegla("cliente_no_cambia", "El cliente no cambia en un pedido que ya existe.");
			}
		}
		revisarEntrega(contexto, datos.fecha_entrega, existente?.fechaEntrega);
		const revisado = await pedidoRevisado(contexto, datos, existente === undefined ? "nuevo" : "borrador");
		const pedido = existente ?? (await pedidoNuevo(contexto, datos, revisado.diasCredito, false));
		if (existente !== undefined) {
			await transaccion
				.update(pedidos)
				.set({ fechaEntrega: datos.fecha_entrega, formaPago: datos.forma_pago, diasCredito: revisado.diasCredito })
				.where(eq(pedidos.id, existente.id));
		}
		await escribirRenglonesDelBorrador(contexto, pedido.id, revisado.renglones, false);
		eventoDePedido(contexto, "pedido.guardado", pedido);
		const cliente = existente?.cliente ?? (await leerPedido(transaccion, pedido.id)).cliente;
		// Solo el pedido nuevo deja su renglón de bitácora (regla 2).
		if (existente === undefined) {
			contexto.bitacora({
				descripcion: `${quien} levantó el pedido ${pedido.folio} para ${cliente}`,
				entidad: "pedidos",
				entidadId: pedido.id,
				entidadFolio: pedido.folio,
			});
		}
		return {
			resultado: {
				mensaje:
					existente === undefined
						? `${pedido.folio} guardado como borrador para ${cliente}`
						: `${pedido.folio} actualizado`,
				pedido_id: pedido.id,
				folio: pedido.folio,
				total_centavos: totalDe(revisado.renglones),
				version: await versionActual(transaccion, pedidos, pedido.id),
			},
			avisos: revisado.avisos,
			entidad: { nombre: "pedidos", id: pedido.id },
			...(existente === undefined ? {} : { sinBitacora: true }),
		};
	},
);

/**
 * Escribe la versión de un pedido.
 * @param contexto El contexto de la acción.
 * @param pedidoId El pedido.
 * @param numero Su número.
 * @param origen De dónde nace.
 * @param forma Su fecha, su forma de pago y sus días.
 * @returns El id de la versión.
 */
export async function escribirVersion(
	contexto: ContextoDeAccion,
	pedidoId: string,
	numero: number,
	origen: (typeof origenesDeVersion)[number],
	forma: { fechaEntrega: string; formaPago: string; diasCredito: number },
): Promise<string> {
	const id = uuidv7();
	await contexto.transaccion.insert(pedidoVersiones).values({
		id,
		pedidoId,
		numero,
		origen,
		...forma,
		creadoPor: quienCambia(contexto),
	});
	return id;
}

export const accionConfirmarPedido = implementarAccion(confirmarPedido, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
	const existente =
		datos.pedido_id === undefined ? undefined : await pedidoConSuVersion(contexto, datos.pedido_id, version);
	let llega: PedidoQueLlega;
	const avisos: string[] = [];
	if (existente !== undefined) {
		if (existente.estado !== "borrador") {
			throw errorDeRegla("pedido_no_es_borrador", `${existente.folio} ya está ${existente.estado}.`);
		}
		// Se confirma el borrador como está.
		const actuales = await renglonesVigentes(transaccion, existente.id);
		llega = {
			cliente_id: existente.clienteId,
			fecha_entrega: existente.fechaEntrega,
			forma_pago: z.enum(["contado", "anticipo", "credito"]).parse(existente.formaPago),
			renglones: actuales.map((actual) => ({
				variante_id: actual.varianteId,
				cantidad: actual.cantidad,
				precio_dado_centavos: actual.precioDadoCentavos ?? undefined,
			})),
		};
		revisarEntrega(contexto, llega.fecha_entrega);
		const revisado = await pedidoRevisado(contexto, llega, "confirmar");
		// El precio de Catálogo pudo cambiar desde el borrador: avisa con el que queda.
		for (const nuevo of revisado.renglones) {
			const antes = actuales.find((actual) => actual.varianteId === nuevo.varianteId);
			if (antes !== undefined && antes.precioUnitarioCentavos !== nuevo.precioUnitarioCentavos) {
				const { variantes } = await revisarRenglones(contexto, [
					{ variante_id: nuevo.varianteId, cantidad: Math.max(1, nuevo.cantidad) },
				]);
				avisos.push(
					`${variantes.get(nuevo.varianteId)?.prenda ?? "La prenda"}: el precio de Catálogo cambió desde el borrador; quedó en ${enPesos(nuevo.precioUnitarioCentavos)}.`,
				);
			}
		}
		await transaccion
			.update(pedidos)
			.set({
				estado: "confirmado",
				diasCredito: revisado.diasCredito,
				confirmadoEn: contexto.ahora.toString(),
				confirmadoPor: quienCambia(contexto),
			})
			.where(eq(pedidos.id, existente.id));
		await escribirRenglonesDelBorrador(contexto, existente.id, revisado.renglones, true);
		avisos.unshift(...revisado.avisos);
		return confirmado(contexto, quien, existente, revisado.renglones, revisado.diasCredito, llega, avisos);
	}
	if (
		datos.cliente_id === undefined ||
		datos.fecha_entrega === undefined ||
		datos.forma_pago === undefined ||
		datos.renglones === undefined
	) {
		throw errorDeCampo(
			datos.cliente_id === undefined ? "cliente_id" : datos.fecha_entrega === undefined ? "fecha_entrega" : "renglones",
			datos.cliente_id === undefined
				? "Escoge el cliente."
				: datos.fecha_entrega === undefined
					? "Pon la fecha de entrega."
					: "Agrega al menos una prenda con piezas.",
		);
	}
	llega = {
		cliente_id: datos.cliente_id,
		fecha_entrega: datos.fecha_entrega,
		forma_pago: datos.forma_pago,
		renglones: datos.renglones,
	};
	revisarEntrega(contexto, llega.fecha_entrega);
	const revisado = await pedidoRevisado(contexto, llega, "confirmar");
	const nuevo = await pedidoNuevo(contexto, llega, revisado.diasCredito, true);
	await escribirRenglonesDelBorrador(contexto, nuevo.id, revisado.renglones, true);
	const pedido = await leerPedido(transaccion, nuevo.id);
	return confirmado(contexto, quien, pedido, revisado.renglones, revisado.diasCredito, llega, revisado.avisos);
});

/**
 * Lo último de confirmar: la versión 1, el evento, la bitácora con los renglones y su precio, y la respuesta.
 * @returns La respuesta de `ventas.confirmar_pedido`.
 */
async function confirmado(
	contexto: ContextoDeAccion,
	quien: string,
	pedido: { id: string; folio: string; cliente: string },
	renglones: readonly RenglonConPrecio[],
	diasCredito: number,
	llega: PedidoQueLlega,
	avisos: string[],
) {
	await escribirVersion(contexto, pedido.id, 1, "confirmacion", {
		fechaEntrega: llega.fecha_entrega,
		formaPago: llega.forma_pago,
		diasCredito,
	});
	eventoDePedido(contexto, "pedido.confirmado", pedido);
	contexto.bitacora({
		descripcion: `${quien} lo confirmó; el precio quedó congelado`,
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		despues: {
			renglones: renglones.map((renglon) => ({
				variante_id: renglon.varianteId,
				cantidad: renglon.cantidad,
				precio_unitario_centavos: renglon.precioUnitarioCentavos,
			})),
		},
	});
	return {
		resultado: {
			mensaje: `${pedido.folio} confirmado para ${pedido.cliente}. El precio quedó congelado.`,
			pedido_id: pedido.id,
			folio: pedido.folio,
			total_centavos: totalDe(renglones),
			por_mandar: renglones.reduce((total, renglon) => total + renglon.cantidad, 0),
			version: await versionActual(contexto.transaccion, pedidos, pedido.id),
		},
		avisos,
		entidad: { nombre: "pedidos", id: pedido.id },
	};
}

/**
 * Deja entregado un pedido cuando lo entregado cubre lo pedido en cada talla (regla 8): su anticipo sin usar pasa a
 * favor del cliente y avisa `pedido.entregado`.
 * @param contexto El contexto de la acción.
 * @param pedido El pedido, confirmado.
 * @param tallas Su avance de ahora.
 * @returns Si quedó entregado.
 */
export async function entregarSiCubre(
	contexto: ContextoDeAccion,
	pedido: PedidoConCliente,
	tallas: readonly AvanceDeTalla[],
): Promise<boolean> {
	if (tallas.length === 0 || tallas.some((talla) => talla.entregado < talla.pedido)) return false;
	await contexto.transaccion
		.update(pedidos)
		.set({ estado: "entregado", entregadoEn: contexto.ahora.toString() })
		.where(eq(pedidos.id, pedido.id));
	await contexto.interna("contaduria.pasar_anticipo_a_favor", { pedido_id: pedido.id, causa: "pedido_entregado" });
	eventoDePedido(contexto, "pedido.entregado", pedido);
	return true;
}

export const accionGuardarVersionPedido = implementarAccion(guardarVersionPedido, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
	const pedido = await pedidoConSuVersion(contexto, datos.pedido_id, version);
	if (pedido.estado !== "confirmado") {
		throw errorDeRegla(
			"pedido_no_confirmado",
			`${pedido.folio} está ${pedido.estado}: solo un pedido confirmado guarda versiones.`,
		);
	}
	if (pedido.clienteId !== datos.cliente_id) {
		throw errorDeRegla("cliente_no_cambia", "El cliente no cambia en un pedido que ya existe.");
	}
	revisarEntrega(contexto, datos.fecha_entrega, pedido.fechaEntrega);
	const actuales = await renglonesVigentes(transaccion, pedido.id);
	const { variantes, avisos } = await revisarRenglones(contexto, datos.renglones);
	// Qué cambia: renglones que cambian sus piezas o su precio dado, los que llegan y los que se quitan.
	const cambiados = datos.renglones.filter((renglon) => {
		const actual = actuales.find((uno) => uno.varianteId === renglon.variante_id);
		return (
			actual === undefined ||
			actual.cantidad !== renglon.cantidad ||
			(renglon.precio_dado_centavos !== undefined && renglon.precio_dado_centavos !== actual.precioDadoCentavos)
		);
	});
	const quitados = actuales.filter(
		(actual) => !datos.renglones.some((renglon) => renglon.variante_id === actual.varianteId),
	);
	const cambiaForma = datos.fecha_entrega !== pedido.fechaEntrega || datos.forma_pago !== pedido.formaPago;
	if (cambiados.length === 0 && quitados.length === 0 && !cambiaForma) {
		throw errorDeRegla("sin_cambios", "Sin cambios");
	}
	const totalAntes = actuales.reduce((total, actual) => total + actual.cantidad, 0);
	const totalDespues = datos.renglones.reduce((total, renglon) => total + renglon.cantidad, 0);
	const cliente = await revisarCliente(
		contexto,
		pedido.clienteId,
		datos.forma_pago,
		"version",
		totalDespues > totalAntes,
	);
	// Ninguna talla baja de su mínimo y no se quita una prenda con piezas entregadas, en nota o en aduana (regla 6).
	const avance = await avanceDeLasTallas(contexto, pedido.id, actuales);
	const minimoDe = (varianteId: string) => {
		const talla = avance.find((una) => una.varianteId === varianteId);
		return talla === undefined ? 0 : talla.entregado + talla.enNota + talla.listo;
	};
	for (const quitado of quitados) {
		if (minimoDe(quitado.varianteId) > 0) {
			const { variantes: suya } = await revisarRenglones(contexto, [{ variante_id: quitado.varianteId, cantidad: 1 }]);
			throw errorDeRegla(
				"prenda_no_se_quita",
				`${suya.get(quitado.varianteId)?.prenda ?? "La prenda"} ya tiene piezas entregadas o en aduana: no se puede quitar.`,
			);
		}
	}
	for (const renglon of datos.renglones) {
		const minimo = minimoDe(renglon.variante_id);
		if (renglon.cantidad < minimo) {
			const variante = variantes.get(renglon.variante_id);
			throw errorDeRegla(
				"talla_bajo_minimo",
				`${variante?.prenda ?? "La prenda"} talla ${variante?.talla ?? ""}: mínimo ${minimo}.`,
			);
		}
	}
	const numero = pedido.versionVigente + 1;
	const ahora = contexto.ahora.toString();
	// Los renglones que cambian se cierran en esta versión y nacen los nuevos con su precio congelado (regla 6).
	const cerrar = [
		...quitados,
		...actuales.filter((actual) => cambiados.some((renglon) => renglon.variante_id === actual.varianteId)),
	];
	if (cerrar.length > 0) {
		await transaccion
			.update(pedidoRenglones)
			.set({ hastaVersion: numero })
			.where(
				inArray(
					pedidoRenglones.id,
					cerrar.map((uno) => uno.id),
				),
			);
	}
	const nuevos: { variante: string; antes: Renglon | undefined; cantidad: number }[] = [];
	for (const renglon of cambiados) {
		const antes = actuales.find((actual) => actual.varianteId === renglon.variante_id);
		const variante = variantes.get(renglon.variante_id);
		if (variante === undefined) throw errorDeCampo("renglones", "Pon las piezas por talla");
		// Solo cambian las piezas (sin precio dado, o el mismo que tenía): conserva lo congelado; con precio dado nuevo o
		// talla nueva, el de hoy (decisión 681).
		const mismoPrecio =
			renglon.precio_dado_centavos === undefined || renglon.precio_dado_centavos === antes?.precioDadoCentavos;
		const precio =
			antes !== undefined && mismoPrecio
				? {
						precioSugeridoCentavos: antes.precioSugeridoCentavos,
						origenSugerido: antes.origenSugerido,
						porcentajeAplicado: antes.porcentajeAplicado,
						precioDadoCentavos: antes.precioDadoCentavos,
						recargoEspecialCentavos: antes.recargoEspecialCentavos,
						precioUnitarioCentavos: antes.precioUnitarioCentavos,
					}
				: await precioDeHoy(contexto, pedido.clienteId, variante, renglon.precio_dado_centavos);
		await transaccion.insert(pedidoRenglones).values({
			id: uuidv7(),
			pedidoId: pedido.id,
			varianteId: renglon.variante_id,
			cantidad: renglon.cantidad,
			desdeVersion: numero,
			...precio,
			congeladoEn: ahora,
			creadoPor: quienCambia(contexto),
		});
		nuevos.push({ variante: `${variante.prenda} talla ${variante.talla}`, antes, cantidad: renglon.cantidad });
	}
	await transaccion
		.update(pedidos)
		.set({
			versionVigente: numero,
			fechaEntrega: datos.fecha_entrega,
			formaPago: datos.forma_pago,
			diasCredito: cliente.diasCredito,
		})
		.where(eq(pedidos.id, pedido.id));
	const versionId = await escribirVersion(contexto, pedido.id, numero, "modificacion", {
		fechaEntrega: datos.fecha_entrega,
		formaPago: datos.forma_pago,
		diasCredito: cliente.diasCredito,
	});
	// Si cambió la fecha, Producción la pasa a sus órdenes y sus lotes (regla 7).
	if (datos.fecha_entrega !== pedido.fechaEntrega) {
		await contexto.interna("produccion.cambiar_fecha_entrega_pedido", {
			pedido_id: pedido.id,
			fecha_entrega: datos.fecha_entrega,
		});
	}
	// Lo apartado en Bodega que sobra al bajar una talla se libera.
	const despues = await avanceDeLasTallas(
		contexto,
		pedido.id,
		datos.renglones.map((renglon) => ({ varianteId: renglon.variante_id, cantidad: renglon.cantidad })),
	);
	const sobra = despues
		.map((talla) => ({
			variante_id: talla.varianteId,
			piezas: Math.min(
				talla.deBodega,
				Math.max(0, talla.entregado + talla.enNota + talla.listo + talla.deBodega - talla.pedido),
			),
		}))
		.filter((talla) => talla.piezas > 0);
	if (sobra.length > 0) {
		await contexto.interna("inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido.id,
			motivo_fin: "quitada_del_pedido",
			documento_cancelado: false,
			piezas: sobra,
		});
	}
	const porMandar = despues.reduce((total, talla) => total + talla.porMandar, 0);
	const deMas = despues.reduce((total, talla) => total + talla.deMas, 0);
	// Con piezas de más en producción, nace el cambio para Producción (regla 7).
	if (deMas > 0) {
		await contexto.interna("produccion.crear_cambio_pedido", { pedido_id: pedido.id, pedido_version_id: versionId });
	}
	await entregarSiCubre(contexto, pedido, despues);
	eventoDePedido(contexto, "pedido.version_guardada", pedido);
	const textoDeCambios = [
		...nuevos.map((nuevo) =>
			nuevo.antes === undefined
				? `agregó ${nuevo.variante} (${nuevo.cantidad})`
				: `${nuevo.variante} de ${nuevo.antes.cantidad} a ${nuevo.cantidad}`,
		),
		...quitados.map((quitado) => `quitó una talla (${quitado.cantidad})`),
		...(datos.fecha_entrega !== pedido.fechaEntrega ? [`entrega ${pedido.fechaEntrega} → ${datos.fecha_entrega}`] : []),
		...(datos.forma_pago !== pedido.formaPago ? [`forma de pago ${pedido.formaPago} → ${datos.forma_pago}`] : []),
	].join(", ");
	contexto.bitacora({
		descripcion: `${quien} guardó la versión ${numero}: ${textoDeCambios}`,
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		antes: {
			fecha_entrega: pedido.fechaEntrega,
			forma_pago: pedido.formaPago,
			renglones: cerrar.map((uno) => ({ variante_id: uno.varianteId, cantidad: uno.cantidad })),
		},
		despues: {
			fecha_entrega: datos.fecha_entrega,
			forma_pago: datos.forma_pago,
			renglones: cambiados.map((renglon) => ({ variante_id: renglon.variante_id, cantidad: renglon.cantidad })),
		},
	});
	const partes = [
		...(porMandar > 0 ? [`faltan ${porMandar} piezas por mandar a producción`] : []),
		...(deMas > 0 ? ["Producción ajusta sus lotes"] : []),
	];
	return {
		resultado: {
			mensaje:
				partes.length === 0
					? `${pedido.folio} versión ${numero} guardada`
					: `${pedido.folio} versión ${numero}: ${partes.join("; ")}`,
			pedido_id: pedido.id,
			numero,
			por_mandar: porMandar,
			de_mas: deMas,
			version: await versionActual(transaccion, pedidos, pedido.id),
		},
		avisos: [
			...cliente.avisos,
			...avisos,
			...(deMas > 0 ? [`Sobran ${deMas} piezas en producción: Producción ajusta sus lotes`] : []),
		],
		entidad: { nombre: "pedidos", id: pedido.id },
	};
});

export const accionCancelarPedido = implementarAccion(cancelarPedido, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const quien = await nombreDeCuenta(contexto, quienCambia(contexto));
	const pedido = await pedidoConSuVersion(contexto, datos.pedido_id, version);
	if (pedido.estado === "entregado" || pedido.estado === "cancelado") {
		throw errorDeRegla("pedido_terminado", `${pedido.folio} ya está ${pedido.estado}.`);
	}
	// Solo sin notas de entrega no canceladas (regla 9).
	if ((await notasDelPedido(transaccion, pedido.id)).cuantas > 0) {
		throw errorDeRegla("pedido_con_notas", `${pedido.folio} ya tiene notas de entrega: no se puede cancelar.`);
	}
	const motivo = datos.motivo.trim();
	await transaccion
		.update(pedidos)
		.set({
			estado: "cancelado",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quienCambia(contexto),
			motivoCancelacion: motivo,
		})
		.where(eq(pedidos.id, pedido.id));
	// Un pedido confirmado: sus lotes pasan a temporada y sus reservas se liberan (regla 9).
	if (pedido.estado === "confirmado") {
		await contexto.interna("produccion.pasar_pedido_a_temporada", { pedido_id: pedido.id });
		await contexto.interna("inventario.liberar_reservas", {
			motivo: "pedido_externo",
			documento_id: pedido.id,
			motivo_fin: "documento_cancelado",
			documento_cancelado: true,
		});
	}
	await contexto.interna("contaduria.pasar_anticipo_a_favor", { pedido_id: pedido.id, causa: "pedido_cancelado" });
	eventoDePedido(contexto, "pedido.cancelado", pedido);
	contexto.bitacora({
		descripcion: `${quien} lo canceló: ${motivo}`,
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		antes: { estado: pedido.estado },
		despues: { estado: "cancelado", motivo },
	});
	return {
		resultado: {
			mensaje: `${pedido.folio} cancelado. Queda en el historial con su motivo`,
			pedido_id: pedido.id,
			version: await versionActual(transaccion, pedidos, pedido.id),
		},
		entidad: { nombre: "pedidos", id: pedido.id },
	};
});
