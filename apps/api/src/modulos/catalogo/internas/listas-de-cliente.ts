/**
 * Las internas de la lista de un cliente, que llama Ventas a externos (fase 16): crearla, renombrarla con el
 * cliente, darla de baja y reactivarla.
 * Fase 8 · docs/modulos/catalogo/listas-de-precios.md (regla 3, «Acciones internas»)
 *
 * Lo que cambian va en el renglón de bitácora de la acción de Ventas: no escriben bitácora propia. Los precios
 * de la lista se conservan siempre.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { quienCambia } from "../dominio/comunes.ts";
import { escuelaCambiada } from "../dominio/escuelas.ts";
import { escuelas, listasPrecios } from "../tablas.ts";

/**
 * Guarda `lista_precios.creada` o `lista_precios.cambiada`.
 * @param contexto El contexto de Ventas.
 * @param tipo El tipo del evento.
 * @param listaId La lista.
 */
function eventoDeLista(
	contexto: ContextoDeAccion,
	tipo: "lista_precios.creada" | "lista_precios.cambiada",
	listaId: string,
) {
	contexto.guardarEvento({
		tipo,
		datos: { lista_id: listaId },
		tablas: ["listas_precios"],
		entidad: "listas_precios",
		entidadId: listaId,
	});
}

/**
 * La lista de un cliente, bloqueada.
 * @throws `404` si el cliente no tiene lista.
 */
async function listaDelCliente(transaccion: Transaccion, clienteId: string) {
	const [lista] = await transaccion
		.select()
		.from(listasPrecios)
		.where(eq(listasPrecios.clienteId, clienteId))
		.for("update");
	if (lista === undefined) throw noExiste();
	return lista;
}

/** Lo que recibe crear la lista. */
const paraCrear = z.object({ cliente_id: z.uuid(), nombre: z.string().trim().min(1) });

/**
 * `catalogo.crear_lista_cliente`: la lista del cliente nuevo, vacía y sin porcentajes, con su nombre.
 * @returns `lista_id`.
 * @throws `422 lista_repetida` si el cliente ya tiene lista, o ya hay una lista con ese nombre.
 */
export async function crearListaCliente(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraCrear.parse(datos);
	const id = uuidv7();
	const [creada] = await contexto.transaccion
		.insert(listasPrecios)
		.values({
			id,
			tipo: "cliente",
			nombre: pedido.nombre,
			nombreCorto: pedido.nombre,
			clienteId: pedido.cliente_id,
			orden: sql`(SELECT coalesce(max(orden), 0) + 1 FROM listas_precios)`,
			creadoPor: quienCambia(contexto),
		})
		.onConflictDoNothing()
		.returning({ id: listasPrecios.id });
	if (creada === undefined) throw errorDeRegla("lista_repetida", `${pedido.nombre} ya tiene lista de precios.`);
	eventoDeLista(contexto, "lista_precios.creada", id);
	return { lista_id: id };
}

/** Lo que recibe renombrar. */
const paraRenombrar = z.object({
	cliente_id: z.uuid(),
	nombre_anterior: z.string(),
	nombre: z.string().trim().min(1),
	escuela_id: z.uuid().nullable().optional(),
});

/**
 * La escuela del cliente, si se llamaba igual que él, bloqueada; revisa que el nombre nuevo no choque con otra
 * escuela de su municipio.
 * @returns La escuela que se renombra, o `undefined` si no se renombra.
 * @throws `422 escuela_repetida`.
 */
async function escuelaQueSeRenombra(transaccion: Transaccion, pedido: z.infer<typeof paraRenombrar>) {
	if (pedido.escuela_id === undefined || pedido.escuela_id === null) return undefined;
	const [escuela] = await transaccion.select().from(escuelas).where(eq(escuelas.id, pedido.escuela_id)).for("update");
	if (escuela === undefined || escuela.nombre !== pedido.nombre_anterior) return undefined;
	const [otra] = await transaccion
		.select({ id: escuelas.id })
		.from(escuelas)
		.where(
			and(
				ne(escuelas.id, escuela.id),
				sql`sin_acentos(${escuelas.nombre}) = sin_acentos(${pedido.nombre})`,
				sql`sin_acentos(${escuelas.municipio}) = sin_acentos(${escuela.municipio})`,
			),
		);
	if (otra !== undefined) throw errorDeRegla("escuela_repetida", "Esa escuela ya existe.");
	return escuela;
}

/**
 * `catalogo.sincronizar_nombre_cliente`: renombra la lista del cliente (y su nombre corto si era igual al
 * anterior) y su escuela, solo si se llamaba igual que el cliente.
 * @returns Lo que renombró: `lista` y `escuela`.
 * @throws `422 escuela_repetida` si el nombre nuevo choca con otra escuela del mismo municipio; `422
 * lista_repetida` si ya hay otra lista con ese nombre.
 */
export async function sincronizarNombreCliente(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraRenombrar.parse(datos);
	const { transaccion } = contexto;
	const lista = await listaDelCliente(transaccion, pedido.cliente_id);
	// La escuela pudo existir antes que el cliente, con otro nombre: solo se renombra si se llamaba igual.
	const escuela = await escuelaQueSeRenombra(transaccion, pedido);
	const [otraLista] = await transaccion
		.select({ id: listasPrecios.id })
		.from(listasPrecios)
		.where(and(ne(listasPrecios.id, lista.id), sql`lower(${listasPrecios.nombre}) = lower(${pedido.nombre})`));
	if (otraLista !== undefined) {
		throw errorDeRegla("lista_repetida", `Ya hay una lista de precios que se llama ${pedido.nombre}.`);
	}
	await transaccion
		.update(listasPrecios)
		.set({
			nombre: pedido.nombre,
			...(lista.nombreCorto === pedido.nombre_anterior ? { nombreCorto: pedido.nombre } : {}),
		})
		.where(eq(listasPrecios.id, lista.id));
	eventoDeLista(contexto, "lista_precios.cambiada", lista.id);
	if (escuela === undefined) return { lista: true, escuela: false };
	await transaccion.update(escuelas).set({ nombre: pedido.nombre }).where(eq(escuelas.id, escuela.id));
	escuelaCambiada(contexto, escuela.id);
	return { lista: true, escuela: true };
}

/** Lo que recibe dar de baja. */
const paraBaja = z.object({ cliente_id: z.uuid(), motivo: z.string().min(1) });

/** `catalogo.dar_baja_lista_cliente`: la baja de la lista con el motivo del cliente; sus precios se conservan. */
export async function darBajaListaCliente(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraBaja.parse(datos);
	const lista = await listaDelCliente(contexto.transaccion, pedido.cliente_id);
	await contexto.transaccion
		.update(listasPrecios)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: pedido.motivo })
		.where(eq(listasPrecios.id, lista.id));
	eventoDeLista(contexto, "lista_precios.cambiada", lista.id);
	return { lista_id: lista.id };
}

/** Lo que recibe reactivar. */
const paraReactivar = z.object({ cliente_id: z.uuid() });

/** `catalogo.reactivar_lista_cliente`: limpia la baja de la lista y pone `reactivado_en`. */
export async function reactivarListaCliente(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraReactivar.parse(datos);
	const lista = await listaDelCliente(contexto.transaccion, pedido.cliente_id);
	await contexto.transaccion
		.update(listasPrecios)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(listasPrecios.id, lista.id));
	eventoDeLista(contexto, "lista_precios.cambiada", lista.id);
	return { lista_id: lista.id };
}
