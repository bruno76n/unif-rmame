/**
 * `contaduria.crear_cuenta_por_cobrar` y `contaduria.aplicar_nota_credito`: la cuenta nace cuando Ventas confirma la
 * entrega de una nota, y una nota de crédito autorizada baja su saldo.
 * Fase 15 · docs/modulos/contaduria/cuentas-por-cobrar.md (reglas 1 a 4, «Acciones internas»)
 *
 * Las llama Ventas en su misma transacción (fase 16); su bitácora es el renglón de la acción de Ventas o de Dirección.
 */

import { and, eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { creditoDelCliente } from "../dominio/credito.ts";
import { aplicarACuenta, bloquearCuentaDeNota, estadoDeCuenta, foliosDeVentas } from "../dominio/cuentas.ts";
import { entrarAFavor } from "../dominio/saldo-favor.ts";
import { aplicacionesPago, cuentasPorCobrar, saldoFavorMovimientos } from "../tablas.ts";

/**
 * El anticipo que una nota ya trae descontado: sus renglones `aplicado` vigentes que ningún `regresado` deshizo.
 * @param contexto El contexto de la acción.
 * @param notaEntregaId La nota.
 */
async function anticipoDeLaNota(contexto: ContextoDeAccion, notaEntregaId: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT coalesce(sum(a.monto_centavos), 0)::text AS monto FROM anticipos a
		WHERE a.nota_entrega_id = ${notaEntregaId} AND a.tipo = 'aplicado' AND a.estado = 'vigente'
			AND NOT EXISTS (SELECT 1 FROM anticipos r WHERE r.anticipo_aplicado_id = a.id AND r.estado = 'vigente')`);
	return Number(z.object({ monto: z.string() }).parse(rows[0]).monto);
}

/** Lo que recibe `contaduria.crear_cuenta_por_cobrar`. */
const pedidoDeCuenta = z
	.object({
		nota_entrega_id: z.uuid(),
		pedido_id: z.uuid(),
		cliente_id: z.uuid(),
		fecha_entrega: z.iso.date(),
		dias_credito: z.number().int().min(0),
		total_nota_centavos: z.number().int().min(0),
	})
	.strict();

/**
 * Crea la cuenta por cobrar de una nota entregada: vence a los días de crédito que congeló el pedido, con importe =
 * total − anticipo aplicado y saldo = importe; con importe 0 nace pagada.
 * @param contexto El contexto de `ventas.confirmar_entrega`.
 * @param datos La nota, su pedido, su cliente, el día de la entrega, los días de crédito y el total de la nota.
 * @returns `cuenta_por_cobrar_id`, `vence` e `importe_centavos`.
 * @throws `422 cuenta_ya_existe` si la nota ya tiene su cuenta (dos a la vez dejan una sola).
 */
export async function crearCuentaPorCobrar(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeCuenta.parse(datos);
	const credito = await creditoDelCliente(contexto.transaccion, pedido.cliente_id);
	const vence = Temporal.PlainDate.from(pedido.fecha_entrega).add({ days: pedido.dias_credito }).toString();
	const anticipo = await anticipoDeLaNota(contexto, pedido.nota_entrega_id);
	const importe = pedido.total_nota_centavos - anticipo;
	const estado = estadoDeCuenta(importe, importe);
	const id = uuidv7();
	const [nueva] = await contexto.transaccion
		.insert(cuentasPorCobrar)
		.values({
			id,
			notaEntregaId: pedido.nota_entrega_id,
			pedidoId: pedido.pedido_id,
			clienteId: pedido.cliente_id,
			terceroId: credito.terceroId,
			fechaEntrega: pedido.fecha_entrega,
			diasCredito: pedido.dias_credito,
			vence,
			totalNotaCentavos: pedido.total_nota_centavos,
			anticipoAplicadoCentavos: anticipo,
			importeCentavos: importe,
			saldoCentavos: importe,
			estado,
			pagadaEn: estado === "pagada" ? contexto.ahora.toString() : null,
			creadoPor: quienCambia(contexto),
		})
		.onConflictDoNothing({ target: cuentasPorCobrar.notaEntregaId })
		.returning({ id: cuentasPorCobrar.id });
	if (nueva === undefined) {
		const folios = await foliosDeVentas(contexto, { nota_entrega_ids: [pedido.nota_entrega_id] });
		const folio = folios.get(pedido.nota_entrega_id) ?? "La nota";
		throw errorDeRegla("cuenta_ya_existe", `${folio} ya tiene su cuenta por cobrar.`);
	}
	contexto.guardarEvento({
		tipo: "cuenta_por_cobrar.creada",
		datos: { cuenta_por_cobrar_id: id, nota_entrega_id: pedido.nota_entrega_id, cliente_id: pedido.cliente_id },
		tablas: ["cuentas_por_cobrar"],
		entidad: "cuentas_por_cobrar",
		entidadId: id,
	});
	return { cuenta_por_cobrar_id: id, vence, importe_centavos: importe };
}

/** Lo que recibe `contaduria.aplicar_nota_credito`. */
const pedidoDeNotaCredito = z
	.object({
		nota_credito_id: z.uuid(),
		nota_entrega_id: z.uuid(),
		monto_centavos: z.number().int().positive(),
	})
	.strict();

/**
 * Aplica una nota de crédito autorizada a la cuenta de su nota: baja hasta su saldo y lo demás entra a favor del
 * cliente (regla 4).
 * @param contexto El contexto de `direccion.decidir_autorizacion`, donde corre el efecto de la AU- `nota_credito`.
 * @param datos La NC, su nota y su monto.
 * @returns Lo aplicado y lo que quedó a favor, en centavos.
 * @throws `422 nota_credito_ya_aplicada` si la NC ya bajó el saldo; `422 nota_sin_entregar` si la nota no tiene cuenta.
 */
export async function aplicarNotaCredito(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeNotaCredito.parse(datos);
	const { transaccion } = contexto;
	const cuenta = await bloquearCuentaDeNota(transaccion, pedido.nota_entrega_id);
	const folios = await foliosDeVentas(contexto, {
		nota_entrega_ids: [pedido.nota_entrega_id],
		nota_credito_ids: [pedido.nota_credito_id],
	});
	if (cuenta === undefined) {
		const folio = folios.get(pedido.nota_entrega_id) ?? "La nota";
		throw errorDeRegla("nota_sin_entregar", `${folio} todavía no se entrega: se cobra al confirmar la entrega.`);
	}
	// Con la cuenta bloqueada, otra aplicación de la misma NC ya se ve.
	const [yaBajo] = await transaccion
		.select({ id: aplicacionesPago.id })
		.from(aplicacionesPago)
		.where(eq(aplicacionesPago.notaCreditoId, pedido.nota_credito_id));
	const [yaEntro] = await transaccion
		.select({ id: saldoFavorMovimientos.id })
		.from(saldoFavorMovimientos)
		.where(
			and(eq(saldoFavorMovimientos.notaCreditoId, pedido.nota_credito_id), eq(saldoFavorMovimientos.tipo, "entra")),
		);
	if (yaBajo !== undefined || yaEntro !== undefined) {
		const folio = folios.get(pedido.nota_credito_id) ?? "La nota de crédito";
		throw errorDeRegla("nota_credito_ya_aplicada", `${folio} ya bajó el saldo de su nota.`);
	}
	const aplicado = Math.min(pedido.monto_centavos, cuenta.saldoCentavos);
	const aFavor = pedido.monto_centavos - aplicado;
	if (aplicado > 0) await aplicarACuenta(contexto, cuenta, aplicado, { notaCreditoId: pedido.nota_credito_id });
	if (aFavor > 0) {
		await entrarAFavor(contexto, {
			clienteId: cuenta.clienteId,
			terceroId: cuenta.terceroId,
			montoCentavos: aFavor,
			origen: { tipo: "nota_credito", notaCreditoId: pedido.nota_credito_id },
		});
	}
	return { aplicado_centavos: aplicado, a_favor_centavos: aFavor };
}
