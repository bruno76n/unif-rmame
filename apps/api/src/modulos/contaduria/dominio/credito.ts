/**
 * Lo que comparten las acciones y la lectura del crédito de un cliente: leerlo con el nombre de su tercero y calcular
 * su semáforo sugerido con sus cuentas por cobrar y los parámetros.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («El semáforo sugerido», «Lecturas»)
 */

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { creditoClientes, cuentasPorCobrar, terceros } from "../tablas.ts";
import { type SemaforoCalculado, semaforoSugerido } from "./semaforo-sugerido.ts";

/** El crédito de un cliente, con el nombre de su tercero. */
export type CreditoConNombre = typeof creditoClientes.$inferSelect & { cliente: string };

/**
 * El crédito de un cliente, con el nombre de su tercero.
 * @param transaccion La transacción.
 * @param clienteId El cliente.
 * @throws `404` si el cliente no tiene crédito.
 */
export async function creditoDelCliente(transaccion: Transaccion, clienteId: string): Promise<CreditoConNombre> {
	const [credito] = await transaccion
		.select({ fila: creditoClientes, cliente: terceros.nombre })
		.from(creditoClientes)
		.innerJoin(terceros, eq(terceros.id, creditoClientes.terceroId))
		.where(eq(creditoClientes.clienteId, clienteId));
	if (credito === undefined) throw noExiste();
	return { ...credito.fila, cliente: credito.cliente };
}

/**
 * El semáforo sugerido de un cliente con un límite: lee sus cuentas por cobrar con saldo y los dos parámetros.
 * @param contexto El contexto de la acción o de la lectura.
 * @param clienteId El cliente.
 * @param limiteCentavos El límite con el que se calcula (el nuevo, al cambiarlo).
 */
export async function semaforoDelCliente(
	contexto: ContextoDeAccion,
	clienteId: string,
	limiteCentavos: number,
): Promise<SemaforoCalculado> {
	const cuentas = await contexto.transaccion
		.select({ saldoCentavos: cuentasPorCobrar.saldoCentavos, vence: cuentasPorCobrar.vence })
		.from(cuentasPorCobrar)
		.where(and(eq(cuentasPorCobrar.clienteId, clienteId), gt(cuentasPorCobrar.saldoCentavos, 0)));
	const parametro = (clave: string) => contexto.lectura("admin.parametro", { clave });
	return semaforoSugerido({
		limiteCentavos,
		cuentas,
		hoy: contexto.diaDeNegocio,
		diasVencidoDetenido: z.number().parse(await parametro("contaduria.credito_dias_vencido_detenido")),
		porcentajeCercaLimite: z
			.union([z.number(), z.string()])
			.parse(await parametro("contaduria.credito_porcentaje_cerca_limite")),
	});
}
