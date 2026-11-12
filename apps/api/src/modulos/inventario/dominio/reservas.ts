/**
 * Las reservas por dentro: crearlas, partirlas, terminarlas, contar las libres y moverlas con su pieza.
 * Fase 9 · docs/modulos/inventario/reservas.md (reglas 1, 2, 3 y 7, «Estados»)
 *
 * Una reserva nunca mueve existencia. Viaja con su pieza: un movimiento que lleva piezas de un traspaso cambia
 * la ubicación de sus reservas y, al llegar al destino del traspaso, les quita el traspaso; si salen a Fuera, se
 * cumplen. Nada se borra: una reserva que deja de servir cambia de estado; si solo una parte cambia, se parte
 * en dos nuevas y la original queda `transferida` a la que sigue igual.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../../catalogo/tablas.ts";
import { type motivosDeFinDeReserva, reservas, type TipoDeMovimiento, traspasos } from "../tablas.ts";

/** Los movimientos que entregan la pieza a su dueño: cumplen su reserva. */
const tiposQueEntregan: readonly TipoDeMovimiento[] = [
	"entrega_cliente_externo",
	"entrega_tienda_sin_caja",
	"salida_linea",
	"venta_tienda",
];

/** Una reserva como está guardada. */
export type Reserva = typeof reservas.$inferSelect;

/** Por qué termina una reserva. */
export type MotivoDeFin = (typeof motivosDeFinDeReserva)[number];

/** Lo que se aparta: lo demás de la reserva (su documento, su vencimiento) va como en la tabla. */
export type ReservaNueva = Omit<
	typeof reservas.$inferInsert,
	"id" | "estado" | "creadoEn" | "creadoPor" | "actualizadoEn" | "version"
> & { id?: string };

/**
 * Crea una reserva activa.
 * @param contexto El contexto de la acción.
 * @param nueva Dónde, qué, cuántas y para qué documento.
 * @returns Su id.
 */
export async function crearReserva(contexto: ContextoDeAccion, nueva: ReservaNueva): Promise<string> {
	const id = nueva.id ?? uuidv7();
	await contexto.transaccion.insert(reservas).values({
		...nueva,
		id,
		estado: "activa",
		creadoPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
	});
	return id;
}

/**
 * Termina una reserva activa: consumida, liberada o transferida.
 * @param contexto El contexto de la acción.
 * @param reservaId La reserva.
 * @param fin El estado, su motivo y, según el estado, el movimiento que la cumplió o la reserva que la reemplaza.
 */
export async function terminarReserva(
	contexto: ContextoDeAccion,
	reservaId: string,
	fin:
		| { estado: "consumida"; movimientoId: string }
		| { estado: "liberada"; motivoFin: MotivoDeFin; nota?: string }
		| { estado: "transferida"; motivoFin: MotivoDeFin; a: string; nota?: string },
): Promise<void> {
	await contexto.transaccion
		.update(reservas)
		.set({
			estado: fin.estado,
			terminadaEn: contexto.ahora.toString(),
			motivoFin: fin.estado === "consumida" ? "cumplida" : fin.motivoFin,
			...(fin.estado === "consumida" ? { consumidaPorMovimientoId: fin.movimientoId } : {}),
			...(fin.estado === "transferida" ? { transferidaAReservaId: fin.a } : {}),
			...(fin.estado !== "consumida" && fin.nota !== undefined ? { notaFin: fin.nota } : {}),
		})
		.where(and(eq(reservas.id, reservaId), eq(reservas.estado, "activa")));
}

/** Lo que copia una reserva al partirse: todo menos su estado, su id y sus piezas. */
function copiaDe(reserva: Reserva): ReservaNueva {
	return {
		ubicacionId: reserva.ubicacionId,
		varianteId: reserva.varianteId,
		piezas: reserva.piezas,
		motivo: reserva.motivo,
		pedidoId: reserva.pedidoId,
		notaEntregaId: reserva.notaEntregaId,
		pedidoLineaId: reserva.pedidoLineaId,
		pedidoLineaRenglonId: reserva.pedidoLineaRenglonId,
		apartadoTiendaId: reserva.apartadoTiendaId,
		pedidoEspecialTiendaId: reserva.pedidoEspecialTiendaId,
		traspasoId: reserva.traspasoId,
		venceEn: reserva.venceEn,
		separadaEn: reserva.separadaEn,
	};
}

/**
 * Parte una reserva activa: `piezas` van a una nueva (la parte) y el resto, a otra (el resto, que sigue como
 * estaba). La original queda `transferida` al resto, con el motivo.
 * @param contexto El contexto de la acción.
 * @param reserva La reserva, activa, con más piezas que `piezas`.
 * @param piezas Las de la parte.
 * @param motivoFin Por qué se partió.
 * @returns La parte, ya creada y activa, igual que la original salvo sus piezas.
 * @throws Error si `piezas` no es menor que las de la reserva.
 */
export async function partirReserva(
	contexto: ContextoDeAccion,
	reserva: Reserva,
	piezas: number,
	motivoFin: MotivoDeFin,
): Promise<string> {
	if (piezas <= 0 || piezas >= reserva.piezas)
		throw new Error(`no se parte una reserva de ${reserva.piezas} en ${piezas}`);
	const parte = await crearReserva(contexto, { ...copiaDe(reserva), piezas });
	const resto = await crearReserva(contexto, { ...copiaDe(reserva), piezas: reserva.piezas - piezas });
	await terminarReserva(contexto, reserva.id, {
		estado: "transferida",
		motivoFin,
		a: resto,
		nota: `${piezas} de ${reserva.piezas} pasaron a ${parte}`,
	});
	return parte;
}

/**
 * Toma hasta `piezas` de unas reservas activas, en su orden: las enteras primero y, si la última sobra, la parte.
 * @param contexto El contexto de la acción.
 * @param suyas Las reservas, en el orden en que se toman.
 * @param piezas Cuántas.
 * @param motivoFin Por qué se parte la última, si se parte.
 * @returns Las reservas tomadas, como quedaron: la entera, o la parte nueva con sus piezas.
 */
export async function tomarDeReservas(
	contexto: ContextoDeAccion,
	suyas: readonly Reserva[],
	piezas: number,
	motivoFin: MotivoDeFin,
): Promise<Reserva[]> {
	const tomadas: Reserva[] = [];
	let falta = piezas;
	for (const reserva of suyas) {
		if (falta <= 0) break;
		if (reserva.piezas <= falta) {
			tomadas.push(reserva);
			falta -= reserva.piezas;
		} else {
			tomadas.push({ ...reserva, id: await partirReserva(contexto, reserva, falta, motivoFin), piezas: falta });
			falta = 0;
		}
	}
	return tomadas;
}

/**
 * Las reservas activas que cumplen el filtro, en el orden en que se toman (la más vieja primero).
 * @param transaccion La transacción.
 * @param donde El filtro.
 */
export function reservasActivas(transaccion: Transaccion, donde: ReturnType<typeof and>) {
	return transaccion
		.select()
		.from(reservas)
		.where(and(eq(reservas.estado, "activa"), donde))
		.orderBy(asc(reservas.creadoEn), asc(reservas.id));
}

/**
 * Si todas las reservas activas de un W- ya están en Aduana: entonces queda listo para empacar (ver pedidos en línea,
 * «Estados»). Lo usan la recepción en aduana, «No la encuentro» y lo que aparta para un W-.
 * @param transaccion La transacción.
 * @param pedidoLineaId El W-.
 * @param aduana El id de Aduana.
 */
export async function todoEnAduana(transaccion: Transaccion, pedidoLineaId: string, aduana: string): Promise<boolean> {
	const activas = await reservasActivas(transaccion, eq(reservas.pedidoLineaId, pedidoLineaId));
	return activas.length > 0 && activas.every((reserva) => reserva.ubicacionId === aduana);
}

/**
 * Las piezas libres de una variante en una ubicación: existencia menos reservas activas. Puede ser negativo.
 * @param transaccion La transacción (quien decide con esto ya tomó el candado de la variante).
 * @param ubicacionId La ubicación.
 * @param varianteId La variante.
 */
export async function libresEn(transaccion: Transaccion, ubicacionId: string, varianteId: string): Promise<number> {
	const { rows } = await transaccion.execute(sql`
		SELECT coalesce((SELECT piezas FROM existencias WHERE ubicacion_id = ${ubicacionId} AND variante_id = ${varianteId}), 0)
			- coalesce((SELECT sum(piezas) FROM reservas
				WHERE estado = 'activa' AND ubicacion_id = ${ubicacionId} AND variante_id = ${varianteId}), 0) AS libres`);
	return Number(rows[0]?.libres ?? 0);
}

/**
 * Cómo se llama una variante en un mensaje: «Playera polo blanca lisa talla 10».
 * @param transaccion La transacción.
 * @param varianteId La variante.
 */
export async function nombreDeVariante(
	transaccion: Transaccion,
	varianteId: string,
): Promise<{ prenda: string; talla: string }> {
	const [suya] = await transaccion
		.select({ prenda: productos.nombre, talla: tallas.nombre })
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(eq(variantes.id, varianteId));
	return suya ?? { prenda: "La prenda", talla: "?" };
}

/** Un renglón de un movimiento, con lo que importa a las reservas. */
interface RenglonQueViaja {
	origen: string | null;
	destino: string | null;
	varianteId?: string | undefined;
	piezas?: number | undefined;
	traspasoId?: string | null | undefined;
}

/**
 * Paso 5 de `escribirMovimiento`: las reservas activas de las piezas de un traspaso viajan con ellas. Las que
 * estaban en el origen del renglón pasan a su destino (hasta las piezas del renglón); al llegar al destino del
 * traspaso se les quita el traspaso. Si salen a Fuera con una entrega (`tiposQueEntregan`), se cumplen con el
 * movimiento; con otra salida (una pérdida, una merma) no se tocan. No es otro movimiento.
 * @param contexto El contexto de la acción (el candado de la variante ya está tomado).
 * @param tipo El tipo del movimiento.
 * @param movimientoId El movimiento que las lleva.
 * @param renglones Los renglones del movimiento.
 * @returns Si alguna reserva cambió.
 */
export async function moverReservasConSuPieza(
	contexto: ContextoDeAccion,
	tipo: TipoDeMovimiento,
	movimientoId: string,
	renglones: readonly RenglonQueViaja[],
): Promise<boolean> {
	const { transaccion } = contexto;
	let cambio = false;
	for (const renglon of renglones) {
		const { varianteId, traspasoId, origen } = renglon;
		if (varianteId === undefined || traspasoId === undefined || traspasoId === null || origen === null) continue;
		// Solo una entrega cumple la reserva; una pérdida, una merma o una devolución al proveedor no: la reserva se
		// queda donde estaba, entera, y sus libres en negativo lo explican.
		if (renglon.destino === null && !tiposQueEntregan.includes(tipo)) continue;
		const suyas = await reservasActivas(
			transaccion,
			and(eq(reservas.traspasoId, traspasoId), eq(reservas.varianteId, varianteId), eq(reservas.ubicacionId, origen)),
		);
		const tomadas = await tomarDeReservas(contexto, suyas, renglon.piezas ?? 0, "reasignada");
		if (tomadas.length === 0) continue;
		cambio = true;
		const ids = tomadas.map((tomada) => tomada.id);
		if (renglon.destino === null) {
			for (const id of ids) await terminarReserva(contexto, id, { estado: "consumida", movimientoId });
			continue;
		}
		const [traspaso] = await transaccion
			.select({ destino: traspasos.destinoUbicacionId })
			.from(traspasos)
			.where(eq(traspasos.id, traspasoId));
		const llego = traspaso?.destino === renglon.destino;
		await transaccion
			.update(reservas)
			.set({ ubicacionId: renglon.destino, ...(llego ? { traspasoId: null } : {}) })
			.where(inArray(reservas.id, ids));
	}
	return cambio;
}
