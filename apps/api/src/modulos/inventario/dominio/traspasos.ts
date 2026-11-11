/**
 * Los traspasos A-: crearlos, cambiarlos de estado con la tabla de transiciones y repartirlos sin mover.
 * Fase 9 · docs/modulos/inventario/traspasos.md («Estados», «Repartir», reglas 2 y 7)
 *
 * Corren en la transacción de quien los llama: las acciones de Bodega, Aduana, Ventas, Tienda en línea y
 * Calidad, cada una con su transición. Una transición que no está en la tabla es un error del programa. Repartir
 * no es un movimiento: las piezas no cambian de lugar; solo pasan de un traspaso a otro.
 */

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	type EstadoDeTraspaso,
	estadosDeTraspaso,
	estadosFinalesDeTraspaso,
	reservas,
	type TipoDeTraspaso,
	traspasoLineas,
	traspasos,
} from "../tablas.ts";
import { candadoDeVariantes } from "./candados.ts";

/** Los estados con que nace un traspaso. */
export type EstadoInicial = "en_camino_aduana" | "en_aduana" | "esperado";

/**
 * La tabla de transiciones (docs/modulos/inventario/traspasos.md, «Estados»): de cada estado, a cuáles se puede
 * pasar. Cada transición la usa la fase de la acción que la provoca.
 */
export const transicionesDeTraspaso: Readonly<Record<EstadoDeTraspaso, readonly EstadoDeTraspaso[]>> = {
	esperado: ["en_aduana", "en_camino_aduana", "salio"],
	en_camino_aduana: ["en_aduana", "cancelado"],
	en_aduana: ["en_transito", "salio", "repartido"],
	en_transito: ["recibido", "con_diferencia"],
	recibido: [],
	con_diferencia: [],
	salio: [],
	repartido: [],
	cancelado: [],
};

/** Un lado de un traspaso: una ubicación o algo de fuera. */
export type LadoDeTraspaso =
	| { ubicacionId: string }
	| { externo: "proveedor" | "cliente_externo" | "cliente_linea" | "merma" };

/** Las referencias a otros documentos que puede llevar un traspaso. */
export type ReferenciasDeTraspaso = Partial<
	Pick<
		typeof traspasos.$inferInsert,
		| "solicitudTiendaId"
		| "salidaTiendaId"
		| "solicitudEnvioId"
		| "folioRb"
		| "pedidoId"
		| "notaEntregaId"
		| "pedidoEspecialTiendaId"
		| "loteId"
		| "reprocesoId"
		| "ordenCompraId"
		| "devolucionLineaId"
		| "notaCreditoId"
		| "recepcionAduanaId"
		| "despachoId"
		| "recepcionDestinoId"
	>
>;

/** Un renglón de un traspaso nuevo: de prenda (variante y piezas) o de material (material, rollo y cantidad). */
export interface RenglonDeTraspaso {
	varianteId?: string;
	piezas?: number;
	materialId?: string;
	rolloId?: string | null;
	/** Texto decimal con hasta tres decimales: `"12.500"`. */
	cantidad?: string;
	loteId?: string | null;
	pedidoLineaId?: string | null;
	defectoId?: string | null;
	nota?: string | null;
}

/** Lo que se pide para crear un traspaso. */
export interface PedidoDeTraspaso {
	/** El id, si viene de fuera (el que trajo la caja); si no, uno nuevo. */
	id?: string;
	/** El folio, si no es un A- del contador (el de una salida de tienda). */
	folio?: string;
	tipo: TipoDeTraspaso;
	estado: EstadoInicial;
	origen: LadoDeTraspaso | null;
	destino: LadoDeTraspaso | null;
	renglones: readonly RenglonDeTraspaso[];
	referencias?: ReferenciasDeTraspaso;
	traspasoPadreId?: string;
	fechaSalidaEsperada?: string | null;
	/** Cuándo llegó a aduana, si nace en aduana con una hora que no es la de la acción (un hijo hereda la del padre). */
	llegoAduanaEn?: string;
	nota?: string | null;
}

/** Un traspaso recién creado. */
export interface TraspasoCreado {
	traspasoId: string;
	folio: string;
}

/** Lo que regresa `admin.tomar_folio` cuando se pide uno. */
const folioTomado = z.object({ folio: z.string() });

/** Las columnas de un lado. */
function columnasDeLado(lado: LadoDeTraspaso | null, de: "origen" | "destino") {
	const ubicacion = lado !== null && "ubicacionId" in lado ? lado.ubicacionId : null;
	const externo = lado !== null && "externo" in lado ? lado.externo : null;
	return de === "origen"
		? { origenUbicacionId: ubicacion, origenExterno: externo }
		: { destinoUbicacionId: ubicacion, destinoExterno: externo };
}

/**
 * Crea un traspaso en su estado inicial, con sus renglones. En camino, lo enviado es lo que dijo quien manda; en
 * aduana, lo que se contó al recibir (enviadas = recibidas en aduana); esperado, lo que se espera.
 * @param contexto El contexto de la acción.
 * @param pedido El tipo, el estado inicial, los lados, los renglones y las referencias.
 * @returns El traspaso y su folio (`A-{n}` del contador `partida_aduana`, si no viene uno).
 * @throws Error (un `500`) si no trae renglones o un renglón no tiene su forma.
 */
export async function crearTraspaso(contexto: ContextoDeAccion, pedido: PedidoDeTraspaso): Promise<TraspasoCreado> {
	if (pedido.renglones.length === 0) throw new Error("un traspaso sin renglones");
	const id = pedido.id ?? uuidv7();
	const folio = pedido.folio ?? (await tomarFolioDeTraspaso(contexto));
	const ahora = contexto.ahora.toString();
	const creadoPor = contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
	await contexto.transaccion.insert(traspasos).values({
		id,
		folio,
		tipo: pedido.tipo,
		estado: pedido.estado,
		...columnasDeLado(pedido.origen, "origen"),
		...columnasDeLado(pedido.destino, "destino"),
		...pedido.referencias,
		traspasoPadreId: pedido.traspasoPadreId ?? null,
		fechaSalidaEsperada: pedido.fechaSalidaEsperada ?? null,
		enviadoEn: pedido.estado === "en_camino_aduana" ? ahora : null,
		llegoAduanaEn: pedido.estado === "en_aduana" ? (pedido.llegoAduanaEn ?? ahora) : null,
		nota: pedido.nota ?? null,
		dispositivoId: contexto.quien.tipo === "aparato" ? contexto.quien.dispositivoId : null,
		personaId: contexto.quien.tipo === "aparato" ? (contexto.quien.personaId ?? null) : null,
		creadoPor,
	});
	const enAduana = pedido.estado === "en_aduana";
	await contexto.transaccion.insert(traspasoLineas).values(
		pedido.renglones.map((renglon, indice) => {
			const esPrenda = renglon.varianteId !== undefined;
			if (esPrenda === (renglon.materialId !== undefined))
				throw new Error(`renglón ${indice + 1}: o prenda o material`);
			return {
				id: uuidv7(),
				traspasoId: id,
				renglon: indice + 1,
				varianteId: renglon.varianteId ?? null,
				materialId: renglon.materialId ?? null,
				rolloId: renglon.rolloId ?? null,
				loteId: renglon.loteId ?? null,
				piezasEnviadas: esPrenda ? (renglon.piezas ?? 0) : null,
				piezasRecibidasAduana: esPrenda && enAduana ? (renglon.piezas ?? 0) : null,
				cantidadEnviada: esPrenda ? null : (renglon.cantidad ?? "0"),
				cantidadRecibidaAduana: !esPrenda && enAduana ? (renglon.cantidad ?? "0") : null,
				pedidoLineaId: renglon.pedidoLineaId ?? null,
				defectoId: renglon.defectoId ?? null,
				nota: renglon.nota ?? null,
				creadoPor,
			};
		}),
	);
	return { traspasoId: id, folio };
}

/**
 * Toma el siguiente folio `A-{n}`.
 * @param contexto El contexto de la acción.
 */
async function tomarFolioDeTraspaso(contexto: ContextoDeAccion): Promise<string> {
	return folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "partida_aduana" })).folio;
}

/**
 * Lee un traspaso y lo bloquea hasta que termine la transacción, en el orden fijo: primero el candado de las
 * variantes, después el traspaso (como un movimiento y una reserva).
 * @param contexto El contexto de la acción.
 * @param traspasoId El traspaso.
 * @param varianteIds Las variantes que toca quien lo bloquea; sin ellas, todas las de sus renglones. Quien reparte
 * pasa solo las suyas: ya las tiene tomadas, y pedir otra después de sus existencias invertiría el orden.
 * @throws Error si no existe.
 */
export async function bloquearTraspaso(contexto: ContextoDeAccion, traspasoId: string, varianteIds?: Iterable<string>) {
	const suyas =
		varianteIds ??
		(
			await contexto.transaccion
				.selectDistinct({ varianteId: traspasoLineas.varianteId })
				.from(traspasoLineas)
				.where(eq(traspasoLineas.traspasoId, traspasoId))
		).flatMap(({ varianteId }) => (varianteId === null ? [] : [varianteId]));
	await candadoDeVariantes(contexto.transaccion, suyas);
	const [traspaso] = await contexto.transaccion
		.select()
		.from(traspasos)
		.where(eq(traspasos.id, traspasoId))
		.for("no key update");
	if (traspaso === undefined) throw new Error(`no existe el traspaso ${traspasoId}`);
	return traspaso;
}

/**
 * Dice si un estado es final.
 * @param estado El estado.
 */
function esFinal(estado: EstadoDeTraspaso): boolean {
	return estadosFinalesDeTraspaso.some((final) => final === estado);
}

/**
 * Cambia el estado de un traspaso, si la tabla de transiciones lo deja. Al llegar a aduana pone su hora; al
 * salir de su origen, la suya; a un estado final, `terminado_en`; al cancelar, quién, cuándo y por qué.
 * @param contexto El contexto de la acción que lo cambia.
 * @param traspasoId El traspaso.
 * @param nuevo El estado al que pasa.
 * @param cancelacion El motivo, al pasar a `cancelado`.
 * @returns El estado que tenía.
 * @throws Error (un `500`) si la transición no está en la tabla o falta el motivo de la cancelación.
 */
export async function cambiarEstadoTraspaso(
	contexto: ContextoDeAccion,
	traspasoId: string,
	nuevo: EstadoDeTraspaso,
	cancelacion?: { motivo: string },
): Promise<EstadoDeTraspaso> {
	const traspaso = await bloquearTraspaso(contexto, traspasoId);
	const actual = estadoDe(traspaso.estado);
	if (!transicionesDeTraspaso[actual].includes(nuevo)) {
		throw new Error(`el traspaso ${traspaso.folio} no pasa de ${actual} a ${nuevo}`);
	}
	if (nuevo === "cancelado" && cancelacion === undefined) throw new Error("cancelar pide su motivo");
	const ahora = contexto.ahora.toString();
	await contexto.transaccion
		.update(traspasos)
		.set({
			estado: nuevo,
			...(nuevo === "en_camino_aduana" && traspaso.enviadoEn === null ? { enviadoEn: ahora } : {}),
			...(nuevo === "en_aduana" && traspaso.llegoAduanaEn === null ? { llegoAduanaEn: ahora } : {}),
			...(esFinal(nuevo) ? { terminadoEn: ahora } : {}),
			...(nuevo === "cancelado"
				? {
						canceladoEn: ahora,
						canceladoPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
						motivoCancelacion: cancelacion?.motivo ?? null,
					}
				: {}),
		})
		.where(eq(traspasos.id, traspasoId));
	return actual;
}

/**
 * El estado de un traspaso guardado (su CHECK solo deja los conocidos).
 * @throws Error si no es uno conocido.
 */
function estadoDe(estado: string): EstadoDeTraspaso {
	const conocido = estadosDeTraspaso.find((suyo) => suyo === estado);
	if (conocido === undefined) throw new Error(`estado de traspaso desconocido: ${estado}`);
	return conocido;
}

/** Un decimal de tres cifras como milésimos enteros, para comparar sin perder nada. */
function milesimos(cantidad: string | null): number {
	return Math.round(Number(cantidad ?? "0") * 1000);
}

/** Lo que se reparte de un renglón del padre. */
export interface RenglonARepartir {
	lineaId: string;
	piezas?: number;
	/** Texto decimal con hasta tres decimales. */
	cantidad?: string;
}

/** Lo que se pide para repartir. */
export interface PedidoDeReparto {
	padreId: string;
	renglones: readonly RenglonARepartir[];
	/** Las reservas activas del padre que se llevan esas piezas: pasan al hijo. */
	reservaIds?: readonly string[];
	hijo: {
		tipo: TipoDeTraspaso;
		destino: LadoDeTraspaso | null;
		referencias?: ReferenciasDeTraspaso;
		fechaSalidaEsperada?: string | null;
		nota?: string | null;
	};
}

/**
 * Las variantes que toca un reparto: las de los renglones que reparte y las de las reservas que se lleva. Se leen
 * sin candado, solo para saber cuáles pedir.
 * @param contexto El contexto de la acción que reparte.
 * @param pedido El reparto.
 */
async function variantesDelReparto(contexto: ContextoDeAccion, pedido: PedidoDeReparto): Promise<string[]> {
	const lineaIds = pedido.renglones.map((renglon) => renglon.lineaId);
	const reservaIds = pedido.reservaIds ?? [];
	const deLineas =
		lineaIds.length === 0
			? []
			: await contexto.transaccion
					.selectDistinct({ varianteId: traspasoLineas.varianteId })
					.from(traspasoLineas)
					.where(inArray(traspasoLineas.id, lineaIds));
	const deReservas =
		reservaIds.length === 0
			? []
			: await contexto.transaccion
					.selectDistinct({ varianteId: reservas.varianteId })
					.from(reservas)
					.where(inArray(reservas.id, [...reservaIds]));
	return [...deLineas, ...deReservas].flatMap(({ varianteId }) => (varianteId === null ? [] : [varianteId]));
}

/**
 * Las reservas que se lleva un reparto: activas y del padre. Se leen con el candado ya puesto.
 * @throws Error (un `500`) si una no es una reserva activa del padre.
 */
async function reservasDelPadre(contexto: ContextoDeAccion, pedido: PedidoDeReparto) {
	const ids = pedido.reservaIds ?? [];
	if (ids.length === 0) return [];
	const suyas = await contexto.transaccion
		.select({ id: reservas.id, varianteId: reservas.varianteId })
		.from(reservas)
		.where(and(inArray(reservas.id, [...ids]), eq(reservas.estado, "activa"), eq(reservas.traspasoId, pedido.padreId)));
	if (suyas.length !== new Set(ids).size) throw new Error("una reserva del reparto no es una reserva activa del padre");
	return suyas;
}

/** Un reparto hecho: el hijo, su folio y si el padre quedó `repartido`. */
export interface RepartoHecho extends TraspasoCreado {
	padreRepartido: boolean;
	/** Por renglón del padre, el renglón del hijo que se llevó sus piezas. */
	lineasDelHijo: Map<string, string>;
}

/**
 * Reparte parte de lo que queda en aduana de un traspaso a un hijo nuevo, sin mover nada. El padre suma lo
 * repartido y, si ya no le queda nada en aduana, pasa a `repartido`. El hijo nace en aduana con folio
 * `{padre}-{n}`, el origen del padre y su misma hora de llegada (su antigüedad sigue contando); las reservas que
 * se llevan esas piezas pasan al hijo. Guarda el evento `traspaso.repartido`.
 * @param contexto El contexto de la acción que reparte.
 * @param pedido El padre, lo que se reparte de cada renglón y el tipo, el destino y las referencias del hijo.
 * @returns El hijo, su folio, si el padre quedó repartido y qué renglón del hijo lleva cada uno del padre.
 * @throws Error (un `500`) si el padre no está en aduana o se reparte más de lo que queda en un renglón.
 */
export async function repartirTraspaso(contexto: ContextoDeAccion, pedido: PedidoDeReparto): Promise<RepartoHecho> {
	const { transaccion } = contexto;
	// El candado de las variantes que se reparten antes que el padre (lo toma `bloquearTraspaso`, el mismo orden que
	// un movimiento); con él puesto se leen las reservas que se lleva.
	const padre = await bloquearTraspaso(contexto, pedido.padreId, await variantesDelReparto(contexto, pedido));
	const llevadas = await reservasDelPadre(contexto, pedido);
	if (padre.estado !== "en_aduana") throw new Error(`el traspaso ${padre.folio} no está en aduana: ${padre.estado}`);
	const lineas = await transaccion
		.select()
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, padre.id))
		.orderBy(traspasoLineas.renglon);
	const renglones = pedido.renglones.map((reparte) => {
		const linea = lineas.find((suya) => suya.id === reparte.lineaId);
		if (linea === undefined) throw new Error(`el renglón ${reparte.lineaId} no es de ${padre.folio}`);
		const esPrenda = linea.varianteId !== null;
		const queda = esPrenda
			? (linea.piezasRecibidasAduana ?? 0) - linea.piezasRepartidas
			: milesimos(linea.cantidadRecibidaAduana) - milesimos(linea.cantidadRepartida);
		const pide = esPrenda ? (reparte.piezas ?? 0) : milesimos(reparte.cantidad ?? "0");
		if (pide <= 0 || pide > queda) {
			throw new Error(`renglón ${linea.renglon} de ${padre.folio}: se reparte ${pide} y quedan ${queda}`);
		}
		return { linea, reparte, esPrenda };
	});
	if (new Set(renglones.map(({ linea }) => linea.id)).size !== renglones.length) {
		throw new Error("un renglón del padre va una sola vez en el reparto");
	}
	// El padre suma lo repartido.
	for (const { linea, reparte, esPrenda } of renglones) {
		await transaccion
			.update(traspasoLineas)
			.set(
				esPrenda
					? { piezasRepartidas: sql`${traspasoLineas.piezasRepartidas} + ${reparte.piezas ?? 0}` }
					: { cantidadRepartida: sql`${traspasoLineas.cantidadRepartida} + ${reparte.cantidad ?? "0"}::numeric` },
			)
			.where(eq(traspasoLineas.id, linea.id));
	}
	const [quedan] = await transaccion
		.select({ renglones: count() })
		.from(traspasoLineas)
		.where(
			and(
				eq(traspasoLineas.traspasoId, padre.id),
				sql`coalesce(${traspasoLineas.piezasRecibidasAduana} - ${traspasoLineas.piezasRepartidas}, ${traspasoLineas.cantidadRecibidaAduana} - ${traspasoLineas.cantidadRepartida}) > 0`,
			),
		);
	const padreRepartido = (quedan?.renglones ?? 0) === 0;
	if (padreRepartido) await cambiarEstadoTraspaso(contexto, padre.id, "repartido");
	// El hijo: `{padre}-{n}`, el siguiente hijo de ese padre (el candado del padre los pone en fila).
	const [hijos] = await transaccion
		.select({ cuantos: count() })
		.from(traspasos)
		.where(eq(traspasos.traspasoPadreId, padre.id));
	const origen: LadoDeTraspaso | null =
		padre.origenUbicacionId !== null
			? { ubicacionId: padre.origenUbicacionId }
			: padre.origenExterno === "proveedor" ||
					padre.origenExterno === "cliente_externo" ||
					padre.origenExterno === "cliente_linea"
				? { externo: padre.origenExterno }
				: null;
	const hijo = await crearTraspaso(contexto, {
		folio: `${padre.folio}-${(hijos?.cuantos ?? 0) + 1}`,
		tipo: pedido.hijo.tipo,
		estado: "en_aduana",
		origen,
		destino: pedido.hijo.destino,
		renglones: renglones.map(({ linea, reparte, esPrenda }) => ({
			...(esPrenda
				? { varianteId: linea.varianteId ?? "", piezas: reparte.piezas ?? 0 }
				: { materialId: linea.materialId ?? "", rolloId: linea.rolloId, cantidad: reparte.cantidad ?? "0" }),
			loteId: linea.loteId,
			pedidoLineaId: linea.pedidoLineaId,
			defectoId: linea.defectoId,
		})),
		...(pedido.hijo.referencias === undefined ? {} : { referencias: pedido.hijo.referencias }),
		traspasoPadreId: padre.id,
		fechaSalidaEsperada: pedido.hijo.fechaSalidaEsperada ?? padre.fechaSalidaEsperada,
		...(padre.llegoAduanaEn === null ? {} : { llegoAduanaEn: padre.llegoAduanaEn }),
		nota: pedido.hijo.nota ?? null,
	});
	const delHijo = await transaccion
		.select({ id: traspasoLineas.id, renglon: traspasoLineas.renglon })
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, hijo.traspasoId));
	const lineasDelHijo = new Map(
		renglones.map(({ linea }, indice) => [linea.id, delHijo.find((suya) => suya.renglon === indice + 1)?.id ?? ""]),
	);
	// Las reservas de esas piezas pasan al hijo.
	if (llevadas.length > 0) {
		await transaccion
			.update(reservas)
			.set({ traspasoId: hijo.traspasoId })
			.where(
				and(
					inArray(
						reservas.id,
						llevadas.map((reserva) => reserva.id),
					),
					eq(reservas.estado, "activa"),
				),
			);
	}
	contexto.guardarEvento({
		tipo: "traspaso.repartido",
		datos: { padre_id: padre.id, hijo_id: hijo.traspasoId, padre_repartido: padreRepartido },
		tablas: ["traspasos", "traspaso_lineas", ...(llevadas.length > 0 ? ["reservas"] : [])],
		entidad: "traspasos",
		entidadId: hijo.traspasoId,
	});
	return { ...hijo, padreRepartido, lineasDelHijo };
}
