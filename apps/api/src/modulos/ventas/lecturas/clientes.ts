/**
 * `ventas.estado_cliente` y `ventas.cliente_activo_de_escuela`: lo que otros módulos leen de un cliente.
 * Fase 16 · docs/modulos/ventas/clientes.md («Lecturas»)
 *
 * La usan Contaduría (no cambia el crédito de un cliente dado de baja) y Catálogo (no da de baja la escuela de un
 * cliente activo).
 */

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { leerCliente } from "../dominio/clientes.ts";
import { clientes } from "../tablas.ts";

/** Lo que pide `estado_cliente`. */
const pedidoDeEstado = z.object({ cliente_id: z.uuid() }).strict();

/**
 * El tipo, la escuela y si está de baja un cliente, con su nombre para los mensajes.
 * @param contexto El contexto de quien lee.
 * @param datos El cliente.
 * @throws `404` si no existe.
 */
export async function estadoCliente(contexto: ContextoDeAccion, datos: unknown) {
	const { cliente_id } = pedidoDeEstado.parse(datos);
	const cliente = await leerCliente(contexto.transaccion, cliente_id);
	return {
		nombre: cliente.nombre,
		tipo: cliente.tipo,
		escuela_id: cliente.escuelaId,
		de_baja: cliente.bajaEn !== null,
	};
}

/** Lo que pide `cliente_activo_de_escuela`. */
const pedidoDeEscuela = z.object({ escuela_id: z.uuid() }).strict();

/**
 * El cliente activo de una escuela, si hay.
 * @param contexto El contexto de quien lee.
 * @param datos La escuela.
 * @returns El cliente y su nombre, o `null`.
 */
export async function clienteActivoDeEscuela(contexto: ContextoDeAccion, datos: unknown) {
	const { escuela_id } = pedidoDeEscuela.parse(datos);
	const [cliente] = await contexto.transaccion
		.select({ cliente_id: clientes.id, nombre: terceros.nombre })
		.from(clientes)
		.innerJoin(terceros, eq(terceros.id, clientes.terceroId))
		.where(and(eq(clientes.escuelaId, escuela_id), isNull(clientes.bajaEn)));
	return { cliente: cliente ?? null };
}
