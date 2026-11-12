/**
 * Lo que comparten las acciones y las lecturas de los clientes: leer un cliente con el nombre y el RFC de su tercero,
 * cómo se nombra su tipo y su evento.
 * Fase 16 · docs/modulos/ventas/clientes.md (reglas 1, 2 y 7)
 */

import { eq } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { clientes, type tiposDeCliente } from "../tablas.ts";

/** Un cliente con el nombre y el RFC de su tercero. */
export type ClienteConNombre = typeof clientes.$inferSelect & { nombre: string; rfc: string | null };

/** Cómo se lee cada tipo: «mayorista en León». */
export const nombreDelTipo: Record<(typeof tiposDeCliente)[number], string> = {
	escuela: "escuela",
	mayorista: "mayorista",
	empresa_otro: "empresa u otro",
};

/**
 * Un cliente con el nombre y el RFC de su tercero.
 * @param transaccion La transacción.
 * @param clienteId El cliente.
 * @param bloquear Si lo bloquea hasta el final de la acción.
 * @throws `404` si no existe.
 */
export async function leerCliente(
	transaccion: Transaccion,
	clienteId: string,
	bloquear = false,
): Promise<ClienteConNombre> {
	const consulta = transaccion
		.select({ fila: clientes, nombre: terceros.nombre, rfc: terceros.rfc })
		.from(clientes)
		.innerJoin(terceros, eq(terceros.id, clientes.terceroId))
		.where(eq(clientes.id, clienteId));
	const [leido] = bloquear ? await consulta.for("update", { of: clientes }) : await consulta;
	if (leido === undefined) throw noExiste();
	return { ...leido.fila, nombre: leido.nombre, rfc: leido.rfc };
}

/**
 * Guarda el evento de un cliente.
 * @param contexto El contexto de la acción.
 * @param tipo `cliente.creado` o `cliente.cambiado`.
 * @param clienteId El cliente.
 */
export function eventoDeCliente(
	contexto: ContextoDeAccion,
	tipo: "cliente.creado" | "cliente.cambiado",
	clienteId: string,
): void {
	contexto.guardarEvento({
		tipo,
		datos: { cliente_id: clienteId },
		tablas: ["clientes"],
		entidad: "clientes",
		entidadId: clienteId,
	});
}
