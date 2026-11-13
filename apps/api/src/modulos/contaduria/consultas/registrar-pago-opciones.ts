/**
 * `contaduria.registrar_pago_opciones`: lo que necesita el cajón Registrar pago.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Registrar pago») y docs/modulos/contaduria/pagos-y-saldo-a-favor.md
 *
 * Los clientes con algo por pagar (una nota con saldo o un pedido confirmado); del escogido, sus notas con saldo y sus
 * pedidos con lo que les falta (`pedidoQueRecibe`, la misma cuenta que usa el pago); las cuentas de la fábrica; los
 * proveedores y acreedores a quienes se les debe, sin el mismo cliente; y las deudas no detenidas del tercero escogido.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { registrarPagoOpciones } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { pedidoQueRecibe } from "../dominio/anticipos.ts";
import { cuentasDeLaFabrica, cuentasPorCobrarConSaldo, cuentasPorPagarQueSeDeben, documentoDe } from "./comun.ts";

/** Un cliente con algo por pagar. */
const clienteLeido = z.object({ id: z.uuid(), tercero_id: z.uuid(), nombre: z.string() });

/**
 * Los clientes con una nota con saldo o un pedido confirmado, por nombre.
 * @param contexto El contexto de la consulta.
 */
async function clientesConAlgoPorPagar(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT cl.id, cl.tercero_id, t.nombre
		FROM clientes cl JOIN terceros t ON t.id = cl.tercero_id
		WHERE EXISTS (SELECT 1 FROM cuentas_por_cobrar c WHERE c.cliente_id = cl.id AND c.saldo_centavos > 0)
			OR EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = cl.id AND p.estado = 'confirmado')
		ORDER BY t.nombre`);
	return z.array(clienteLeido).parse(rows);
}

/**
 * Los pedidos confirmados de un cliente con lo que les falta para el anticipo.
 * @param contexto El contexto de la consulta.
 * @param cliente El cliente.
 */
async function pedidosConFalta(contexto: ContextoDeConsulta, cliente: z.infer<typeof clienteLeido>) {
	const { rows } = await contexto.base.execute(sql`SELECT id FROM pedidos
		WHERE cliente_id = ${cliente.id}::uuid AND estado = 'confirmado' ORDER BY folio`);
	const ids = z.array(z.object({ id: z.uuid() })).parse(rows);
	return contexto.comoAccion(async (accion) => {
		const conFalta = [];
		for (const { id } of ids) {
			const pedido = await pedidoQueRecibe(accion, id, { id: cliente.id, nombre: cliente.nombre });
			if (pedido.falta > 0) conFalta.push({ id, ...pedido });
		}
		return conFalta;
	});
}

export const consultaRegistrarPagoOpciones = implementarConsulta(
	registrarPagoOpciones,
	async (contexto, parametros) => {
		const clientes = await clientesConAlgoPorPagar(contexto);
		const escogido = clientes.find((cliente) => cliente.id === parametros.cliente_id) ?? clientes[0];
		const notas = escogido === undefined ? [] : await cuentasPorCobrarConSaldo(contexto, escogido.id);
		const pedidos = escogido === undefined ? [] : await pedidosConFalta(contexto, escogido);
		const deben = (await cuentasPorPagarQueSeDeben(contexto)).filter((cuenta) => cuenta.estado !== "detenida");
		const terceros = new Map(
			deben
				.filter((cuenta) => cuenta.tercero_id !== escogido?.tercero_id)
				.map((cuenta) => [cuenta.tercero_id, cuenta.beneficiario]),
		);
		return {
			resultado: {
				clientes: clientes.map((cliente) => ({ id: cliente.id, nombre: cliente.nombre })),
				cliente_id: escogido?.id ?? null,
				documentos: [
					...notas.map((nota) => ({
						tipo: "nota" as const,
						id: nota.nota_entrega_id,
						folio: nota.nota,
						saldo_centavos: nota.saldo,
						detalle: `vence ${textoDeDiaCorto(nota.vence)}`,
					})),
					...pedidos.map((pedido) => ({
						tipo: "pedido" as const,
						id: pedido.id,
						folio: pedido.folio,
						saldo_centavos: pedido.falta,
						detalle: "anticipo del pedido",
					})),
				],
				cuentas_fabrica: await cuentasDeLaFabrica(contexto),
				terceros: [...terceros.entries()]
					.map(([id, nombre]) => ({ id, nombre }))
					.sort((uno, otro) => uno.nombre.localeCompare(otro.nombre)),
				deudas: deben
					.filter((cuenta) => cuenta.tercero_id === parametros.tercero_deposito_id)
					.map((cuenta) => ({
						cuenta_por_pagar_id: cuenta.id,
						documento: documentoDe(cuenta),
						saldo_centavos: cuenta.saldo,
					})),
			},
		};
	},
);
