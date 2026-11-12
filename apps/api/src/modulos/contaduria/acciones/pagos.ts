/**
 * `contaduria.registrar_pago_recibido` y `contaduria.cancelar_pago`: Contaduría registra el pago de un cliente a una
 * nota entregada, y lo cancela si se registró mal.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 1 a 5, 9 y 10, «Acciones»)
 * Fase 17 · el depósito a la cuenta de un tercero (`medio = cuenta_tercero`) y, al cancelar, sus aplicaciones a
 * cuentas por pagar («Lo que se agrega después a estas acciones»)
 *
 * Registrar toma primero los documentos de la deuda a la que se aplica un depósito (`dominio/cuentas-por-pagar.ts`),
 * luego la cuenta de la nota (o el anticipo del pedido), la deuda y después el folio PG-: dos pagos a la vez a la misma
 * nota se ponen en fila y el segundo ve el saldo que dejó el primero. Cancelar toma los documentos de sus cuentas por pagar, el pago con su versión,
 * después el anticipo de su pedido, el saldo a favor del cliente y sus cuentas en orden de id.
 */

import { cancelarPago, registrarPagoRecibido } from "@uniformame/compartido/contratos/contaduria/pagos";
import { and, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import { cancelarAnticipoDelPago, pedidoQueRecibe, recibirAnticipo } from "../dominio/anticipos.ts";
import { creditoDelCliente } from "../dominio/credito.ts";
import {
	aplicarACuenta,
	bloquearCuentaDeNota,
	foliosDeVentas,
	regresarAplicacionesPorCobrar,
} from "../dominio/cuentas.ts";
import {
	aplicacionesPorPagarDe,
	bloquearCuentasPorPagar,
	bloquearDocumentosDeCuentas,
	type DocumentosDeCuentas,
	regresarAplicacionesPorPagar,
} from "../dominio/cuentas-por-pagar.ts";
import { aplicarDeposito } from "../dominio/depositos.ts";
import { avisoDePagoRepetido, enPesos, revisarMedio, revisarPesosEnteros } from "../dominio/pagos.ts";
import { bloquearSaldoAFavor } from "../dominio/saldo-favor.ts";
import { cuentasPorPagar, pagos, saldoFavorMovimientos, terceros } from "../tablas.ts";

/** Lo que llega de un depósito a la cuenta de un tercero, ya revisado. */
interface DepositoPedido {
	terceroId: string;
	tercero: string;
	/** Con «Ahora»: la deuda a la que se aplica y sus documentos, ya bloqueados. */
	ahora?: { cuentaPorPagarId: string; documentos: DocumentosDeCuentas };
}

/**
 * Revisa un depósito a la cuenta de un tercero: a quién se le depositó, que se le deba algo y, con «Ahora», la deuda,
 * cuyos documentos bloquea antes que todo lo demás.
 * @returns El depósito, o nada si el pago no fue a la cuenta de un tercero.
 * @throws `400` en `tercero_deposito_id` o `cuenta_por_pagar_id`; `422 tercero_sin_deuda`.
 */
async function revisarDeposito(
	contexto: ContextoDeAccion,
	datos: {
		medio: string;
		tercero_deposito_id?: string | undefined;
		aplicar?: string | undefined;
		cuenta_por_pagar_id?: string | undefined;
	},
): Promise<DepositoPedido | undefined> {
	if (datos.medio !== "cuenta_tercero") {
		if (datos.tercero_deposito_id !== undefined || datos.cuenta_por_pagar_id !== undefined) {
			throw errorDeCampo("medio", "Escoge «Cuenta de un tercero» para aplicarlo a una deuda.");
		}
		return undefined;
	}
	if (datos.tercero_deposito_id === undefined) throw errorDeCampo("tercero_deposito_id", "¿A quién le depositó?");
	const ahora = datos.aplicar === "ahora";
	if (ahora && datos.cuenta_por_pagar_id === undefined) throw errorDeCampo("cuenta_por_pagar_id", "Escoge la deuda.");
	const documentos =
		ahora && datos.cuenta_por_pagar_id !== undefined
			? await bloquearDocumentosDeCuentas(contexto, [datos.cuenta_por_pagar_id])
			: undefined;
	const [tercero] = await contexto.transaccion
		.select({ nombre: terceros.nombre })
		.from(terceros)
		.where(eq(terceros.id, datos.tercero_deposito_id));
	if (tercero === undefined) throw errorDeCampo("tercero_deposito_id", "¿A quién le depositó?");
	const [deuda] = await contexto.transaccion
		.select({ id: cuentasPorPagar.id })
		.from(cuentasPorPagar)
		.where(
			and(
				eq(cuentasPorPagar.terceroId, datos.tercero_deposito_id),
				inArray(cuentasPorPagar.estado, ["detenida", "por_pagar", "pagada_en_parte"]),
			),
		)
		.limit(1);
	if (deuda === undefined) {
		throw errorDeRegla("tercero_sin_deuda", `A ${tercero.nombre} no se le debe nada: escoge a quién le depositó.`);
	}
	return {
		terceroId: datos.tercero_deposito_id,
		tercero: tercero.nombre,
		...(documentos === undefined || datos.cuenta_por_pagar_id === undefined
			? {}
			: { ahora: { cuentaPorPagarId: datos.cuenta_por_pagar_id, documentos } }),
	};
}

/** Lo que regresa registrar un pago, antes de aplicar su depósito. */
interface PagoRegistrado {
	resultado: { mensaje: string; pago_id: string; folio: string; saldo_centavos?: number };
	avisos: string[];
	entidad: { nombre: "pagos"; id: string };
}

/**
 * Lo que sigue a un depósito a la cuenta de un tercero ya registrado: con «Ahora», se aplica a la deuda, con su
 * renglón de bitácora; si no, queda sin aplicar.
 * @param contexto El contexto de la acción.
 * @param registrado Lo que regresó registrar el pago.
 * @param deposito El depósito revisado.
 * @param monto El monto del pago.
 * @param cliente El nombre del cliente.
 */
async function seguirDeposito(
	contexto: ContextoDeAccion,
	registrado: PagoRegistrado,
	deposito: DepositoPedido,
	monto: number,
	cliente: string,
): Promise<PagoRegistrado> {
	const { pago_id: pagoId, folio } = registrado.resultado;
	if (deposito.ahora === undefined) {
		return {
			...registrado,
			resultado: { ...registrado.resultado, mensaje: `${folio} registrado. Queda sin aplicar a ${deposito.tercero}` },
		};
	}
	const aplicado = await aplicarDeposito(
		contexto,
		{ id: pagoId, folio, montoCentavos: monto, terceroDepositoId: deposito.terceroId },
		deposito.ahora.cuentaPorPagarId,
		deposito.ahora.documentos,
	);
	contexto.bitacora({
		descripcion: `Aplicó ${folio} a ${aplicado.documento} de ${aplicado.tercero}`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { saldo_deuda_centavos: aplicado.saldoAntes },
		despues: { saldo_deuda_centavos: aplicado.saldoDespues, queda_centavos: aplicado.queda },
	});
	return {
		...registrado,
		resultado: {
			...registrado.resultado,
			mensaje: `${folio}: ${enPesos(monto)} de ${cliente}, aplicado a ${aplicado.documento}`,
		},
		avisos: [
			...registrado.avisos,
			...(aplicado.queda > 0 ? [`Quedan ${enPesos(aplicado.queda)} a favor con ${aplicado.tercero}`] : []),
		],
	};
}

export const accionRegistrarPagoRecibido = implementarAccion(registrarPagoRecibido, async (contexto, datos) => {
	const { transaccion } = contexto;
	// Un depósito a la cuenta de un tercero: los documentos de su deuda, antes que todo (el orden de los candados).
	const deposito = await revisarDeposito(contexto, datos);
	const { cuentaFabricaId, referencia } = await revisarMedio(transaccion, datos, false);
	const credito = await creditoDelCliente(transaccion, datos.cliente_id);
	if (deposito !== undefined && deposito.terceroId === credito.terceroId) {
		throw errorDeCampo("tercero_deposito_id", "¿A quién le depositó?");
	}
	if ((datos.nota_entrega_id === undefined) === (datos.pedido_id === undefined)) {
		throw errorDeCampo("nota_entrega_id", "Escoge la nota o el pedido.");
	}
	// La deuda del depósito se bloquea después de la cuenta de la nota o del anticipo y antes del folio.
	const deuda = deposito?.ahora?.cuentaPorPagarId;
	const medio: MedioRevisado = {
		medio: datos.medio,
		cuentaFabricaId,
		referencia,
		terceroDepositoId: deposito?.terceroId ?? null,
		antesDelFolio: () => bloquearCuentasPorPagar(transaccion, deuda === undefined ? [] : [deuda]),
	};
	// A un pedido: entra como anticipo recibido, sin aplicación (regla 4).
	const registrado =
		datos.pedido_id !== undefined
			? await pagoAPedido(contexto, { ...datos, pedido_id: datos.pedido_id }, credito, medio)
			: await pagoANota(contexto, { ...datos, nota_entrega_id: datos.nota_entrega_id ?? "" }, credito, medio);
	return deposito === undefined
		? registrado
		: seguirDeposito(contexto, registrado, deposito, datos.monto_centavos, credito.cliente);
});

/** Dónde se recibió el dinero, ya revisado. */
interface MedioRevisado {
	medio: "efectivo" | "cuenta_fabrica" | "cuenta_tercero";
	cuentaFabricaId: string | null;
	referencia: string | null;
	terceroDepositoId: string | null;
	/** Lo que se bloquea justo antes del folio: la deuda a la que se aplica el depósito. */
	antesDelFolio: () => Promise<unknown>;
}

/**
 * Un pago a una nota entregada: una aplicación a su cuenta por cobrar por el monto completo (regla 4), hasta su saldo.
 * Toma el candado de la cuenta de la nota y después el folio PG-.
 * @returns Lo que regresa registrar el pago.
 */
async function pagoANota(
	contexto: ContextoDeAccion,
	datos: { cliente_id: string; nota_entrega_id: string; monto_centavos: number },
	credito: { cliente: string; terceroId: string },
	{ medio, cuentaFabricaId, referencia, terceroDepositoId, antesDelFolio }: MedioRevisado,
): Promise<PagoRegistrado> {
	const { transaccion } = contexto;
	const notaId = datos.nota_entrega_id;
	// La cuenta de la nota, bloqueada: desde aquí nadie más mueve su saldo (regla 9).
	const cuenta = await bloquearCuentaDeNota(transaccion, notaId);
	const folios = await foliosDeVentas(contexto, { nota_entrega_ids: [notaId] });
	const nota = folios.get(notaId) ?? "La nota";
	if (cuenta === undefined) {
		throw errorDeRegla("nota_sin_entregar", `${nota} todavía no se entrega: se cobra al confirmar la entrega.`);
	}
	if (cuenta.clienteId !== datos.cliente_id) {
		throw errorDeRegla("documento_de_otro_cliente", `${nota} no es de ${credito.cliente}.`);
	}
	if (datos.monto_centavos > cuenta.saldoCentavos) {
		throw errorDeRegla("monto_mayor_que_saldo", `El saldo de ${nota} es ${enPesos(cuenta.saldoCentavos)}.`);
	}
	revisarPesosEnteros(datos.monto_centavos, cuenta.saldoCentavos);
	const avisos = await avisoDePagoRepetido(transaccion, referencia, datos.monto_centavos);
	await antesDelFolio();
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "pago" }));
	const pagoId = uuidv7();
	await transaccion.insert(pagos).values({
		id: pagoId,
		folio,
		direccion: "recibido",
		concepto: "nota",
		fecha: contexto.diaDeNegocio.toString(),
		terceroId: cuenta.terceroId,
		clienteId: datos.cliente_id,
		notaEntregaId: notaId,
		montoCentavos: datos.monto_centavos,
		medio,
		cuentaFabricaId,
		terceroDepositoId,
		referencia,
		creadoPor: quienCambia(contexto),
	});
	// El pago a una nota es una aplicación por el monto completo (regla 4).
	const saldo = await aplicarACuenta(contexto, cuenta, datos.monto_centavos, { pagoId });
	contexto.guardarEvento({
		tipo: "pago.recibido",
		datos: { pago_id: pagoId, cliente_id: datos.cliente_id, nota_entrega_id: notaId },
		tablas: ["pagos", "aplicaciones_pago", "cuentas_por_cobrar"],
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `Registró el pago ${folio} de ${credito.cliente} por ${enPesos(datos.monto_centavos)}`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { saldo_centavos: cuenta.saldoCentavos },
		despues: { saldo_centavos: saldo, monto_centavos: datos.monto_centavos },
	});
	return {
		resultado: {
			mensaje: `${folio}: ${enPesos(datos.monto_centavos)} de ${credito.cliente}`,
			pago_id: pagoId,
			folio,
			saldo_centavos: saldo,
		},
		avisos,
		entidad: { nombre: "pagos", id: pagoId },
	};
}

/**
 * Un pago a un pedido confirmado: entra como anticipo recibido, hasta lo que le falta al pedido, en pesos enteros.
 * Toma el candado del anticipo del pedido y después el folio PG-.
 * @returns La respuesta de `contaduria.registrar_pago_recibido`.
 */
async function pagoAPedido(
	contexto: ContextoDeAccion,
	datos: { cliente_id: string; pedido_id: string; monto_centavos: number },
	credito: { cliente: string; terceroId: string },
	{ medio, cuentaFabricaId, referencia, terceroDepositoId, antesDelFolio }: MedioRevisado,
): Promise<PagoRegistrado> {
	const { transaccion } = contexto;
	const pedido = await pedidoQueRecibe(contexto, datos.pedido_id, { id: datos.cliente_id, nombre: credito.cliente });
	if (datos.monto_centavos > pedido.falta) {
		throw errorDeRegla("monto_mayor_que_saldo", `El saldo de ${pedido.folio} es ${enPesos(pedido.falta)}.`);
	}
	if (datos.monto_centavos % 100 !== 0) throw errorDeCampo("monto_centavos", "Escribe el monto en pesos");
	const avisos = await avisoDePagoRepetido(transaccion, referencia, datos.monto_centavos);
	await antesDelFolio();
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "pago" }));
	const pagoId = uuidv7();
	await transaccion.insert(pagos).values({
		id: pagoId,
		folio,
		direccion: "recibido",
		concepto: "pedido",
		fecha: contexto.diaDeNegocio.toString(),
		terceroId: credito.terceroId,
		clienteId: datos.cliente_id,
		pedidoId: datos.pedido_id,
		montoCentavos: datos.monto_centavos,
		medio,
		cuentaFabricaId,
		terceroDepositoId,
		referencia,
		creadoPor: quienCambia(contexto),
	});
	await recibirAnticipo(contexto, {
		pedidoId: datos.pedido_id,
		clienteId: datos.cliente_id,
		montoCentavos: datos.monto_centavos,
		origen: { pagoId },
	});
	contexto.guardarEvento({
		tipo: "pago.recibido",
		datos: { pago_id: pagoId, cliente_id: datos.cliente_id, pedido_id: datos.pedido_id },
		tablas: ["pagos", "anticipos"],
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `Registró el pago ${folio} de ${credito.cliente} por ${enPesos(datos.monto_centavos)}`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { falta_centavos: pedido.falta },
		despues: { falta_centavos: pedido.falta - datos.monto_centavos, monto_centavos: datos.monto_centavos },
	});
	return {
		resultado: {
			mensaje: `${folio}: ${enPesos(datos.monto_centavos)} de ${credito.cliente}`,
			pago_id: pagoId,
			folio,
		},
		avisos,
		entidad: { nombre: "pagos", id: pagoId },
	};
}

export const accionCancelarPago = implementarAccion(cancelarPago, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const leer = async () => {
		const [pago] = await transaccion
			.select({ fila: pagos, tercero: terceros.nombre })
			.from(pagos)
			.innerJoin(terceros, eq(terceros.id, pagos.terceroId))
			.where(eq(pagos.id, datos.pago_id));
		return pago;
	};
	const visible = async () => {
		const pago = await leer();
		return pago === undefined ? undefined : { pago_id: pago.fila.id, folio: pago.fila.folio, estado: pago.fila.estado };
	};
	// Los documentos de sus cuentas por pagar primero (el orden de los candados), luego el pago con su versión.
	await bloquearDocumentosDeCuentas(
		contexto,
		(await aplicacionesPorPagarDe(transaccion, { pagoId: datos.pago_id })).map((aplicacion) => aplicacion.cuentaId),
	);
	await tomarVersion(contexto, pagos, datos.pago_id, version, visible);

	const leido = await leer();
	if (leido === undefined) throw noExiste();
	const { fila: pago } = leido;
	if (pago.estado === "cancelado") throw errorDeRegla("pago_cancelado", `${pago.folio} ya está cancelado.`);
	const motivo = datos.motivo.trim();
	const quien = quienCambia(contexto);
	// Su anticipo recibido y lo que el pedido pasó a favor con él (regla 5).
	const anticipo = await cancelarAnticipoDelPago(contexto, pago, motivo);
	// Una devolución de saldo a favor: su `devuelto` se cancela y el saldo a favor regresa.
	if (pago.concepto === "devolucion_saldo_favor" && pago.clienteId !== null) {
		await bloquearSaldoAFavor(transaccion, pago.clienteId);
		await transaccion
			.update(saldoFavorMovimientos)
			.set({
				estado: "cancelado",
				canceladoEn: contexto.ahora.toString(),
				canceladoPor: quien,
				motivoCancelacion: motivo,
			})
			.where(and(eq(saldoFavorMovimientos.pagoId, pago.id), eq(saldoFavorMovimientos.estado, "vigente")));
	}
	await transaccion
		.update(pagos)
		.set({
			estado: "cancelado",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: motivo,
		})
		.where(eq(pagos.id, pago.id));
	// Sus aplicaciones se cancelan y el saldo, el estado y `pagada_en` de sus cuentas regresan.
	const cuentas = await regresarAplicacionesPorCobrar(contexto, { pagoId: pago.id }, motivo);
	const porPagar = await regresarAplicacionesPorPagar(contexto, { pagoId: pago.id }, motivo);
	contexto.guardarEvento({
		tipo: "pago.cancelado",
		datos: { pago_id: pago.id, cliente_id: pago.clienteId },
		tablas: [
			"pagos",
			"aplicaciones_pago",
			"cuentas_por_cobrar",
			"cuentas_por_pagar",
			"anticipos",
			"saldo_favor_movimientos",
			// Compras se entera si una factura dejó de estar pagada (decisión 716).
			...(porPagar.conFacturas ? ["facturas_proveedor"] : []),
		],
		entidad: "pagos",
		entidadId: pago.id,
		entidadFolio: pago.folio,
	});
	contexto.bitacora({
		descripcion: `Canceló el pago ${pago.folio}: ${motivo}`,
		entidad: "pagos",
		entidadId: pago.id,
		entidadFolio: pago.folio,
		antes: {
			estado: pago.estado,
			cuentas: cuentas.map(({ cuenta_por_cobrar_id, antes }) => ({ cuenta_por_cobrar_id, saldo_centavos: antes })),
			cuentas_por_pagar: porPagar.cuentas.map(({ cuenta_por_pagar_id, antes }) => ({
				cuenta_por_pagar_id,
				saldo_centavos: antes,
			})),
		},
		despues: {
			estado: "cancelado",
			cuentas: cuentas.map(({ cuenta_por_cobrar_id, despues }) => ({ cuenta_por_cobrar_id, saldo_centavos: despues })),
			cuentas_por_pagar: porPagar.cuentas.map(({ cuenta_por_pagar_id, despues }) => ({
				cuenta_por_pagar_id,
				saldo_centavos: despues,
			})),
			anticipo_cancelado_centavos: anticipo.anticipo_centavos,
			a_favor_cancelado_centavos: anticipo.a_favor_centavos,
		},
		confirmadoConGoogleEn: confirmadoConGoogle(contexto),
	});
	for (const revisada of porPagar.facturasRevisadas) {
		contexto.bitacora({
			descripcion: revisada.descripcion,
			entidad: "facturas_proveedor",
			entidadId: revisada.factura_proveedor_id,
			entidadFolio: revisada.folio,
			despues: { estado: revisada.estado },
		});
	}
	for (const orden of porPagar.ordenesReabiertas) {
		contexto.bitacora({
			descripcion: `${orden} vuelve a Recibida: se canceló su pago`,
			entidad: "pagos",
			entidadId: pago.id,
			entidadFolio: pago.folio,
		});
	}
	return {
		resultado: {
			mensaje: `${pago.folio} cancelado`,
			pago_id: pago.id,
			version: await versionActual(transaccion, pagos, pago.id),
		},
		entidad: { nombre: "pagos", id: pago.id },
	};
});
