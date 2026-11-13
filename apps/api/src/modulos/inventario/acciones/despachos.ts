/**
 * Las acciones de los despachos: Aduana despacha, recuerda y anota las etiquetas; Bodega recibe; y Aduana confirma la
 * entrega en una tienda sin caja con la firma de su encargada.
 * Fase 11 · docs/modulos/inventario/surtido-y-despachos.md (reglas 3 a 9, «Acciones»)
 *
 * Lo que va en tránsito es, por renglón, lo recibido en aduana menos lo repartido. Lo que falta al recibir se queda en
 * Tránsito a cargo de Aduana; lo que sobra o no venía sale del tramo del primer traspaso del despacho.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (reglas 2 y 9): cada renglón que no cuadró abre
 * su DF-, y un traspaso que tuvo alguna (de este tramo o del de camino a aduana) termina `con_diferencia`.
 */

import {
	aMilesimosConSigno,
	cantidadEnTexto,
	deMilesimos,
	menor,
} from "@uniformame/compartido/calculos/cuenta-material";
import {
	despachar,
	entregarATiendaSinCaja,
	marcarEtiquetasImpresas,
	recibirDespacho,
	recordarDespacho,
} from "@uniformame/compartido/contratos/inventario/despachos";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { tomarCandadosDeInventario } from "../dominio/candados.ts";
import { tiposConEtiquetas } from "../dominio/despachos.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { candadoDeLoRecibido, ordenesDeCompras, ubicacionDeTipo, ubicacionPorId } from "../dominio/recepciones.ts";
import { cambiarEstadoTraspaso } from "../dominio/traspasos.ts";
import { tiposDeDevolucionDeCliente } from "../internas/devoluciones.ts";
import {
	despachos,
	diferencias,
	recepciones,
	recepcionLineas,
	rollos,
	tiposConDestinoPorDecidir,
	traspasoLineas,
	traspasos,
	ubicaciones,
} from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Un traspaso como se guarda. */
type Traspaso = typeof traspasos.$inferSelect;

/** Un renglón de un traspaso como se guarda. */
type LineaDeTraspaso = typeof traspasoLineas.$inferSelect;

/** Un despacho como se guarda. */
type Despacho = typeof despachos.$inferSelect;

/** Lo que queda de un renglón en aduana (o lo que salió en tránsito): lo recibido en aduana menos lo repartido. */
function enAduana(linea: LineaDeTraspaso): { piezas: number; milesimos: bigint } {
	return {
		piezas: (linea.piezasRecibidasAduana ?? 0) - linea.piezasRepartidas,
		milesimos: aMilesimosConSigno(linea.cantidadRecibidaAduana ?? "0") - aMilesimosConSigno(linea.cantidadRepartida),
	};
}

/**
 * Los renglones de unos traspasos, en su orden.
 * @param contexto El contexto de la acción.
 * @param traspasoIds Los traspasos.
 */
async function lineasDe(contexto: ContextoDeAccion, traspasoIds: readonly string[]): Promise<LineaDeTraspaso[]> {
	if (traspasoIds.length === 0) return [];
	return contexto.transaccion
		.select()
		.from(traspasoLineas)
		.where(inArray(traspasoLineas.traspasoId, [...traspasoIds]))
		.orderBy(asc(traspasoLineas.traspasoId), asc(traspasoLineas.renglon));
}

/**
 * Toma los candados del inventario en el orden fijo (las variantes de sus renglones y luego los traspasos) antes de
 * tocar nada: lo que escriba después ya no invierte el orden con otra acción.
 */
async function candadosDe(contexto: ContextoDeAccion, traspasoIds: readonly string[], otrasVariantes: string[] = []) {
	const lineas = await lineasDe(contexto, traspasoIds);
	await tomarCandadosDeInventario(contexto.transaccion, {
		varianteIds: [
			...lineas.flatMap((linea) => (linea.varianteId === null ? [] : [linea.varianteId])),
			...otrasVariantes,
		],
		traspasoIds,
	});
}

/** `400 falta_destino`: «Escoge a dónde va». */
function faltaDestino() {
	return new ErrorDeApi("validacion", "falta_destino", "Escoge a dónde va", {
		campos: { destino_ubicacion_id: "Escoge a dónde va" },
	});
}

/**
 * El nombre y el tipo de una ubicación que tiene que existir.
 * @throws `404` si no existe.
 */
async function nombreDe(contexto: ContextoDeAccion, ubicacionId: string): Promise<{ nombre: string; tipo: string }> {
	const ubicacion = await ubicacionPorId(contexto.transaccion, ubicacionId);
	if (ubicacion === undefined) throw noExiste();
	return ubicacion;
}

/**
 * Revisa que un traspaso pueda salir por despacho (regla 4).
 * @throws `422` con su código: `no_esta_en_aduana`, `se_empaca`, `es_devolucion_proveedor`, `espera_calidad`,
 * `sin_nota` o `devolucion_pendiente`.
 */
async function revisarQueSalga(contexto: ContextoDeAccion, traspaso: Traspaso): Promise<void> {
	if (traspaso.estado !== "en_aduana") {
		throw errorDeRegla("no_esta_en_aduana", `${traspaso.folio} no está en aduana.`);
	}
	if (traspaso.tipo === "pedido_linea" || traspaso.destinoExterno === "cliente_linea") {
		throw errorDeRegla("se_empaca", "Los pedidos en línea no se despachan: salen al empacarlos");
	}
	if (traspaso.tipo === "devolucion_proveedor" || traspaso.destinoExterno === "proveedor") {
		throw errorDeRegla(
			"es_devolucion_proveedor",
			"Lo de más que regresa al proveedor sale con «Devolver al proveedor».",
		);
	}
	// Lo que regresó de un cliente con defecto se queda en el padre, sin destino, hasta que Calidad lo revisa.
	if (
		traspaso.tipo === "devolucion_defecto" ||
		(tiposDeDevolucionDeCliente.some((tipo) => tipo === traspaso.tipo) && traspaso.traspasoPadreId === null)
	) {
		throw errorDeRegla("espera_calidad", `${traspaso.folio} espera la revisión de Calidad`);
	}
	if (
		traspaso.destinoExterno === "cliente_externo" &&
		(traspaso.tipo !== "nota_entrega" || traspaso.notaEntregaId === null)
	) {
		throw errorDeRegla("sin_nota", "Sin nota de entrega no sale");
	}
	// El A- del material de una orden no sale mientras lo de más de esa orden espera regresar desde aduana.
	if (traspaso.tipo === "material_proveedor" && traspaso.ordenCompraId !== null) {
		const aduana = await ubicacionDeTipo(contexto.transaccion, "aduana");
		// Espera en aduana: la que nació ahí y no ha salido, o la que Bodega ya surtió y Aduana recibió.
		const [pendiente] = await contexto.transaccion
			.select({ id: traspasos.id })
			.from(traspasos)
			.where(
				and(
					eq(traspasos.tipo, "devolucion_proveedor"),
					eq(traspasos.ordenCompraId, traspaso.ordenCompraId),
					or(
						and(eq(traspasos.estado, "esperado"), eq(traspasos.origenUbicacionId, aduana)),
						eq(traspasos.estado, "en_aduana"),
					),
				),
			)
			.limit(1);
		if (pendiente !== undefined) {
			throw errorDeRegla(
				"devolucion_pendiente",
				`Primero regresa al proveedor lo de más de ${(await ordenesDeCompras(contexto, [traspaso.ordenCompraId]))[0]?.folio ?? "la orden"}.`,
			);
		}
	}
}

/** Lo que regresa `ventas.marcar_nota_en_camino`: el folio de la nota y el nombre de su cliente. */
const notaEnCamino = z.object({ folio: z.string(), cliente: z.string() });

export const accionDespachar = implementarAccion(despachar, async (contexto, datos) => {
	const { transaccion } = contexto;
	const ids = datos.traspasos.map((suyo) => suyo.traspaso_id);
	await candadosDe(contexto, ids);
	// El A- del material de una orden espera a quien decide lo de más de esa orden (y al revés): si Dirección rechaza
	// mientras sale, la devolución ve dónde quedó.
	const ordenes = await transaccion
		.selectDistinct({ ordenCompraId: traspasos.ordenCompraId })
		.from(traspasos)
		.where(and(inArray(traspasos.id, ids), eq(traspasos.tipo, "material_proveedor")));
	for (const { ordenCompraId } of ordenes)
		if (ordenCompraId !== null) await candadoDeLoRecibido(contexto, ordenCompraId);
	const salen: Traspaso[] = [];
	for (const { traspaso_id, version } of datos.traspasos) {
		const [traspaso] = await transaccion.select().from(traspasos).where(eq(traspasos.id, traspaso_id));
		if (traspaso === undefined) throw noExiste();
		await tomarVersion(contexto, traspasos, traspaso.id, version, async () => ({
			traspaso_id: traspaso.id,
			estado: traspaso.estado,
		}));
		await revisarQueSalga(contexto, traspaso);
		salen.push(traspaso);
	}
	// El destino: el de cada traspaso, o el que escoge Aduana si está por decidir; uno solo para todo el despacho.
	const porDecidir = new Set<string>(tiposConDestinoPorDecidir);
	const destinos = new Set<string>();
	for (const traspaso of salen) {
		if (traspaso.destinoUbicacionId !== null) destinos.add(traspaso.destinoUbicacionId);
		else if (traspaso.destinoExterno !== null) destinos.add(traspaso.destinoExterno);
		else if (porDecidir.has(traspaso.tipo)) {
			if (datos.destino_ubicacion_id === undefined) throw faltaDestino();
			destinos.add(datos.destino_ubicacion_id);
		}
	}
	if (destinos.size !== 1) throw errorDeRegla("destinos_distintos", "Un despacho va a un solo destino");
	const [destino = ""] = destinos;
	const esCliente = destino === "cliente_externo";
	// A un cliente externo, un despacho lleva una sola nota: cada nota es su propio destino.
	const notas = new Set(salen.flatMap((traspaso) => (traspaso.notaEntregaId === null ? [] : [traspaso.notaEntregaId])));
	if (esCliente && notas.size !== 1) throw errorDeRegla("destinos_distintos", "Un despacho va a un solo destino");
	const [notaEntregaId] = notas;
	const lugar = esCliente ? undefined : await nombreDe(contexto, destino);
	const nombreDestino = lugar?.nombre ?? "el cliente";
	if (lugar !== undefined && !["bodega", "tienda"].includes(lugar.tipo)) {
		throw faltaDestino();
	}
	const quien = quienCambia(contexto);
	if (quien === null) throw new Error("despacha una cuenta de Aduana");
	const id = uuidv7();
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "despacho" }));
	await transaccion.insert(despachos).values({
		id,
		folio,
		destinoUbicacionId: esCliente ? null : destino,
		destinoExterno: esCliente ? "cliente_externo" : null,
		notaEntregaId: notaEntregaId ?? null,
		estado: "en_transito",
		despachadoEn: contexto.ahora.toString(),
		despachadoPor: quien,
		creadoPor: quien,
	});
	// Primero su despacho y su destino: en tránsito ya no puede quedar sin destino.
	for (const traspaso of salen) {
		await transaccion
			.update(traspasos)
			.set({
				despachoId: id,
				...(traspaso.destinoUbicacionId === null && !esCliente ? { destinoUbicacionId: destino } : {}),
			})
			.where(eq(traspasos.id, traspaso.id));
		await cambiarEstadoTraspaso(contexto, traspaso.id, "en_transito");
	}
	// Sale de aduana a tránsito todo lo que queda en aduana de cada traspaso, con su lote y su rollo.
	const transito = await ubicacionDeTipo(contexto.transaccion, "transito");
	const aduana = await ubicacionDeTipo(contexto.transaccion, "aduana");
	const renglones: RenglonDeMovimiento[] = (await lineasDe(contexto, ids)).flatMap((linea): RenglonDeMovimiento[] => {
		const queda = enAduana(linea);
		if (linea.varianteId !== null) {
			return queda.piezas > 0
				? [
						{
							origen: aduana,
							destino: transito,
							varianteId: linea.varianteId,
							piezas: queda.piezas,
							loteId: linea.loteId,
							traspasoId: linea.traspasoId,
						},
					]
				: [];
		}
		return queda.milesimos > 0n
			? [
					{
						origen: aduana,
						destino: transito,
						materialId: linea.materialId ?? "",
						rolloId: linea.rolloId,
						cantidad: deMilesimos(queda.milesimos),
						traspasoId: linea.traspasoId,
					},
				]
			: [];
	});
	if (renglones.length > 0) {
		await escribirMovimiento(contexto, { tipo: "despacho", documento: { tipo: "despacho", id, folio }, renglones });
	}
	// Su nota pasa a en camino; Ventas dice su folio y su cliente, sin precios.
	const nota =
		esCliente && notaEntregaId !== undefined
			? notaEnCamino.parse(
					await contexto.interna("ventas.marcar_nota_en_camino", {
						nota_entrega_id: notaEntregaId,
						despacho_id: id,
						despachado_en: contexto.ahora.toString(),
					}),
				)
			: undefined;
	contexto.bitacora({
		descripcion: `Despachó ${folio} a ${nombreDestino}`,
		entidad: "despachos",
		entidadId: id,
		entidadFolio: folio,
		despues: { traspasos: salen.map((traspaso) => traspaso.folio), renglones: renglones.length },
	});
	contexto.guardarEvento({
		tipo: "despacho.creado",
		datos: { despacho_id: id, destino },
		tablas: ["despachos", "traspasos", "traspaso_lineas", "existencias", "existencias_material", "reservas"],
		entidad: "despachos",
		entidadId: id,
		entidadFolio: folio,
	});
	return {
		resultado: {
			despacho_id: id,
			folio,
			mensaje:
				nota === undefined
					? `${folio} sale a ${nombreDestino}. Queda en tránsito hasta que lo confirmen`
					: `${nota.folio} sale con ${folio} a ${nota.cliente}. Queda en camino hasta que firme de recibido`,
		},
		entidad: { nombre: "despachos", id },
	};
});

/**
 * Lee un despacho con su versión tomada.
 * @throws `404` si no existe; `409` si alguien lo cambió.
 */
async function despachoConSuVersion(contexto: ContextoDeAccion, id: string, version: number | undefined) {
	const [despacho] = await contexto.transaccion.select().from(despachos).where(eq(despachos.id, id));
	if (despacho === undefined) throw noExiste();
	await tomarVersion(contexto, despachos, despacho.id, version, async () => ({
		despacho_id: despacho.id,
		estado: despacho.estado,
	}));
	return despacho;
}

/** Quién responde por el destino de un despacho, para el recordatorio. */
async function responsableDe(contexto: ContextoDeAccion, despacho: Despacho): Promise<string> {
	const destino = await nombreDe(contexto, despacho.destinoUbicacionId ?? "");
	return destino.tipo === "bodega" ? "Bodega" : `Encargada de ${destino.nombre}`;
}

export const accionRecordarDespacho = implementarAccion(recordarDespacho, async (contexto, datos, version) => {
	const despacho = await despachoConSuVersion(contexto, datos.despacho_id, version);
	if (despacho.destinoExterno !== null) {
		throw errorDeRegla("es_cliente", "A un cliente no se le recuerda: confirma la entrega con su firma.");
	}
	if (despacho.estado !== "en_transito") {
		const destino = await nombreDe(contexto, despacho.destinoUbicacionId ?? "");
		throw errorDeRegla("ya_confirmado", `${despacho.folio} ya lo confirmó ${destino.nombre}`);
	}
	const recordatorios = despacho.recordatorios + 1;
	await contexto.transaccion
		.update(despachos)
		.set({ recordatorios, ultimoRecordatorioEn: contexto.ahora.toString() })
		.where(eq(despachos.id, despacho.id));
	const responsable = await responsableDe(contexto, despacho);
	contexto.bitacora({
		descripcion: `Recordó ${despacho.folio}`,
		entidad: "despachos",
		entidadId: despacho.id,
		entidadFolio: despacho.folio,
		despues: { recordatorio: recordatorios },
	});
	contexto.guardarEvento({
		tipo: "despacho.recordado",
		datos: { despacho_id: despacho.id, recordatorios },
		tablas: ["despachos"],
		entidad: "despachos",
		entidadId: despacho.id,
		entidadFolio: despacho.folio,
	});
	return {
		resultado: {
			mensaje: `Recordatorio enviado a ${responsable}. Solo quien recibe puede confirmar`,
			version: await versionActual(contexto.transaccion, despachos, despacho.id),
		},
		entidad: { nombre: "despachos", id: despacho.id },
	};
});

export const accionMarcarEtiquetasImpresas = implementarAccion(
	marcarEtiquetasImpresas,
	async (contexto, datos, version) => {
		const [traspaso] = await contexto.transaccion.select().from(traspasos).where(eq(traspasos.id, datos.traspaso_id));
		if (traspaso === undefined) throw noExiste();
		await tomarVersion(contexto, traspasos, traspaso.id, version, async () => ({
			traspaso_id: traspaso.id,
			etiquetas_impresas_en: traspaso.etiquetasImpresasEn,
		}));
		if (!tiposConEtiquetas.has(traspaso.tipo))
			throw errorDeRegla("sin_etiquetas", `${traspaso.folio} no lleva etiquetas.`);
		// Se anotan al mandarlas: si la Zebra falla, el aviso lo dice y se usa el PDF.
		if (datos.destino === "impresora") {
			await contexto.interna("admin.mandar_a_imprimir", {
				ubicacion_id: await ubicacionDeTipo(contexto.transaccion, "aduana"),
				tipo: "traspaso",
				ids: [traspaso.id],
				copias: 1,
			});
		}
		const ahora = contexto.ahora.toString();
		await contexto.transaccion
			.update(traspasos)
			.set({ etiquetasImpresasEn: ahora })
			.where(eq(traspasos.id, traspaso.id));
		const suyos = (await lineasDe(contexto, [traspaso.id])).flatMap((linea) =>
			linea.rolloId === null ? [] : [linea.rolloId],
		);
		if (suyos.length > 0) {
			await contexto.transaccion.update(rollos).set({ etiquetaImpresaEn: ahora }).where(inArray(rollos.id, suyos));
		}
		contexto.bitacora({
			descripcion: `Imprimió etiquetas de ${traspaso.folio}`,
			entidad: "traspasos",
			entidadId: traspaso.id,
			entidadFolio: traspaso.folio,
			despues: { destino: datos.destino, rollos: suyos.length },
		});
		const enPdf = datos.destino === "pdf";
		return {
			resultado: {
				...(enPdf ? { pdf_ruta: `/v1/etiquetas/traspaso/${traspaso.id}?formato=pdf` } : {}),
				mensaje: enPdf
					? `Etiquetas de ${traspaso.folio} en PDF`
					: `Etiquetas de ${traspaso.folio} mandadas a la impresora de aduana`,
				version: await versionActual(contexto.transaccion, traspasos, traspaso.id),
			},
			entidad: { nombre: "traspasos", id: traspaso.id },
		};
	},
);

/** Lo que se cuenta de un renglón al llegar. */
interface Contado {
	linea: LineaDeTraspaso;
	esperado: { piezas: number; milesimos: bigint };
	llego: { piezas: number; milesimos: bigint };
}

/**
 * Lo que llegó de cada renglón: completo, lo que salió; con diferencias, lo que se contó, que tiene que venir para
 * cada renglón.
 * @throws `400 falta_renglon` si con diferencias falta un renglón.
 */
export function contar(
	lineas: readonly LineaDeTraspaso[],
	modo: "completo" | "con_diferencias",
	renglones: readonly { traspaso_linea_id: string; piezas?: number | undefined; cantidad?: string | undefined }[] = [],
): Contado[] {
	return lineas.map((linea) => {
		const esperado = enAduana(linea);
		if (modo === "completo") return { linea, esperado, llego: esperado };
		const suyo = renglones.find((renglon) => renglon.traspaso_linea_id === linea.id);
		const piezas = suyo?.piezas;
		const cantidad = suyo?.cantidad;
		if (suyo === undefined || (linea.varianteId !== null ? piezas === undefined : cantidad === undefined)) {
			throw new ErrorDeApi("validacion", "falta_renglon", "Escribe cuántas llegaron de cada prenda, aunque sea 0", {
				campos: { renglones: "Escribe cuántas llegaron de cada prenda, aunque sea 0" },
			});
		}
		return {
			linea,
			esperado,
			llego: { piezas: piezas ?? 0, milesimos: cantidad === undefined ? 0n : aMilesimosConSigno(cantidad) },
		};
	});
}

/**
 * Abre una DF- por renglón que no cuadró al confirmar la llegada, en Tránsito y a cargo de Aduana: lo que faltó con
 * su traspaso; lo que sobró o no venía, con el primero del despacho, de cuyo tramo salió.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (regla 2)
 */
async function abrirDiferenciasDeLaLlegada(
	contexto: ContextoDeAccion,
	despacho: Despacho,
	llegada: {
		transito: string;
		destino: string;
		primero: string | null;
		recepcionId: string;
		movimientoId: string | null;
		contados: readonly Contado[];
		noVenia: readonly { variante_id: string; piezas: number }[];
	},
): Promise<void> {
	const { transaccion } = contexto;
	const aduana = await ubicacionDeTipo(transaccion, "aduana");
	const destino = (await ubicacionPorId(transaccion, llegada.destino))?.nombre ?? "El destino";
	const comun = {
		origen: "recepcion" as const,
		ubicacionId: llegada.transito,
		aCargoUbicacionId: aduana,
		recepcionId: llegada.recepcionId,
		movimientoId: llegada.movimientoId,
	};
	for (const { linea, esperado, llego } of llegada.contados) {
		const esPrenda = linea.varianteId !== null;
		const piezas = llego.piezas - esperado.piezas;
		const milesimos = llego.milesimos - esperado.milesimos;
		if (esPrenda ? piezas === 0 : milesimos === 0n) continue;
		const sobro = esPrenda ? piezas > 0 : milesimos > 0n;
		await abrirDiferencia(contexto, {
			...comun,
			hueco: esPrenda
				? { varianteId: linea.varianteId ?? "", piezas, sistemaDecia: esperado.piezas }
				: { materialId: linea.materialId ?? "", rolloId: linea.rolloId, cantidad: deMilesimos(milesimos) },
			descripcion: esPrenda
				? `Aduana mandó ${esperado.piezas} en ${despacho.folio} y ${destino} recibió ${llego.piezas}`
				: `Aduana mandó ${cantidadEnTexto(esperado.milesimos)} en ${despacho.folio} y ${destino} recibió ${cantidadEnTexto(llego.milesimos)}`,
			traspasoId: sobro ? llegada.primero : linea.traspasoId,
			traspasoLineaId: linea.id,
			loteId: linea.loteId,
		});
	}
	for (const suyo of llegada.noVenia) {
		await abrirDiferencia(contexto, {
			...comun,
			hueco: { varianteId: suyo.variante_id, piezas: suyo.piezas, sistemaDecia: 0 },
			descripcion: `${destino} recibió ${suyo.piezas} en ${despacho.folio} que no venían`,
			traspasoId: llegada.primero,
		});
	}
}

/**
 * Confirma la llegada de un despacho del otro lado: la recepción y sus renglones, el movimiento desde Tránsito (al
 * destino o a Fuera), lo que confirmó el destino en cada renglón, cada traspaso y el despacho. Lo que faltó se queda
 * en Tránsito; lo que sobró o no venía sale del tramo del primer traspaso. La entrega a un cliente externo es la
 * recepción `entrega_cliente`, en Tránsito.
 * @returns La recepción y cuánto llegó y faltó.
 */
export async function confirmarLlegada(
	contexto: ContextoDeAccion,
	despacho: Despacho,
	pedido: {
		destino: string;
		tipoMovimiento: "recepcion_despacho" | "entrega_tienda_sin_caja" | "entrega_cliente_externo";
		modo: "completo" | "con_diferencias";
		contados: Contado[];
		noVenia: readonly { variante_id: string; piezas: number }[];
		recibioNombre?: string;
	},
) {
	const { transaccion } = contexto;
	const transito = await ubicacionDeTipo(transaccion, "transito");
	const haciaDestino = pedido.tipoMovimiento === "recepcion_despacho" ? pedido.destino : null;
	const primero = pedido.contados[0]?.linea.traspasoId ?? null;
	const recepcionId = uuidv7();
	const huboDiferencia =
		pedido.noVenia.length > 0 ||
		pedido.contados.some(
			({ esperado, llego }) => esperado.piezas !== llego.piezas || esperado.milesimos !== llego.milesimos,
		);
	const aCliente = pedido.tipoMovimiento === "entrega_cliente_externo";
	await transaccion.insert(recepciones).values({
		id: recepcionId,
		tipo: aCliente ? "entrega_cliente" : "destino_despacho",
		ubicacionId: aCliente ? transito : pedido.destino,
		modo: pedido.modo,
		despachoId: despacho.id,
		recibidoEn: contexto.ahora.toString(),
		recibidoPor: quienCambia(contexto),
		huboDiferencia,
		creadoPor: quienCambia(contexto),
	});
	// El movimiento: lo que llegó hasta lo esperado, con su traspaso; lo de más y lo que no venía, del primero.
	const renglones: RenglonDeMovimiento[] = [];
	for (const { linea, esperado, llego } of pedido.contados) {
		const lados = { origen: transito, destino: haciaDestino, traspasoId: linea.traspasoId };
		if (linea.varianteId !== null) {
			const delSuyo = Math.min(llego.piezas, esperado.piezas);
			const deMas = llego.piezas - delSuyo;
			if (delSuyo > 0)
				renglones.push({ ...lados, varianteId: linea.varianteId, piezas: delSuyo, loteId: linea.loteId });
			if (deMas > 0)
				renglones.push({
					...lados,
					traspasoId: primero,
					varianteId: linea.varianteId,
					piezas: deMas,
					loteId: linea.loteId,
				});
			continue;
		}
		const delSuyo = menor(llego.milesimos, esperado.milesimos);
		const deMas = llego.milesimos - delSuyo;
		const material = { materialId: linea.materialId ?? "", rolloId: linea.rolloId };
		if (delSuyo > 0n) renglones.push({ ...lados, ...material, cantidad: deMilesimos(delSuyo) });
		if (deMas > 0n) renglones.push({ ...lados, traspasoId: primero, ...material, cantidad: deMilesimos(deMas) });
	}
	for (const suyo of pedido.noVenia) {
		renglones.push({
			origen: transito,
			destino: haciaDestino,
			traspasoId: primero,
			varianteId: suyo.variante_id,
			piezas: suyo.piezas,
		});
	}
	const movimiento =
		renglones.length === 0
			? undefined
			: await escribirMovimiento(contexto, {
					tipo: pedido.tipoMovimiento,
					documento: { tipo: "recepcion", id: recepcionId, folio: despacho.folio },
					renglones,
				});
	if (movimiento !== undefined) {
		await transaccion
			.update(recepciones)
			.set({ movimientoId: movimiento.movimientoId })
			.where(eq(recepciones.id, recepcionId));
	}
	// El papel y lo que confirmó el destino en cada renglón.
	const quien = quienCambia(contexto);
	await transaccion.insert(recepcionLineas).values([
		...pedido.contados.map(({ linea, esperado, llego }, i) => ({
			id: uuidv7(),
			recepcionId,
			renglon: i + 1,
			traspasoLineaId: linea.id,
			varianteId: linea.varianteId,
			materialId: linea.materialId,
			rolloId: linea.rolloId,
			loteId: linea.loteId,
			...(linea.varianteId !== null
				? { piezasEsperadas: esperado.piezas, piezasContadas: llego.piezas }
				: { cantidadEsperada: deMilesimos(esperado.milesimos), cantidadContada: deMilesimos(llego.milesimos) }),
			creadoPor: quien,
		})),
		...pedido.noVenia.map((suyo, i) => ({
			id: uuidv7(),
			recepcionId,
			renglon: pedido.contados.length + i + 1,
			varianteId: suyo.variante_id,
			piezasEsperadas: 0,
			piezasContadas: suyo.piezas,
			creadoPor: quien,
		})),
	]);
	for (const { linea, llego } of pedido.contados) {
		await transaccion
			.update(traspasoLineas)
			.set(
				linea.varianteId !== null
					? { piezasRecibidasDestino: llego.piezas }
					: { cantidadRecibidaDestino: deMilesimos(llego.milesimos) },
			)
			.where(eq(traspasoLineas.id, linea.id));
	}
	await abrirDiferenciasDeLaLlegada(contexto, despacho, {
		transito,
		destino: pedido.destino,
		primero,
		recepcionId,
		movimientoId: movimiento?.movimientoId ?? null,
		contados: pedido.contados,
		noVenia: pedido.noVenia,
	});
	// Cada traspaso y el despacho: recibido, o con diferencia si alguno de sus renglones no cuadró o tuvo alguna DF-,
	// de este tramo o del de camino a aduana (el primero, también por lo de más de los demás y lo que no venía).
	const traspasoIds = [...new Set(pedido.contados.map(({ linea }) => linea.traspasoId))];
	const conDiferencia = new Set(
		(
			await transaccion
				.select({ traspasoId: diferencias.traspasoId })
				.from(diferencias)
				.where(inArray(diferencias.traspasoId, traspasoIds))
		).map((suya) => suya.traspasoId),
	);
	for (const traspasoId of traspasoIds) {
		const cuadra = pedido.contados
			.filter(({ linea }) => linea.traspasoId === traspasoId)
			.every(({ esperado, llego }) => esperado.piezas === llego.piezas && esperado.milesimos === llego.milesimos);
		await cambiarEstadoTraspaso(
			contexto,
			traspasoId,
			cuadra && !conDiferencia.has(traspasoId) ? "recibido" : "con_diferencia",
		);
		await transaccion.update(traspasos).set({ recepcionDestinoId: recepcionId }).where(eq(traspasos.id, traspasoId));
	}
	await transaccion
		.update(despachos)
		.set({
			estado: huboDiferencia ? "con_diferencia" : "recibido",
			recibidoEn: contexto.ahora.toString(),
			recepcionId,
			...(pedido.recibioNombre === undefined ? {} : { recibioNombre: pedido.recibioNombre }),
		})
		.where(eq(despachos.id, despacho.id));
	// La tela que llega a Bodega queda libre para el corte: se recalculan sus rollos sugeridos.
	if (haciaDestino !== null) {
		const telas = new Set(
			pedido.contados.flatMap(({ linea, llego }) =>
				linea.rolloId !== null && linea.materialId !== null && llego.milesimos > 0n ? [linea.materialId] : [],
			),
		);
		for (const materialId of telas) {
			await contexto.interna("inventario.recalcular_rollos_sugeridos", { material_id: materialId });
		}
	}
	contexto.guardarEvento({
		tipo: "despacho.recibido",
		datos: { despacho_id: despacho.id, recepcion_id: recepcionId },
		tablas: [
			"despachos",
			"traspasos",
			"traspaso_lineas",
			"recepciones",
			"recepcion_lineas",
			"existencias",
			"existencias_material",
			"reservas",
			"diferencias",
		],
		entidad: "despachos",
		entidadId: despacho.id,
		entidadFolio: despacho.folio,
	});
	const piezas = (de: "llego" | "esperado") => pedido.contados.reduce((suma, contado) => suma + contado[de].piezas, 0);
	const llegaron = piezas("llego") + pedido.noVenia.reduce((suma, suyo) => suma + suyo.piezas, 0);
	const faltaron = pedido.contados.reduce(
		(suma, { esperado, llego }) => suma + Math.max(0, esperado.piezas - llego.piezas),
		0,
	);
	const soloMaterial = pedido.contados.every(({ linea }) => linea.varianteId === null);
	const faltoMaterial = pedido.contados.some(({ esperado, llego }) => llego.milesimos < esperado.milesimos);
	return { recepcionId, llegaron, faltaron, soloMaterial, faltoMaterial, huboDiferencia };
}

/** Los renglones de un despacho y sus traspasos, con los candados tomados. */
export async function loDelDespacho(contexto: ContextoDeAccion, despacho: Despacho, otrasVariantes: string[] = []) {
	const suyos = await contexto.transaccion
		.select({ id: traspasos.id })
		.from(traspasos)
		.where(eq(traspasos.despachoId, despacho.id))
		.orderBy(asc(traspasos.folio));
	const ids = suyos.map((suyo) => suyo.id);
	await candadosDe(contexto, ids, otrasVariantes);
	const lineas = await lineasDe(contexto, ids);
	// El primer traspaso del despacho primero: de su tramo sale lo de más.
	return ids.flatMap((id) => lineas.filter((linea) => linea.traspasoId === id));
}

export const accionRecibirDespacho = implementarAccion(recibirDespacho, async (contexto, datos, version) => {
	const despacho = await despachoConSuVersion(contexto, datos.despacho_id, version);
	if (despacho.estado !== "en_transito") throw errorDeRegla("ya_recibido", `${despacho.folio} ya se recibió`);
	if (despacho.destinoExterno !== null) {
		throw errorDeRegla("es_cliente", "Lo de un cliente se cierra con «Confirmar entrega».");
	}
	const bodega = await ubicacionDeTipo(contexto.transaccion, "bodega");
	if (despacho.destinoUbicacionId !== bodega) throw errorDeRegla("otro_destino", `${despacho.folio} no va a bodega.`);
	const noVenia = datos.no_venia ?? [];
	const lineas = await loDelDespacho(
		contexto,
		despacho,
		noVenia.map((suyo) => suyo.variante_id),
	);
	const llegada = await confirmarLlegada(contexto, despacho, {
		destino: bodega,
		tipoMovimiento: "recepcion_despacho",
		modo: datos.modo,
		contados: contar(lineas, datos.modo, datos.renglones),
		noVenia,
	});
	contexto.bitacora({
		descripcion: `Recibió ${despacho.folio}`,
		entidad: "despachos",
		entidadId: despacho.id,
		entidadFolio: despacho.folio,
		despues: { llegaron: llegada.llegaron, faltaron: llegada.faltaron, no_venia: noVenia },
	});
	const mensaje = llegada.soloMaterial
		? `${despacho.folio}: el material ya está en bodega${llegada.faltoMaterial ? ". Faltó material: queda por aclarar a cargo de Aduana" : ""}`
		: llegada.faltaron > 0
			? `${despacho.folio}: ${llegada.llegaron} piezas en bodega. Faltaron ${llegada.faltaron}: queda por aclarar a cargo de Aduana`
			: `${despacho.folio}: ${llegada.llegaron} piezas recibidas en bodega`;
	return {
		resultado: {
			recepcion_id: llegada.recepcionId,
			mensaje,
			version: await versionActual(contexto.transaccion, despachos, despacho.id),
		},
		entidad: { nombre: "despachos", id: despacho.id },
	};
});

export const accionEntregarATiendaSinCaja = implementarAccion(
	entregarATiendaSinCaja,
	async (contexto, datos, version) => {
		const despacho = await despachoConSuVersion(contexto, datos.despacho_id, version);
		if (despacho.estado !== "en_transito") throw errorDeRegla("ya_recibido", `${despacho.folio} ya se recibió`);
		const [tienda] =
			despacho.destinoUbicacionId === null
				? []
				: await contexto.transaccion
						.select({
							id: ubicaciones.id,
							nombre: ubicaciones.nombre,
							tipo: ubicaciones.tipo,
							desde: ubicaciones.existenciaDesde,
						})
						.from(ubicaciones)
						.where(eq(ubicaciones.id, despacho.destinoUbicacionId));
		if (tienda === undefined || tienda.tipo !== "tienda" || tienda.desde !== null) {
			throw errorDeRegla(
				"no_es_tienda_sin_caja",
				`${tienda?.nombre ?? "Ese destino"} ya lleva su existencia en Unifórmame: confirma desde su caja.`,
			);
		}
		const lineas = await loDelDespacho(contexto, despacho);
		const llegada = await confirmarLlegada(contexto, despacho, {
			destino: tienda.id,
			tipoMovimiento: "entrega_tienda_sin_caja",
			modo: datos.modo,
			contados: contar(lineas, datos.modo, datos.renglones),
			noVenia: [],
			recibioNombre: datos.recibio_nombre,
		});
		contexto.bitacora({
			descripcion: `Confirmó la entrega de ${despacho.folio} en ${tienda.nombre}: firmó ${datos.recibio_nombre}`,
			entidad: "despachos",
			entidadId: despacho.id,
			entidadFolio: despacho.folio,
			despues: { llegaron: llegada.llegaron, faltaron: llegada.faltaron },
		});
		const falto = llegada.faltaron > 0 ? `. Faltaron ${llegada.faltaron}: queda por aclarar a cargo de Aduana` : "";
		return {
			resultado: {
				recepcion_id: llegada.recepcionId,
				mensaje: `${despacho.folio} entregado en ${tienda.nombre}: ${llegada.llegaron} piezas${falto}`,
				version: await versionActual(contexto.transaccion, despachos, despacho.id),
			},
			entidad: { nombre: "despachos", id: despacho.id },
		};
	},
);
