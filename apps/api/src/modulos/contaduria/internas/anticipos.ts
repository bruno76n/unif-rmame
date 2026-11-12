/**
 * Las internas del anticipo de un pedido: `contaduria.aplicar_anticipo_a_nota`, `contaduria.regresar_anticipo_a_pedido`
 * y `contaduria.pasar_anticipo_a_favor`. Las llama Ventas en su misma transacción (fase 16); su bitácora es el renglón
 * de la acción de Ventas.
 * Fase 15 · docs/modulos/contaduria/anticipos.md (reglas 2 a 5, «Acciones internas»)
 *
 * Cada una toma el candado del anticipo del pedido antes de leer su disponible.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { anticipoDelPedido, candadoDeAnticipo, pasarDisponibleAFavor } from "../dominio/anticipos.ts";
import { foliosDeVentas } from "../dominio/cuentas.ts";
import { anticipos } from "../tablas.ts";

/** Lo que recibe `contaduria.aplicar_anticipo_a_nota`. */
const pedidoDeAplicar = z
	.object({
		pedido_id: z.uuid(),
		cliente_id: z.uuid(),
		nota_entrega_id: z.uuid(),
		monto_centavos: z.number().int().positive(),
	})
	.strict();

/**
 * Descuenta del anticipo del pedido lo que Ventas decidió para una nota (regla 3).
 * @param contexto El contexto de «Crear nota».
 * @param datos El pedido, su cliente, la nota y el monto.
 * @returns `anticipo_id`.
 * @throws `422 anticipo_insuficiente` si pasa del disponible.
 */
export async function aplicarAnticipoANota(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeAplicar.parse(datos);
	await candadoDeAnticipo(contexto.transaccion, pedido.pedido_id);
	const { disponible } = await anticipoDelPedido(contexto.transaccion, pedido.pedido_id);
	if (pedido.monto_centavos > disponible) {
		const folios = await foliosDeVentas(contexto, { pedido_ids: [pedido.pedido_id] });
		throw errorDeRegla(
			"anticipo_insuficiente",
			`El pedido ${folios.get(pedido.pedido_id) ?? ""} solo tiene ${centavosATexto(centavos(Math.max(0, disponible)))} de anticipo.`,
		);
	}
	const id = uuidv7();
	await contexto.transaccion.insert(anticipos).values({
		id,
		pedidoId: pedido.pedido_id,
		clienteId: pedido.cliente_id,
		tipo: "aplicado",
		montoCentavos: pedido.monto_centavos,
		fecha: contexto.diaDeNegocio.toString(),
		notaEntregaId: pedido.nota_entrega_id,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "anticipo.aplicado",
		datos: { anticipo_id: id, pedido_id: pedido.pedido_id, nota_entrega_id: pedido.nota_entrega_id },
		tablas: ["anticipos"],
		entidad: "anticipos",
		entidadId: id,
	});
	return { anticipo_id: id };
}

/** Lo que recibe `contaduria.regresar_anticipo_a_pedido`. */
const pedidoDeRegresar = z.object({ nota_entrega_id: z.uuid() }).strict();

/**
 * Regresa al pedido el anticipo que se le descontó a una nota que se cancela por despachar (regla 4). Si la nota no
 * tenía anticipo aplicado, no hace nada.
 * @param contexto El contexto de «Cancelar nota».
 * @param datos La nota.
 * @returns Lo que regresó, en centavos.
 */
export async function regresarAnticipoAPedido(contexto: ContextoDeAccion, datos: unknown) {
	const { nota_entrega_id } = pedidoDeRegresar.parse(datos);
	const { transaccion } = contexto;
	const deLaNota = await transaccion
		.select({ pedidoId: anticipos.pedidoId })
		.from(anticipos)
		.where(and(eq(anticipos.notaEntregaId, nota_entrega_id), eq(anticipos.tipo, "aplicado")))
		.limit(1);
	const pedidoId = deLaNota[0]?.pedidoId;
	if (pedidoId === undefined) return { regresado_centavos: 0 };
	await candadoDeAnticipo(transaccion, pedidoId);
	// Ya con el candado: los `aplicado` vigentes de la nota que nadie ha regresado.
	const { rows } = await transaccion.execute(sql`
		SELECT a.id, a.cliente_id, a.monto_centavos::text AS monto FROM anticipos a
		WHERE a.nota_entrega_id = ${nota_entrega_id} AND a.tipo = 'aplicado' AND a.estado = 'vigente'
			AND NOT EXISTS (SELECT 1 FROM anticipos r WHERE r.anticipo_aplicado_id = a.id)
		ORDER BY a.id`);
	const aplicados = z.array(z.object({ id: z.uuid(), cliente_id: z.uuid(), monto: z.string() })).parse(rows);
	let regresado = 0;
	for (const aplicado of aplicados) {
		const id = uuidv7();
		await transaccion.insert(anticipos).values({
			id,
			pedidoId,
			clienteId: aplicado.cliente_id,
			tipo: "regresado",
			montoCentavos: Number(aplicado.monto),
			fecha: contexto.diaDeNegocio.toString(),
			notaEntregaId: nota_entrega_id,
			anticipoAplicadoId: aplicado.id,
			creadoPor: quienCambia(contexto),
		});
		regresado += Number(aplicado.monto);
		contexto.guardarEvento({
			tipo: "anticipo.regresado",
			datos: { anticipo_id: id, pedido_id: pedidoId, nota_entrega_id },
			tablas: ["anticipos"],
			entidad: "anticipos",
			entidadId: id,
		});
	}
	return { regresado_centavos: regresado };
}

/** Lo que recibe `contaduria.pasar_anticipo_a_favor`. */
const pedidoDePasar = z
	.object({ pedido_id: z.uuid(), causa: z.enum(["pedido_cancelado", "pedido_entregado"]) })
	.strict();

/**
 * Pasa a favor del cliente todo el disponible de un pedido cancelado o entregado (regla 5). Sin disponible, no hace
 * nada.
 * @param contexto El contexto de la acción de Ventas.
 * @param datos El pedido y la causa.
 * @returns Lo que quedó a favor, en centavos.
 */
export async function pasarAnticipoAFavor(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = pedidoDePasar.parse(datos);
	await candadoDeAnticipo(contexto.transaccion, pedido_id);
	return { a_favor_centavos: await pasarDisponibleAFavor(contexto, pedido_id) };
}
