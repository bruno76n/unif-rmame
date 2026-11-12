/**
 * `contaduria.abrir_credito_cliente`: el crédito nace con el cliente, sin límite, con los días de su tipo y al
 * corriente. Lo llama `ventas.crear_cliente` (fase 16) en su misma transacción; su bitácora es la del alta.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md (regla 1, «Acciones internas»)
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { creditoClientes } from "../tablas.ts";

/** Lo que recibe `contaduria.abrir_credito_cliente`. */
const pedidoDeAbrir = z
	.object({
		cliente_id: z.uuid(),
		tercero_id: z.uuid(),
		tipo_cliente: z.enum(["escuela", "mayorista", "empresa_otro"]),
	})
	.strict();

/**
 * Abre el crédito de un cliente. Si ya lo tiene, regresa el que hay sin escribir nada: dos llamadas a la vez dejan uno
 * solo (el índice único de `cliente_id`).
 * @param contexto El contexto de la acción de Ventas.
 * @param datos El cliente, su tercero y su tipo.
 * @returns `credito_cliente_id`.
 */
export async function abrirCreditoCliente(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeAbrir.parse(datos);
	const clave = pedido.tipo_cliente === "mayorista" ? "credito_dias_mayorista" : "credito_dias_general";
	const dias = z
		.number()
		.int()
		.positive()
		.parse(await contexto.lectura("admin.parametro", { clave: `contaduria.${clave}` }));
	const [nuevo] = await contexto.transaccion
		.insert(creditoClientes)
		.values({
			id: uuidv7(),
			clienteId: pedido.cliente_id,
			terceroId: pedido.tercero_id,
			diasCredito: dias,
			creadoPor: quienCambia(contexto),
		})
		.onConflictDoNothing({ target: creditoClientes.clienteId })
		.returning({ id: creditoClientes.id });
	if (nuevo !== undefined) {
		contexto.guardarEvento({
			tipo: "credito.abierto",
			datos: { credito_cliente_id: nuevo.id, cliente_id: pedido.cliente_id },
			tablas: ["credito_clientes"],
			entidad: "credito_clientes",
			entidadId: nuevo.id,
		});
		return { credito_cliente_id: nuevo.id };
	}
	const [yaTenia] = await contexto.transaccion
		.select({ id: creditoClientes.id })
		.from(creditoClientes)
		.where(eq(creditoClientes.clienteId, pedido.cliente_id));
	return { credito_cliente_id: z.uuid().parse(yaTenia?.id) };
}
