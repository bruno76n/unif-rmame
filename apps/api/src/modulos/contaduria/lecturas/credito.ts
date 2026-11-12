/**
 * `contaduria.credito_de_cliente`: lo que Ventas lee del crédito de un cliente, sin montos.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md (reglas 5 y 6, «Lecturas»)
 *
 * La usan el pedido nuevo, confirmar un pedido y la lista de clientes de Ventas (fase 16). El límite, el saldo y el uso
 * se quedan en Contaduría.
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { creditoDelCliente, semaforoDelCliente } from "../dominio/credito.ts";

/** Lo que pide la lectura. */
const pedidoDeCredito = z.object({ cliente_id: z.uuid() }).strict();

/**
 * El semáforo de un cliente, si tiene crédito, sus días y si está cerca de su límite.
 * @param contexto El contexto de quien lee.
 * @param datos El cliente.
 * @throws `404` si el cliente no tiene crédito.
 */
export async function creditoDeCliente(contexto: ContextoDeAccion, datos: unknown) {
	const { cliente_id } = pedidoDeCredito.parse(datos);
	const credito = await creditoDelCliente(contexto.transaccion, cliente_id);
	const { cercaDelLimite } = await semaforoDelCliente(contexto, cliente_id, credito.limiteCentavos);
	return {
		semaforo: credito.semaforo,
		tiene_credito: credito.limiteCentavos > 0,
		dias_credito: credito.diasCredito,
		cerca_del_limite: cercaDelLimite,
	};
}
