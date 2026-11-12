/**
 * Lo que mueve el saldo de una cuenta por cobrar: bloquearla, aplicarle algo (un pago, una nota de crédito o saldo a
 * favor) y regresarle lo que se cancela. El saldo se guarda y cambia en la misma transacción que cada aplicación.
 * Fase 15 · docs/modulos/contaduria/cuentas-por-cobrar.md (reglas 2 y 3, «Estados») y
 * docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 4 y 9)
 *
 * El orden de los candados del dinero de un cliente: el pago que se cancela, el crédito del cliente (su saldo a favor),
 * las cuentas por cobrar en orden de id y, al final, el folio. Quien aplica toma antes la cuenta: dos pagos a la vez no
 * pasan del saldo.
 */

import { asc, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { aplicacionesPago, cuentasPorCobrar, type estadosDeCuentaPorCobrar } from "../tablas.ts";

/** Una cuenta por cobrar como la lee quien la cambia. */
export type CuentaPorCobrar = typeof cuentasPorCobrar.$inferSelect;

/**
 * El estado de una cuenta con su saldo.
 * @param saldo El saldo, de 0 al importe.
 * @param importe El importe de la cuenta.
 */
export function estadoDeCuenta(saldo: number, importe: number): (typeof estadosDeCuentaPorCobrar)[number] {
	if (saldo === 0) return "pagada";
	return saldo === importe ? "sin_pagar" : "pagada_en_parte";
}

/**
 * Bloquea la cuenta por cobrar de una nota hasta el final de la acción.
 * @param transaccion La transacción.
 * @param notaEntregaId La nota.
 * @returns La cuenta ya bloqueada, o `undefined` si la nota no tiene (todavía no se entrega).
 */
export async function bloquearCuentaDeNota(
	transaccion: Transaccion,
	notaEntregaId: string,
): Promise<CuentaPorCobrar | undefined> {
	const [cuenta] = await transaccion
		.select()
		.from(cuentasPorCobrar)
		.where(eq(cuentasPorCobrar.notaEntregaId, notaEntregaId))
		.for("update");
	return cuenta;
}

/**
 * Bloquea unas cuentas por cobrar en orden de id.
 * @param transaccion La transacción.
 * @param ids Las cuentas.
 * @returns Las cuentas ya bloqueadas, por id.
 */
export async function bloquearCuentas(
	transaccion: Transaccion,
	ids: readonly string[],
): Promise<Map<string, CuentaPorCobrar>> {
	if (ids.length === 0) return new Map();
	const cuentas = await transaccion
		.select()
		.from(cuentasPorCobrar)
		.where(inArray(cuentasPorCobrar.id, [...new Set(ids)]))
		.orderBy(asc(cuentasPorCobrar.id))
		.for("update");
	return new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
}

/**
 * Cambia el saldo de una cuenta ya bloqueada, con su estado y `pagada_en`; si quedó pagada, guarda su evento.
 * @param contexto El contexto de la acción.
 * @param cuenta La cuenta, como estaba.
 * @param saldo El saldo nuevo, de 0 al importe.
 */
async function ponerSaldo(contexto: ContextoDeAccion, cuenta: CuentaPorCobrar, saldo: number): Promise<void> {
	const estado = estadoDeCuenta(saldo, cuenta.importeCentavos);
	await contexto.transaccion
		.update(cuentasPorCobrar)
		.set({
			saldoCentavos: saldo,
			estado,
			pagadaEn: estado === "pagada" ? (cuenta.pagadaEn ?? contexto.ahora.toString()) : null,
		})
		.where(eq(cuentasPorCobrar.id, cuenta.id));
	if (estado === "pagada" && cuenta.estado !== "pagada") {
		contexto.guardarEvento({
			tipo: "cuenta_por_cobrar.pagada",
			datos: { cuenta_por_cobrar_id: cuenta.id, nota_entrega_id: cuenta.notaEntregaId },
			tablas: ["cuentas_por_cobrar"],
			entidad: "cuentas_por_cobrar",
			entidadId: cuenta.id,
		});
	}
}

/** De dónde viene una aplicación: exactamente uno. */
export type OrigenDeAplicacion = { pagoId: string } | { notaCreditoId: string } | { saldoFavorMovimientoId: string };

/**
 * Aplica un monto a una cuenta ya bloqueada: su aplicación vigente y el saldo nuevo.
 * @param contexto El contexto de la acción.
 * @param cuenta La cuenta, bloqueada por quien llama.
 * @param monto Lo que baja, mayor que 0 y hasta el saldo (quien llama ya lo revisó con su mensaje).
 * @param origen El pago, la nota de crédito o el movimiento del saldo a favor.
 * @returns El saldo nuevo.
 */
export async function aplicarACuenta(
	contexto: ContextoDeAccion,
	cuenta: CuentaPorCobrar,
	monto: number,
	origen: OrigenDeAplicacion,
): Promise<number> {
	if (monto <= 0 || monto > cuenta.saldoCentavos) {
		throw new Error(`no se aplican ${monto} a una cuenta con saldo ${cuenta.saldoCentavos}`);
	}
	await contexto.transaccion.insert(aplicacionesPago).values({
		id: uuidv7(),
		...origen,
		cuentaPorCobrarId: cuenta.id,
		montoCentavos: monto,
		fecha: contexto.diaDeNegocio.toString(),
		creadoPor: quienCambia(contexto),
	});
	const saldo = cuenta.saldoCentavos - monto;
	await ponerSaldo(contexto, cuenta, saldo);
	return saldo;
}

/**
 * Cancela las aplicaciones vigentes de un pago y regresa su monto a sus cuentas por cobrar.
 * @param contexto El contexto de la acción.
 * @param pagoId El pago que se cancela.
 * @param motivo El motivo de la cancelación.
 * @returns Por cuenta, su saldo antes y después.
 */
export async function regresarAplicacionesDelPago(
	contexto: ContextoDeAccion,
	pagoId: string,
	motivo: string,
): Promise<{ cuenta_por_cobrar_id: string; antes: number; despues: number }[]> {
	const { transaccion } = contexto;
	const vigentes = await transaccion
		.select({
			id: aplicacionesPago.id,
			cuentaId: aplicacionesPago.cuentaPorCobrarId,
			monto: aplicacionesPago.montoCentavos,
		})
		.from(aplicacionesPago)
		.where(sql`${aplicacionesPago.pagoId} = ${pagoId} AND ${aplicacionesPago.estado} = 'vigente'`);
	const cuentas = await bloquearCuentas(
		transaccion,
		vigentes.flatMap((aplicacion) => (aplicacion.cuentaId === null ? [] : [aplicacion.cuentaId])),
	);
	const movidas: { cuenta_por_cobrar_id: string; antes: number; despues: number }[] = [];
	for (const cuenta of cuentas.values()) {
		const regresa = vigentes
			.filter((aplicacion) => aplicacion.cuentaId === cuenta.id)
			.reduce((suma, aplicacion) => suma + aplicacion.monto, 0);
		const despues = cuenta.saldoCentavos + regresa;
		await ponerSaldo(contexto, cuenta, despues);
		movidas.push({ cuenta_por_cobrar_id: cuenta.id, antes: cuenta.saldoCentavos, despues });
	}
	if (vigentes.length > 0) {
		await transaccion
			.update(aplicacionesPago)
			.set({
				estado: "cancelada",
				canceladoEn: contexto.ahora.toString(),
				canceladoPor: quienCambia(contexto),
				motivoCancelacion: motivo,
			})
			.where(
				inArray(
					aplicacionesPago.id,
					vigentes.map((aplicacion) => aplicacion.id),
				),
			);
	}
	return movidas;
}

/**
 * Los folios de unos documentos de Ventas, para los mensajes: Ventas los lee de sus tablas.
 * @param contexto El contexto de la acción.
 * @param documentos Los pedidos, las notas de entrega y las notas de crédito.
 * @returns Por id, su folio.
 */
export async function foliosDeVentas(
	contexto: ContextoDeAccion,
	documentos: { pedido_ids?: string[]; nota_entrega_ids?: string[]; nota_credito_ids?: string[] },
): Promise<Map<string, string>> {
	const folios = z
		.object({ folios: z.record(z.uuid(), z.string()) })
		.parse(await contexto.lectura("ventas.folios_de_documentos", documentos));
	return new Map(Object.entries(folios.folios));
}
