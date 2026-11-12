/**
 * Los depósitos de un cliente a la cuenta de un tercero a quien la fábrica le debe: lo que queda de un depósito y
 * aplicarlo a una deuda con ese tercero.
 * Fase 17 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (regla 4, «`contaduria.aplicar_deposito_a_tercero`» y «Lo
 * que se agrega después a estas acciones»)
 *
 * Un depósito es un pago recibido con `medio = cuenta_tercero`: baja la cuenta por cobrar de su nota (o entra como
 * anticipo) por el monto completo y, además, se aplica a lo que la fábrica le debe a ese tercero, sin pasar del monto.
 * Lo que sobra queda a favor con el tercero y se aplica después a otra de sus deudas.
 */

import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	alPagarse,
	aplicacionesPorPagarDe,
	aplicarACuentaPorPagar,
	bloquearCuentasPorPagar,
	type DocumentosDeCuentas,
	type DocumentosQueCambiaron,
	documentoDeCuenta,
} from "./cuentas-por-pagar.ts";
import { nombreDelTercero } from "./facturas.ts";

/** Un depósito a la cuenta de un tercero, como lo usa quien lo aplica. */
export interface Deposito {
	id: string;
	folio: string;
	montoCentavos: number;
	/** El tercero a quien se le depositó. */
	terceroDepositoId: string;
}

/** Lo que dejó aplicar un depósito. */
export interface DepositoAplicado {
	documento: string;
	tercero: string;
	aplicado: number;
	/** Lo que queda del depósito, a favor con el tercero. */
	queda: number;
	saldoAntes: number;
	saldoDespues: number;
	cambiaron: DocumentosQueCambiaron;
}

/**
 * Lo que queda de un depósito: su monto menos lo vigente que ya se aplicó a cuentas por pagar.
 * @param contexto El contexto de la acción.
 * @param deposito El depósito.
 */
export async function loQueQuedaDelDeposito(
	contexto: ContextoDeAccion,
	deposito: Pick<Deposito, "id" | "montoCentavos">,
): Promise<number> {
	const aplicado = (await aplicacionesPorPagarDe(contexto.transaccion, { pagoId: deposito.id })).reduce(
		(suma, aplicacion) => suma + aplicacion.monto,
		0,
	);
	return deposito.montoCentavos - aplicado;
}

/**
 * Aplica lo que queda de un depósito a una cuenta por pagar de su tercero: lo menor entre lo que queda y el saldo de la
 * cuenta. Si la cuenta queda pagada, Compras cierra su orden y la deuda se salda. Quien llama ya tiene bloqueados los
 * documentos de la cuenta y el pago.
 * @param contexto El contexto de la acción.
 * @param deposito El depósito.
 * @param cuentaId La cuenta por pagar.
 * @param documentos Los documentos de esa cuenta, ya bloqueados.
 * @throws `404`; `422 deuda_de_otro_tercero`, `deuda_detenida`, `deuda_pagada`, `deuda_cancelada` o
 * `deposito_ya_aplicado`.
 */
export async function aplicarDeposito(
	contexto: ContextoDeAccion,
	deposito: Deposito,
	cuentaId: string,
	documentos: DocumentosDeCuentas,
): Promise<DepositoAplicado> {
	const { transaccion } = contexto;
	const cuenta = (await bloquearCuentasPorPagar(transaccion, [cuentaId])).get(cuentaId);
	if (cuenta === undefined) throw noExiste();
	const documento = await documentoDeCuenta(transaccion, cuenta);
	const tercero = await nombreDelTercero(transaccion, deposito.terceroDepositoId);
	if (cuenta.terceroId !== deposito.terceroDepositoId) {
		throw errorDeRegla("deuda_de_otro_tercero", `${documento} no es de ${tercero}.`);
	}
	if (cuenta.estado === "detenida") {
		throw errorDeRegla("deuda_detenida", `${documento} está detenida: no se le puede aplicar un depósito.`);
	}
	if (cuenta.estado === "pagada") throw errorDeRegla("deuda_pagada", `${documento} ya está pagada.`);
	if (cuenta.estado === "cancelada") throw errorDeRegla("deuda_cancelada", `${documento} está cancelada.`);
	const queda = await loQueQuedaDelDeposito(contexto, deposito);
	if (queda <= 0) throw errorDeRegla("deposito_ya_aplicado", `${deposito.folio} ya está aplicado completo.`);
	const aplicado = Math.min(queda, cuenta.saldoCentavos);
	const quedo = await aplicarACuentaPorPagar(contexto, cuenta, aplicado, { pagoId: deposito.id });
	const cambiaron = quedo.estado === "pagada" ? await alPagarse(contexto, documentos) : { ordenes: [], deudas: [] };
	return {
		documento,
		tercero,
		aplicado,
		queda: queda - aplicado,
		saldoAntes: cuenta.saldoCentavos,
		saldoDespues: quedo.saldoCentavos,
		cambiaron,
	};
}
