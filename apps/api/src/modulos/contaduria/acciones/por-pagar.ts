/**
 * Las cuentas por pagar: pagarlas, todo o una parte, con «Confirmar con Google», y pedir a Dirección pagar lo recibido
 * de una factura que cobra de más.
 * Fase 17 · docs/modulos/contaduria/cuentas-por-pagar.md (reglas 3 a 6, «Acciones»)
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { pagarCuentaPorPagar, pedirPagoLoRecibido } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle } from "../../admin/dominio/cuentas.ts";
import {
	alPagarse,
	aplicarACuentaPorPagar,
	bloquearCuentasPorPagar,
	bloquearDocumentosDeCuentas,
	documentoDeCuenta,
} from "../dominio/cuentas-por-pagar.ts";
import { bloquearFactura, montoLoRecibido, nombreDelTercero } from "../dominio/facturas.ts";
import { avisoDePagoRepetido, revisarMedio, revisarPesosEnteros } from "../dominio/pagos.ts";
import { cuentasPorPagar, facturasProveedor, pagos } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `direccion.pedir_autorizacion`. */
const autorizacionPedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() });

export const accionPagarCuentaPorPagar = implementarAccion(pagarCuentaPorPagar, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	// Sus documentos primero (las órdenes de su factura o su deuda), luego la cuenta: dos pagos a la vez no pasan del
	// saldo, y el segundo ve si con el primero ya quedó pagado todo lo de la orden o de la deuda.
	const documentos = await bloquearDocumentosDeCuentas(contexto, [datos.cuenta_por_pagar_id]);
	const cuenta = (await bloquearCuentasPorPagar(transaccion, [datos.cuenta_por_pagar_id])).get(
		datos.cuenta_por_pagar_id,
	);
	if (cuenta === undefined) throw noExiste();
	await tomarVersion(contexto, cuentasPorPagar, cuenta.id, version, async () => ({
		cuenta_por_pagar_id: cuenta.id,
		estado: cuenta.estado,
	}));
	const documento = await documentoDeCuenta(transaccion, cuenta);
	if (cuenta.estado === "cancelada") throw errorDeRegla("cuenta_cancelada", `${documento} está cancelada.`);
	if (cuenta.estado === "pagada") throw errorDeRegla("cuenta_pagada", `${documento} ya está pagada.`);
	if (cuenta.estado === "detenida") {
		throw errorDeRegla("cuenta_detenida", "Este pago está detenido: orden, recepción y factura no coinciden.");
	}
	if (datos.monto_centavos > cuenta.saldoCentavos) {
		throw errorDeCampo("monto_centavos", `Hasta ${enPesos(cuenta.saldoCentavos)}`);
	}
	revisarPesosEnteros(datos.monto_centavos, cuenta.saldoCentavos);
	const { cuentaFabricaId, referencia } = await revisarMedio(transaccion, datos, true);
	const avisos = await avisoDePagoRepetido(transaccion, referencia, datos.monto_centavos);
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "pago" }));
	const pagoId = uuidv7();
	const quien = quienCambia(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	await transaccion.insert(pagos).values({
		id: pagoId,
		folio,
		direccion: "emitido",
		concepto: "cuenta_por_pagar",
		fecha: contexto.diaDeNegocio.toString(),
		terceroId: cuenta.terceroId,
		montoCentavos: datos.monto_centavos,
		medio: datos.medio,
		cuentaFabricaId,
		referencia,
		confirmadoConGoogleEn: confirmado,
		creadoPor: quien,
	});
	const pagada = await aplicarACuentaPorPagar(contexto, cuenta, datos.monto_centavos, { pagoId });
	// Cuando queda pagada, Compras cierra la orden cuyas facturas quedaron todas pagadas y la deuda queda saldada.
	const cambiaron = pagada.estado === "pagada" ? await alPagarse(contexto, documentos) : { ordenes: [], deudas: [] };
	contexto.guardarEvento({
		tipo: "pago.emitido",
		datos: { pago_id: pagoId, cuenta_por_pagar_id: cuenta.id },
		tablas: ["pagos", "aplicaciones_pago", "cuentas_por_pagar"],
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
	});
	const beneficiario = await nombreDelTercero(transaccion, cuenta.terceroId);
	const monto = enPesos(datos.monto_centavos);
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} pagó ${monto} a ${beneficiario} (${documento})`,
		entidad: "pagos",
		entidadId: pagoId,
		entidadFolio: folio,
		antes: { saldo_centavos: cuenta.saldoCentavos, estado: cuenta.estado },
		despues: {
			saldo_centavos: pagada.saldoCentavos,
			estado: pagada.estado,
			...(cambiaron.ordenes.length === 0 ? {} : { ordenes_cerradas: cambiaron.ordenes }),
			...(cambiaron.deudas.length === 0 ? {} : { deudas_saldadas: cambiaron.deudas }),
		},
		confirmadoConGoogleEn: confirmado,
	});
	return {
		resultado: {
			mensaje: `${monto} pagados a ${beneficiario}`,
			pago_id: pagoId,
			folio,
			saldo_centavos: pagada.saldoCentavos,
		},
		avisos,
		entidad: { nombre: "pagos", id: pagoId },
	};
});

export const accionPedirPagoLoRecibido = implementarAccion(pedirPagoLoRecibido, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const factura = await bloquearFactura(transaccion, datos.factura_proveedor_id);
	await tomarVersion(contexto, facturasProveedor, factura.id, version, async () => ({
		factura_proveedor_id: factura.id,
		estado: factura.estado,
	}));
	if (factura.estado === "esperando_autorizacion") {
		throw errorDeRegla("ya_pedida", `${factura.folio} ya espera la decisión de Dirección.`);
	}
	if (factura.estado !== "detenida") throw errorDeRegla("factura_no_detenida", `${factura.folio} no está detenida.`);
	if (factura.responsableDetencion === "aduana") {
		throw errorDeRegla(
			"responsable_aduana",
			`${factura.folio} espera a que Aduana reciba la mercancía: no se puede pagar lo recibido.`,
		);
	}
	const monto = montoLoRecibido(factura);
	if (monto <= 0) throw errorDeRegla("nada_recibido", `De ${factura.folio} no queda nada recibido por pagar.`);
	const proveedor = await nombreDelTercero(transaccion, factura.terceroId);
	const [enTexto, facturado] = [enPesos(monto), enPesos(factura.totalFacturadoCentavos)];
	const pedida = autorizacionPedida.parse(
		await contexto.interna("direccion.pedir_autorizacion", {
			tipo: "pago_fuera_de_lo_normal",
			departamento_origen: "contaduria",
			resumen: `Pagar a ${proveedor} lo recibido: ${enTexto} en lugar de ${facturado}`,
			detalle: factura.motivoDetencion ?? undefined,
			documento: factura.folio,
			importe_centavos: monto,
			importe_facturado_centavos: factura.totalFacturadoCentavos,
			factura_proveedor_id: factura.id,
		}),
	);
	await transaccion
		.update(facturasProveedor)
		.set({ estado: "esperando_autorizacion", autorizacionId: pedida.autorizacion_id })
		.where(eq(facturasProveedor.id, factura.id));
	contexto.guardarEvento({
		tipo: "factura_proveedor.autorizacion_pedida",
		datos: { factura_proveedor_id: factura.id, autorizacion_id: pedida.autorizacion_id },
		tablas: ["facturas_proveedor"],
		entidad: "facturas_proveedor",
		entidadId: factura.id,
		entidadFolio: factura.folio,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quienCambia(contexto))} pidió pagar lo recibido de ${factura.folio}: ${enTexto} en lugar de ${facturado}`,
		entidad: "facturas_proveedor",
		entidadId: factura.id,
		entidadFolio: factura.folio,
		antes: { estado: factura.estado },
		despues: { estado: "esperando_autorizacion", autorizacion: pedida.folio },
	});
	return {
		resultado: {
			mensaje: "Solicitud enviada a Dirección: pago por lo recibido",
			autorizacion_id: pedida.autorizacion_id,
			folio: pedida.folio,
		},
		entidad: { nombre: "facturas_proveedor", id: factura.id },
	};
});
