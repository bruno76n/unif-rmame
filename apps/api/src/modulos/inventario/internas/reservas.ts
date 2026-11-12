/**
 * Las internas de las reservas: apartar, liberar, confirmar el pago, apartar para una nota y devolverlo.
 * Fase 9 · docs/modulos/inventario/reservas.md («Acciones internas»)
 *
 * Las llaman otros módulos en su propia transacción (Ventas, Tienda en línea y la caja); no llevan clave propia.
 * Antes de escoger o mover reservas toman el candado de cada variante y bloquean sus existencias en el orden fijo:
 * dos que quieren las últimas piezas de Bodega no apartan de más. Un pedido en línea sin pieza en ningún lado se
 * aparta igual en Bodega y abre su excepción.
 */

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { bloquearExistencias, candadoDeVariantes } from "../dominio/candados.ts";
import {
	crearReserva,
	libresEn,
	type MotivoDeFin,
	nombreDeVariante,
	type Reserva,
	reservasActivas,
	terminarReserva,
	todoEnAduana,
	tomarDeReservas,
} from "../dominio/reservas.ts";
import { type LadoDeTraspaso, repartirTraspaso, type TraspasoCreado } from "../dominio/traspasos.ts";
import { reservas, traspasoLineas, traspasos, ubicaciones } from "../tablas.ts";

/** Las ubicaciones por tipo y la Bodega, la Aduana y las tiendas que surten en línea. */
async function leerUbicaciones(contexto: ContextoDeAccion) {
	const todas = await contexto.transaccion
		.select({
			id: ubicaciones.id,
			tipo: ubicaciones.tipo,
			surteEnLinea: ubicaciones.surteEnLinea,
			existenciaDesde: ubicaciones.existenciaDesde,
		})
		.from(ubicaciones)
		.where(isNull(ubicaciones.bajaEn))
		.orderBy(ubicaciones.orden);
	const de = (tipo: string) => {
		const suya = todas.find((ubicacion) => ubicacion.tipo === tipo);
		if (suya === undefined) throw new Error(`no hay ubicación ${tipo}`);
		return suya.id;
	};
	return {
		bodega: de("bodega"),
		aduana: de("aduana"),
		tipoDe: new Map(todas.map((ubicacion) => [ubicacion.id, ubicacion.tipo])),
		// Una tienda surte en línea si lo dice y si su caja ya sincroniza (Unifórmame lleva su existencia).
		tiendasEnLinea: todas
			.filter(
				(ubicacion) => ubicacion.tipo === "tienda" && ubicacion.surteEnLinea && ubicacion.existenciaDesde !== null,
			)
			.map((ubicacion) => ubicacion.id),
	};
}

/**
 * Toma los candados de unas variantes y bloquea sus existencias en esas ubicaciones, en el orden fijo.
 * @param contexto El contexto de la acción.
 * @param varianteIds Las variantes.
 * @param ubicacionIds Las ubicaciones donde se va a decidir.
 */
async function bloquear(contexto: ContextoDeAccion, varianteIds: readonly string[], ubicacionIds: readonly string[]) {
	await candadoDeVariantes(contexto.transaccion, varianteIds);
	await bloquearExistencias(
		contexto.transaccion,
		varianteIds.flatMap((varianteId) => ubicacionIds.map((ubicacionId) => ({ ubicacionId, varianteId }))),
	);
}

/** Guarda un evento de reservas. */
function eventoDeReservas(
	contexto: ContextoDeAccion,
	tipo: `reserva.${string}`,
	datos: Record<string, string | number | boolean | null>,
	tablas: string[] = [],
) {
	contexto.guardarEvento({ tipo, datos, tablas: ["reservas", ...tablas] });
}

// ---------------------------------------------------------------------------------------------------------------
// inventario.reservar

/** Lo que recibe `inventario.reservar`. */
const pedidoDeReservar = z
	.object({
		motivo: z.enum(["pedido_externo", "apartado_tienda", "pedido_linea"]),
		pedido_id: z.uuid().optional(),
		apartado_tienda_id: z.uuid().optional(),
		pedido_linea_id: z.uuid().optional(),
		renglones: z
			.array(
				z.object({
					variante_id: z.uuid(),
					piezas: z.number().int().positive(),
					ubicacion_id: z.uuid().optional(),
					pedido_linea_renglon_id: z.uuid().optional(),
					id: z.uuid().optional(),
				}),
			)
			.min(1),
		pago_pendiente: z.boolean().optional(),
		vence_en: z.iso.datetime({ offset: true }).optional(),
		/** En un W-: piezas que Bodega no encontró y siguen en su existencia hasta contarlas; no cuentan como libres. */
		no_encontradas_en_bodega: z.number().int().positive().optional(),
	})
	.strict();

/** Lo que se apartó de un renglón: en qué ubicaciones y, en un W-, la promesa. */
interface RenglonApartado {
	variante_id: string;
	reservas: { reserva_id: string; ubicacion_id: string; piezas: number }[];
	promesa?: "sale_hoy" | "sale_manana";
	/** En un W-: si no hubo pieza en ningún lado y se apartó en Bodega, en negativo. */
	sin_pieza?: boolean;
}

/**
 * `inventario.reservar`: aparta piezas para un PE-, un apartado de tienda o un W-.
 * @param contexto El contexto de la acción que aparta.
 * @param datos El motivo con su documento, los renglones y, en un W- con pago pendiente, su vencimiento.
 * @returns Por renglón, sus reservas y, en un W-, la promesa; y en un W-, si todas sus reservas activas quedaron en
 * Aduana (`todo_en_aduana`).
 * @throws `422 sin_libres` si un PE- pide más de lo libre en Bodega.
 */
export async function reservar(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ renglones: RenglonApartado[]; todo_en_aduana?: boolean }> {
	const pedido = pedidoDeReservar.parse(datos);
	const apartado = await apartar(contexto, pedido, "pedido_linea_sin_pieza");
	if (pedido.motivo !== "pedido_linea" || pedido.pedido_linea_id === undefined) return apartado;
	const { todo_en_aduana } = await comoQuedaElPedidoLinea(contexto, pedido.pedido_linea_id);
	return { ...apartado, todo_en_aduana };
}

/**
 * Aparta lo pedido; un W- sin pieza en ningún lado abre la excepción `sinPieza`.
 * @param contexto El contexto de la acción.
 * @param pedido Lo que se aparta, ya revisado.
 * @param sinPieza La excepción de un W- sin pieza: `pedido_linea_sin_pieza`, o `pago_despues_de_vencer` si el
 * pago llegó tarde.
 */
async function apartar(
	contexto: ContextoDeAccion,
	pedido: z.infer<typeof pedidoDeReservar>,
	sinPieza: "pedido_linea_sin_pieza" | "pago_despues_de_vencer",
): Promise<{ renglones: RenglonApartado[] }> {
	const lugares = await leerUbicaciones(contexto);
	const documento = documentoDe(pedido);
	const variantesIds = pedido.renglones.map((renglon) => renglon.variante_id);
	const enDondeDecide =
		pedido.motivo === "pedido_externo"
			? [lugares.bodega]
			: pedido.motivo === "pedido_linea"
				? [lugares.bodega, lugares.aduana, ...lugares.tiendasEnLinea]
				: [];
	await bloquear(contexto, variantesIds, enDondeDecide);
	const venceEn = await vencimiento(contexto, pedido);
	const apartados: RenglonApartado[] = [];
	for (const renglon of pedido.renglones) {
		const base = {
			varianteId: renglon.variante_id,
			motivo: pedido.motivo,
			...documento,
			pedidoLineaRenglonId: renglon.pedido_linea_renglon_id ?? null,
			venceEn,
		};
		if (pedido.motivo === "pedido_externo") {
			const libres = await libresEn(contexto.transaccion, lugares.bodega, renglon.variante_id);
			if (renglon.piezas > libres) {
				const { prenda, talla } = await nombreDeVariante(contexto.transaccion, renglon.variante_id);
				throw errorDeRegla("sin_libres", `${prenda} talla ${talla}: solo hay ${Math.max(0, libres)} libres en bodega`);
			}
			const id = await crearReserva(contexto, { ...base, ubicacionId: lugares.bodega, piezas: renglon.piezas });
			apartados.push({
				variante_id: renglon.variante_id,
				reservas: [{ reserva_id: id, ubicacion_id: lugares.bodega, piezas: renglon.piezas }],
			});
		} else if (pedido.motivo === "apartado_tienda") {
			// La pieza está en la mano de la tienda: nunca se rechaza.
			if (renglon.ubicacion_id === undefined) throw new Error("un apartado lleva su tienda");
			const id = await crearReserva(contexto, {
				...base,
				...(renglon.id === undefined ? {} : { id: renglon.id }),
				ubicacionId: renglon.ubicacion_id,
				piezas: renglon.piezas,
			});
			apartados.push({
				variante_id: renglon.variante_id,
				reservas: [{ reserva_id: id, ubicacion_id: renglon.ubicacion_id, piezas: renglon.piezas }],
			});
		} else {
			apartados.push(
				await apartarEnLinea(contexto, lugares, base, renglon.piezas, sinPieza, pedido.no_encontradas_en_bodega ?? 0),
			);
		}
	}
	eventoDeReservas(contexto, "reserva.creada", {
		motivo: pedido.motivo,
		reservas: apartados.reduce((suma, apartado) => suma + apartado.reservas.length, 0),
	});
	return { renglones: apartados };
}

/** La llave del documento de una reserva, según su motivo. */
function documentoDe(pedido: z.infer<typeof pedidoDeReservar>) {
	const id =
		pedido.motivo === "pedido_externo"
			? pedido.pedido_id
			: pedido.motivo === "apartado_tienda"
				? pedido.apartado_tienda_id
				: pedido.pedido_linea_id;
	if (id === undefined) throw new Error(`una reserva ${pedido.motivo} lleva su documento`);
	return pedido.motivo === "pedido_externo"
		? { pedidoId: id }
		: pedido.motivo === "apartado_tienda"
			? { apartadoTiendaId: id }
			: { pedidoLineaId: id };
}

/** El vencimiento de un W- con pago pendiente: el que viene, o ahora más `inventario.horas_reserva_pago_pendiente`. */
async function vencimiento(
	contexto: ContextoDeAccion,
	pedido: z.infer<typeof pedidoDeReservar>,
): Promise<string | null> {
	if (pedido.motivo !== "pedido_linea" || pedido.pago_pendiente !== true) return null;
	if (pedido.vence_en !== undefined) return pedido.vence_en;
	const horas = Number(await contexto.lectura("admin.parametro", { clave: "inventario.horas_reserva_pago_pendiente" }));
	return contexto.ahora.add({ hours: horas }).toString();
}

/** Las ubicaciones del orden de surtido en línea. */
const pasosDeSurtido = ["bodega", "aduana_a_bodega", "tiendas"] as const;

/**
 * Aparta un renglón de un W- en el orden de `inventario.orden_surtido_linea`: puede partirlo en varias
 * ubicaciones. Lo que está en aduana con destino a Bodega se reparte en un hijo `pedido_linea`. Si no hay pieza
 * en ningún lado, lo que falta se aparta en Bodega, en negativo.
 */
async function apartarEnLinea(
	contexto: ContextoDeAccion,
	lugares: Awaited<ReturnType<typeof leerUbicaciones>>,
	base: Omit<Parameters<typeof crearReserva>[1], "ubicacionId" | "piezas">,
	piezas: number,
	sinPieza: "pedido_linea_sin_pieza" | "pago_despues_de_vencer",
	noEncontradas = 0,
): Promise<RenglonApartado> {
	const { transaccion } = contexto;
	const varianteId = base.varianteId;
	const orden = String(await contexto.lectura("admin.parametro", { clave: "inventario.orden_surtido_linea" }))
		.split(",")
		.map((paso) => paso.trim())
		.filter((paso): paso is (typeof pasosDeSurtido)[number] => pasosDeSurtido.some((conocido) => conocido === paso));
	const tomadas: RenglonApartado["reservas"] = [];
	let falta = piezas;
	let enTienda = false;
	for (const paso of orden) {
		if (falta <= 0) break;
		if (paso === "bodega") {
			// Lo que Bodega no encontró sigue en su existencia hasta contarlo: no es libre.
			const libres = (await libresEn(transaccion, lugares.bodega, varianteId)) - noEncontradas;
			const toma = Math.min(falta, Math.max(0, libres));
			if (toma > 0) {
				const id = await crearReserva(contexto, { ...base, ubicacionId: lugares.bodega, piezas: toma });
				tomadas.push({ reserva_id: id, ubicacion_id: lugares.bodega, piezas: toma });
				falta -= toma;
			}
		} else if (paso === "aduana_a_bodega") {
			falta -= await apartarDeAduana(contexto, lugares, base, falta, tomadas);
		} else {
			// La tienda con más libres primero.
			const conLibres = await Promise.all(
				lugares.tiendasEnLinea.map(async (tienda) => ({
					tienda,
					libres: await libresEn(transaccion, tienda, varianteId),
				})),
			);
			for (const { tienda, libres } of conLibres.sort((una, otra) => otra.libres - una.libres)) {
				const toma = Math.min(falta, Math.max(0, libres));
				if (toma <= 0) continue;
				const id = await crearReserva(contexto, { ...base, ubicacionId: tienda, piezas: toma });
				tomadas.push({ reserva_id: id, ubicacion_id: tienda, piezas: toma });
				falta -= toma;
				enTienda = true;
			}
		}
	}
	// Un pedido en línea nunca se queda sin reserva: lo que falta, en Bodega (sus libres quedan en negativo), con
	// su excepción para que alguien lo resuelva.
	if (falta > 0) {
		const id = await crearReserva(contexto, { ...base, ubicacionId: lugares.bodega, piezas: falta });
		tomadas.push({ reserva_id: id, ubicacion_id: lugares.bodega, piezas: falta });
		const { prenda, talla } = await nombreDeVariante(transaccion, varianteId);
		await contexto.interna("inventario.registrar_excepcion", {
			tipo: sinPieza,
			descripcion: `${prenda} talla ${talla}: ${falta} sin pieza en ningún lado; quedaron apartadas en Bodega`,
			ubicacion_id: lugares.bodega,
			variante_id: varianteId,
			documento_tipo: "pedido_linea",
			...(base.pedidoLineaId === undefined || base.pedidoLineaId === null ? {} : { documento_id: base.pedidoLineaId }),
		});
	}
	return {
		variante_id: varianteId,
		reservas: tomadas,
		promesa: enTienda ? "sale_manana" : "sale_hoy",
		...(falta > 0 ? { sin_pieza: true } : {}),
	};
}

/**
 * Aparta lo libre que está en aduana con destino a Bodega: lo reparte en un hijo `pedido_linea` y la reserva
 * apunta al hijo.
 * @returns Cuántas piezas apartó.
 */
async function apartarDeAduana(
	contexto: ContextoDeAccion,
	lugares: Awaited<ReturnType<typeof leerUbicaciones>>,
	base: Omit<Parameters<typeof crearReserva>[1], "ubicacionId" | "piezas">,
	falta: number,
	tomadas: RenglonApartado["reservas"],
): Promise<number> {
	const { transaccion } = contexto;
	const varianteId = base.varianteId;
	// Por renglón de cada traspaso en aduana que va a Bodega: lo que queda menos lo ya apartado de ese traspaso.
	const enAduana = await transaccion
		.select({
			traspasoId: traspasos.id,
			lineaId: traspasoLineas.id,
			queda: sql<number>`${traspasoLineas.piezasRecibidasAduana} - ${traspasoLineas.piezasRepartidas}`.mapWith(Number),
			apartadas:
				sql<number>`coalesce((SELECT sum(r.piezas) FROM reservas r WHERE r.estado = 'activa' AND r.traspaso_id = ${traspasos.id} AND r.variante_id = ${varianteId}), 0)`.mapWith(
					Number,
				),
		})
		.from(traspasos)
		.innerJoin(traspasoLineas, eq(traspasoLineas.traspasoId, traspasos.id))
		.where(
			and(
				eq(traspasos.estado, "en_aduana"),
				eq(traspasos.destinoUbicacionId, lugares.bodega),
				eq(traspasoLineas.varianteId, varianteId),
			),
		)
		.orderBy(traspasos.llegoAduanaEn, traspasoLineas.renglon);
	let tomo = 0;
	for (const linea of enAduana) {
		const libres = Math.min(linea.queda, linea.queda - linea.apartadas);
		const toma = Math.min(falta - tomo, libres);
		if (toma <= 0) continue;
		const hijo = await repartirTraspaso(contexto, {
			padreId: linea.traspasoId,
			renglones: [{ lineaId: linea.lineaId, piezas: toma }],
			hijo: { tipo: "pedido_linea", destino: { externo: "cliente_linea" } },
		});
		// El renglón del hijo lleva su W-.
		await transaccion
			.update(traspasoLineas)
			.set({ pedidoLineaId: base.pedidoLineaId ?? null })
			.where(eq(traspasoLineas.traspasoId, hijo.traspasoId));
		const id = await crearReserva(contexto, {
			...base,
			ubicacionId: lugares.aduana,
			piezas: toma,
			traspasoId: hijo.traspasoId,
		});
		tomadas.push({ reserva_id: id, ubicacion_id: lugares.aduana, piezas: toma });
		tomo += toma;
	}
	return tomo;
}

/**
 * Lo que se reparte de los renglones de prenda de un traspaso para llevarse, por variante, esas piezas: de cada
 * renglón de la variante, hasta lo que le queda en aduana.
 * @param contexto El contexto de la acción.
 * @param traspasoId El traspaso padre.
 * @param porVariante Por variante, las piezas.
 */
export async function renglonesARepartir(
	contexto: ContextoDeAccion,
	traspasoId: string,
	porVariante: ReadonlyMap<string, number>,
) {
	const lineas = await contexto.transaccion
		.select()
		.from(traspasoLineas)
		.where(and(eq(traspasoLineas.traspasoId, traspasoId), isNotNull(traspasoLineas.varianteId)))
		.orderBy(traspasoLineas.renglon);
	return [...porVariante].flatMap(([varianteId, piezas]) => {
		let falta = piezas;
		return lineas
			.filter((linea) => linea.varianteId === varianteId)
			.flatMap((linea) => {
				const toma = Math.min(falta, (linea.piezasRecibidasAduana ?? 0) - linea.piezasRepartidas);
				if (toma <= 0) return [];
				falta -= toma;
				return [{ lineaId: linea.id, piezas: toma, varianteId }];
			});
	});
}

/** Suma piezas por variante. */
function sumarPorVariante(tomadas: readonly { varianteId: string; piezas: number }[]): Map<string, number> {
	const porVariante = new Map<string, number>();
	for (const { varianteId, piezas } of tomadas)
		porVariante.set(varianteId, (porVariante.get(varianteId) ?? 0) + piezas);
	return porVariante;
}

// ---------------------------------------------------------------------------------------------------------------
// inventario.liberar_reservas

/** Lo que recibe `inventario.liberar_reservas`. */
const pedidoDeLiberar = z
	.object({
		motivo: z
			.enum(["pedido_externo", "nota_entrega", "pedido_linea", "apartado_tienda", "pedido_especial_tienda"])
			.optional(),
		documento_id: z.uuid().optional(),
		reserva_ids: z.array(z.uuid()).optional(),
		motivo_fin: z.enum(["documento_cancelado", "vencio_pago", "quitada_del_pedido"]),
		documento_cancelado: z.boolean(),
		piezas: z.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive() })).optional(),
	})
	.strict();

/** La columna del documento de cada motivo. */
const columnaDelDocumento = {
	pedido_externo: reservas.pedidoId,
	nota_entrega: reservas.notaEntregaId,
	pedido_linea: reservas.pedidoLineaId,
	apartado_tienda: reservas.apartadoTiendaId,
	pedido_especial_tienda: reservas.pedidoEspecialTiendaId,
} as const;

/**
 * `inventario.liberar_reservas`: libera las reservas activas de un documento (o esas), todas o solo unas piezas
 * por variante. Las que ya no están activas se ignoran. Si el documento (W- o PE-) se canceló, lo suyo que está
 * en aduana se reparte en un hijo `regresa` a su origen (Bodega si vino del Taller o de fuera).
 * @param contexto El contexto de la acción.
 * @param datos El documento (motivo e id) o las reservas, el motivo del fin, si se canceló y, si es una parte,
 * las piezas por variante.
 * @returns Las reservas liberadas, dónde estaba cada una, y los traspasos `regresa` que nacieron.
 */
export async function liberarReservas(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	reserva_ids: string[];
	regresa_ids: string[];
	liberadas: { variante_id: string; ubicacion_id: string; piezas: number; en_traspaso: boolean }[];
}> {
	const pedido = pedidoDeLiberar.parse(datos);
	const { transaccion } = contexto;
	const filtro =
		pedido.reserva_ids !== undefined
			? inArray(reservas.id, pedido.reserva_ids)
			: pedido.motivo !== undefined && pedido.documento_id !== undefined
				? and(eq(reservas.motivo, pedido.motivo), eq(columnaDelDocumento[pedido.motivo], pedido.documento_id))
				: undefined;
	if (filtro === undefined) throw new Error("liberar pide el documento o las reservas");
	const antes = await reservasActivas(transaccion, filtro);
	await candadoDeVariantes(
		transaccion,
		antes.map((reserva) => reserva.varianteId),
	);
	// Con el candado, se vuelven a leer: otra acción pudo cambiarlas mientras se esperaba.
	const activas = await reservasActivas(transaccion, filtro);
	const aLiberar: Reserva[] = [];
	if (pedido.piezas === undefined) aLiberar.push(...activas);
	else {
		for (const { variante_id, piezas } of pedido.piezas) {
			const suyas = activas.filter((reserva) => reserva.varianteId === variante_id);
			aLiberar.push(...(await tomarDeReservas(contexto, suyas, piezas, pedido.motivo_fin)));
		}
	}
	for (const { id } of aLiberar)
		await terminarReserva(contexto, id, { estado: "liberada", motivoFin: pedido.motivo_fin });
	const regresaIds =
		pedido.documento_cancelado && (pedido.motivo === "pedido_linea" || pedido.motivo === "pedido_externo")
			? await regresarLoDeAduana(contexto, aLiberar)
			: [];
	if (aLiberar.length > 0) {
		eventoDeReservas(
			contexto,
			"reserva.liberada",
			{ reservas: aLiberar.length, motivo_fin: pedido.motivo_fin },
			regresaIds.length > 0 ? ["traspasos", "traspaso_lineas"] : [],
		);
	}
	return {
		reserva_ids: aLiberar.map((liberada) => liberada.id),
		regresa_ids: regresaIds,
		// Dónde estaba cada prenda, para la bitácora de quien libera.
		liberadas: aLiberar.map((liberada) => ({
			variante_id: liberada.varianteId,
			ubicacion_id: liberada.ubicacionId,
			piezas: liberada.piezas,
			en_traspaso: liberada.traspasoId !== null,
		})),
	};
}

/**
 * Lo liberado de un documento cancelado que está en aduana se reparte en un hijo `regresa` por traspaso, con
 * destino a su origen. Lo que viene en camino se reparte cuando Aduana lo recibe; lo que ya salió no se toca.
 * @returns Los hijos `regresa`.
 */
async function regresarLoDeAduana(contexto: ContextoDeAccion, liberadas: readonly Reserva[]): Promise<string[]> {
	const porTraspaso = new Map<string, Reserva[]>();
	for (const reserva of liberadas) {
		if (reserva.traspasoId !== null)
			porTraspaso.set(reserva.traspasoId, [...(porTraspaso.get(reserva.traspasoId) ?? []), reserva]);
	}
	const hijos: string[] = [];
	for (const [traspasoId, deEse] of [...porTraspaso].sort(([uno], [otro]) => (uno < otro ? -1 : 1))) {
		const hijo = await regresarAlOrigen(contexto, traspasoId, sumarPorVariante(deEse));
		if (hijo !== null) hijos.push(hijo.traspasoId);
	}
	return hijos;
}

/**
 * Reparte de un traspaso en aduana un hijo `regresa` a su origen (Bodega o la tienda; si vino del Taller o de fuera,
 * Bodega) con esas piezas por variante, hasta lo que le queda en aduana. Lo usan liberar lo de un documento cancelado
 * y la recepción en aduana de lo surtido para un pedido que se canceló mientras venía en camino.
 * @param contexto El contexto de la acción.
 * @param traspasoId El traspaso.
 * @param porVariante Por variante, las piezas que regresan.
 * @returns El hijo y su folio, o `null` si el traspaso no está en aduana o no le queda nada de eso.
 */
export async function regresarAlOrigen(
	contexto: ContextoDeAccion,
	traspasoId: string,
	porVariante: ReadonlyMap<string, number>,
): Promise<TraspasoCreado | null> {
	const [padre] = await contexto.transaccion.select().from(traspasos).where(eq(traspasos.id, traspasoId));
	if (padre === undefined || padre.estado !== "en_aduana") return null;
	const renglones = await renglonesARepartir(contexto, traspasoId, porVariante);
	if (renglones.length === 0) return null;
	const lugares = await leerUbicaciones(contexto);
	const origen = padre.origenUbicacionId;
	const vuelveA =
		origen !== null && ["bodega", "tienda"].includes(lugares.tipoDe.get(origen) ?? "") ? origen : lugares.bodega;
	const hijo = await repartirTraspaso(contexto, {
		padreId: traspasoId,
		renglones,
		hijo: { tipo: "regresa", destino: { ubicacionId: vuelveA } },
	});
	return { traspasoId: hijo.traspasoId, folio: hijo.folio };
}

// ---------------------------------------------------------------------------------------------------------------
// inventario.confirmar_pago_reserva

/** Lo que recibe `inventario.confirmar_pago_reserva`. */
const pedidoDeConfirmarPago = z.object({ pedido_linea_id: z.uuid() }).strict();

/**
 * `inventario.confirmar_pago_reserva`: el pago de un W- llegó. Si sus reservas siguen activas, se les quita el
 * vencimiento; si ya vencieron, se vuelve a apartar lo que tenían, como en `inventario.reservar`.
 * @param contexto El contexto de la acción.
 * @param datos `pedido_linea_id`.
 * @returns Si se volvió a apartar y, entonces, lo apartado; la promesa que dan sus reservas activas y si todas están
 * en Aduana.
 */
export async function confirmarPagoReserva(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<
	{ volvio_a_apartar: boolean; renglones: RenglonApartado[] } & Awaited<ReturnType<typeof comoQuedaElPedidoLinea>>
> {
	const { pedido_linea_id } = pedidoDeConfirmarPago.parse(datos);
	const { transaccion } = contexto;
	// El candado de sus variantes antes de decidir: «Vencer reservas» no puede liberarlas a la mitad.
	const deEse = await transaccion
		.selectDistinct({ varianteId: reservas.varianteId })
		.from(reservas)
		.where(eq(reservas.pedidoLineaId, pedido_linea_id));
	await candadoDeVariantes(
		transaccion,
		deEse.map((reserva) => reserva.varianteId),
	);
	const activas = await reservasActivas(transaccion, eq(reservas.pedidoLineaId, pedido_linea_id));
	if (activas.length > 0) {
		await transaccion
			.update(reservas)
			.set({ venceEn: null })
			.where(
				and(
					inArray(
						reservas.id,
						activas.map((reserva) => reserva.id),
					),
					eq(reservas.estado, "activa"),
				),
			);
		return { volvio_a_apartar: false, renglones: [], ...(await comoQuedaElPedidoLinea(contexto, pedido_linea_id)) };
	}
	// El pago llegó tarde: lo que se liberó al vencer se vuelve a apartar.
	const vencidas = await transaccion
		.select()
		.from(reservas)
		.where(
			and(
				eq(reservas.pedidoLineaId, pedido_linea_id),
				eq(reservas.estado, "liberada"),
				eq(reservas.motivoFin, "vencio_pago"),
			),
		)
		.orderBy(reservas.creadoEn);
	if (vencidas.length === 0) {
		return { volvio_a_apartar: false, renglones: [], ...(await comoQuedaElPedidoLinea(contexto, pedido_linea_id)) };
	}
	const { renglones } = await apartar(
		contexto,
		{
			motivo: "pedido_linea",
			pedido_linea_id,
			renglones: vencidas.map((reserva) => ({
				variante_id: reserva.varianteId,
				piezas: reserva.piezas,
				...(reserva.pedidoLineaRenglonId === null ? {} : { pedido_linea_renglon_id: reserva.pedidoLineaRenglonId }),
			})),
		},
		"pago_despues_de_vencer",
	);
	return { volvio_a_apartar: true, renglones, ...(await comoQuedaElPedidoLinea(contexto, pedido_linea_id)) };
}

/**
 * Cómo dejan a un W- sus reservas activas: la promesa («Sale mañana» si alguna está en una tienda; si no, «Sale hoy»)
 * y si todas ya están en Aduana.
 * @param contexto El contexto de la acción.
 * @param pedidoLineaId El W-.
 * Tienda en línea congela la promesa al quedar pagado (regla 4 de los pedidos en línea) y, con todo en Aduana, lo deja
 * listo para empacar.
 */
async function comoQuedaElPedidoLinea(
	contexto: ContextoDeAccion,
	pedidoLineaId: string,
): Promise<{ promesa: "sale_hoy" | "sale_manana"; todo_en_aduana: boolean }> {
	const lugares = await leerUbicaciones(contexto);
	const activas = await reservasActivas(contexto.transaccion, eq(reservas.pedidoLineaId, pedidoLineaId));
	return {
		promesa: activas.some((reserva) => lugares.tipoDe.get(reserva.ubicacionId) === "tienda")
			? "sale_manana"
			: "sale_hoy",
		todo_en_aduana: await todoEnAduana(contexto.transaccion, pedidoLineaId, lugares.aduana),
	};
}

// ---------------------------------------------------------------------------------------------------------------
// inventario.apartar_para_nota y inventario.devolver_de_nota

/** Lo que recibe `inventario.apartar_para_nota`. */
const pedidoDeApartarParaNota = z
	.object({
		nota_entrega_id: z.uuid(),
		pedido_id: z.uuid(),
		renglones: z.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive() })).min(1),
	})
	.strict();

/**
 * Pasa reservas activas de unos traspasos en aduana a hijos nuevos, uno por padre, y las transfiere a reservas
 * nuevas con otro motivo ligadas a cada hijo. Lo usan la nota de entrega y su cancelación.
 * @returns Los hijos que nacieron.
 */
async function pasarAHijos(
	contexto: ContextoDeAccion,
	tomadas: readonly Reserva[],
	hijo: { tipo: "nota_entrega" | "lote_cliente"; destino: LadoDeTraspaso; referencias: Record<string, string> },
	nueva: (reserva: Reserva) => Omit<Parameters<typeof crearReserva>[1], "ubicacionId" | "varianteId" | "piezas">,
	motivoFin: MotivoDeFin,
): Promise<string[]> {
	const porPadre = new Map<string, Reserva[]>();
	for (const reserva of tomadas) {
		if (reserva.traspasoId === null) throw new Error(`la reserva ${reserva.id} en aduana no tiene traspaso`);
		porPadre.set(reserva.traspasoId, [...(porPadre.get(reserva.traspasoId) ?? []), reserva]);
	}
	const hijos: string[] = [];
	// Los padres en orden por id: dos acciones que reparten los mismos los bloquean igual.
	for (const [padreId, deEse] of [...porPadre].sort(([uno], [otro]) => (uno < otro ? -1 : 1))) {
		const porVariante = sumarPorVariante(deEse);
		const renglones = await renglonesARepartir(contexto, padreId, porVariante);
		// Lo apartado tiene que estar en aduana: si no, el hijo llevaría menos piezas que sus reservas.
		for (const [varianteId, piezas] of porVariante) {
			const repartidas = renglones.reduce(
				(suma, renglon) => suma + (renglon.varianteId === varianteId ? renglon.piezas : 0),
				0,
			);
			if (repartidas !== piezas) {
				throw new Error(`el traspaso ${padreId} tiene en aduana ${repartidas} de ${piezas} apartadas de ${varianteId}`);
			}
		}
		const repartido = await repartirTraspaso(contexto, { padreId, renglones, hijo });
		for (const reserva of deEse) {
			const nuevaId = await crearReserva(contexto, {
				...nueva(reserva),
				ubicacionId: reserva.ubicacionId,
				varianteId: reserva.varianteId,
				piezas: reserva.piezas,
				traspasoId: repartido.traspasoId,
			});
			await terminarReserva(contexto, reserva.id, { estado: "transferida", motivoFin, a: nuevaId });
		}
		hijos.push(repartido.traspasoId);
	}
	return hijos;
}

/**
 * `inventario.apartar_para_nota`: lo listo de un pedido en aduana pasa a una nota de entrega. Los traspasos del
 * pedido se reparten en hijos `nota_entrega`, uno por padre, y sus reservas `pedido_externo` quedan transferidas
 * (`pasa_a_nota`) a reservas `nota_entrega` ligadas a cada hijo. No es un movimiento.
 * @param contexto El contexto de la acción.
 * @param datos La nota, su pedido y, por variante, las piezas.
 * @returns Los traspasos de la nota.
 * @throws `422 nada_listo` si el pedido no tiene nada listo en aduana; `422 sin_listo` si una talla pide más.
 */
export async function apartarParaNota(contexto: ContextoDeAccion, datos: unknown): Promise<{ traspaso_ids: string[] }> {
	const pedido = pedidoDeApartarParaNota.parse(datos);
	const { transaccion } = contexto;
	const lugares = await leerUbicaciones(contexto);
	await candadoDeVariantes(
		transaccion,
		pedido.renglones.map((renglon) => renglon.variante_id),
	);
	const listas = await reservasActivas(
		transaccion,
		and(
			eq(reservas.motivo, "pedido_externo"),
			eq(reservas.pedidoId, pedido.pedido_id),
			eq(reservas.ubicacionId, lugares.aduana),
		),
	);
	if (listas.length === 0) throw errorDeRegla("nada_listo", "Nada listo en aduana para este pedido");
	const tomadas: Reserva[] = [];
	for (const { variante_id, piezas } of pedido.renglones) {
		const suyas = listas.filter((reserva) => reserva.varianteId === variante_id);
		const listo = suyas.reduce((suma, reserva) => suma + reserva.piezas, 0);
		if (piezas > listo) {
			const { prenda, talla } = await nombreDeVariante(transaccion, variante_id);
			throw errorDeRegla("sin_listo", `Solo hay ${listo} listas de ${prenda} talla ${talla}`);
		}
		tomadas.push(...(await tomarDeReservas(contexto, suyas, piezas, "pasa_a_nota")));
	}
	const traspasoIds = await pasarAHijos(
		contexto,
		tomadas,
		{
			tipo: "nota_entrega",
			destino: { externo: "cliente_externo" },
			referencias: { notaEntregaId: pedido.nota_entrega_id },
		},
		(reserva) => ({ motivo: "nota_entrega", notaEntregaId: pedido.nota_entrega_id, pedidoId: reserva.pedidoId }),
		"pasa_a_nota",
	);
	eventoDeReservas(contexto, "reserva.transferida", {
		nota_entrega_id: pedido.nota_entrega_id,
		motivo_fin: "pasa_a_nota",
	});
	return { traspaso_ids: traspasoIds };
}

/** Lo que recibe `inventario.devolver_de_nota`. */
const pedidoDeDevolverDeNota = z.object({ nota_entrega_id: z.uuid(), folio: z.string().optional() }).strict();

/**
 * `inventario.devolver_de_nota`: una nota que no ha salido se cancela. Cada traspaso de la nota se reparte en un
 * hijo `lote_cliente` del mismo pedido, y sus reservas `nota_entrega` quedan transferidas (`nota_cancelada`) a
 * reservas `pedido_externo`. No es un movimiento.
 * @param contexto El contexto de la acción.
 * @param datos La nota y, para el mensaje, su folio.
 * @returns Los traspasos `lote_cliente` que nacieron.
 * @throws `422 nota_ya_salio` si un traspaso de la nota ya no está en aduana.
 */
export async function devolverDeNota(contexto: ContextoDeAccion, datos: unknown): Promise<{ traspaso_ids: string[] }> {
	const pedido = pedidoDeDevolverDeNota.parse(datos);
	const { transaccion } = contexto;
	const antes = await reservasActivas(transaccion, eq(reservas.notaEntregaId, pedido.nota_entrega_id));
	await candadoDeVariantes(
		transaccion,
		antes.map((reserva) => reserva.varianteId),
	);
	const deLaNota = await reservasActivas(
		transaccion,
		and(eq(reservas.notaEntregaId, pedido.nota_entrega_id), eq(reservas.motivo, "nota_entrega")),
	);
	const traspasoIds = [...new Set(deLaNota.map((reserva) => reserva.traspasoId).filter((id) => id !== null))];
	const suyos =
		traspasoIds.length === 0
			? []
			: await transaccion.select().from(traspasos).where(inArray(traspasos.id, traspasoIds));
	const salio = suyos.find((traspaso) => traspaso.estado !== "en_aduana");
	if (salio !== undefined) {
		throw errorDeRegla("nota_ya_salio", `${pedido.folio ?? "La nota"} ya salió con ${salio.folio}`);
	}
	const hijos = await pasarAHijos(
		contexto,
		deLaNota,
		{
			tipo: "lote_cliente",
			destino: { externo: "cliente_externo" },
			referencias: { pedidoId: deLaNota[0]?.pedidoId ?? "" },
		},
		(reserva) => {
			if (reserva.pedidoId === null) throw new Error(`la reserva ${reserva.id} de la nota no dice su pedido`);
			return { motivo: "pedido_externo", pedidoId: reserva.pedidoId };
		},
		"nota_cancelada",
	);
	if (deLaNota.length > 0) {
		eventoDeReservas(contexto, "reserva.transferida", {
			nota_entrega_id: pedido.nota_entrega_id,
			motivo_fin: "nota_cancelada",
		});
	}
	return { traspaso_ids: hijos };
}
