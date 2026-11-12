/**
 * `inventario.aclarar_diferencia`: Bodega dice dónde estaba de verdad lo pendiente de una DF- de recepción, o cómo se
 * cierra una de material.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (reglas 3 a 8, «Cómo se aclara una de
 * recepción», «`inventario.aclarar_diferencia`»)
 *
 * `llego`, `no_salio` y `venia_en_otro` escriben un movimiento `aclaracion_recepcion` que deja el tramo en cero en el
 * libro: cada renglón lleva su traspaso (y su lote). Lo que entra a Aduana entra en un A- nuevo, `en_aduana`, del
 * mismo tipo, origen y destino, con sus reservas. `perdida` y `ajuste` piden un AJ- a Dirección. Los candados van en
 * el orden fijo: las variantes y los traspasos, luego las DF- (dos aclaraciones del mismo par se ponen en fila).
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { aclararDiferencia } from "@uniformame/compartido/contratos/inventario/diferencias";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { materiales } from "../../compras/tablas.ts";
import { pedirAjuste, revisarMotivoDeAjuste } from "../dominio/ajustes.ts";
import { bloquearExistenciasMaterial, tomarCandadosDeInventario } from "../dominio/candados.ts";
import { type Diferencia, diferenciaBloqueada, diferenciasBloqueadas } from "../dominio/diferencias.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { reservasActivas, tomarDeReservas } from "../dominio/reservas.ts";
import { crearTraspaso, type LadoDeTraspaso, type ReferenciasDeTraspaso } from "../dominio/traspasos.ts";
import {
	aclaracionesDeMaterial,
	aclaracionesDeRecepcion,
	diferencias,
	existenciasMaterial,
	reservas,
	tiposDeTraspaso,
	traspasos,
	ubicaciones,
} from "../tablas.ts";

/** Lo de fuera que puede ser un lado de un traspaso. */
const ladoExterno = z.enum(["proveedor", "cliente_externo", "cliente_linea", "merma"]);

/** Una aclaración de recepción o de material. */
type Aclaracion = (typeof aclaracionesDeRecepcion)[number] | (typeof aclaracionesDeMaterial)[number];

/** El error de una aclaración que no aplica a esa diferencia. */
function noAplica(diferencia: Diferencia) {
	return errorDeRegla("aclaracion_no_aplica", `Esa aclaración no aplica a ${diferencia.folio}.`);
}

/** Lo que pasa con lo pendiente de una DF- de recepción: el lugar que recibió, el origen y su traspaso. */
interface LadosDeRecepcion {
	/** El lugar que recibió; `null` es Fuera (lo que se entregó a una tienda sin caja). */
	receptor: string | null;
	/** El origen: el del traspaso en camino a aduana; Aduana en tránsito; ninguno en la del taller. */
	origen: string | null;
	aduana: string;
	traspaso: typeof traspasos.$inferSelect;
}

/**
 * Los lados de una DF- de recepción (la tabla de «Cómo se aclara una de recepción»): en camino a aduana y en la del
 * taller recibió Aduana; en tránsito, el destino del traspaso, y lo entregado a una tienda sin caja ya salió (Fuera).
 */
async function ladosDeRecepcion(contexto: ContextoDeAccion, diferencia: Diferencia): Promise<LadosDeRecepcion> {
	const { transaccion } = contexto;
	const aduana = await ubicacionDeTipo(transaccion, "aduana");
	if (diferencia.traspasoId === null) throw new Error(`${diferencia.folio} de recepción sin traspaso`);
	const [traspaso] = await transaccion.select().from(traspasos).where(eq(traspasos.id, diferencia.traspasoId));
	const [hueco] = await transaccion
		.select({ tipo: ubicaciones.tipo })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, diferencia.ubicacionId));
	if (traspaso === undefined || hueco === undefined) throw new Error(`${diferencia.folio} sin traspaso o sin hueco`);
	if (hueco.tipo !== "transito") {
		return { receptor: aduana, origen: hueco.tipo === "taller" ? null : traspaso.origenUbicacionId, aduana, traspaso };
	}
	const [destino] =
		traspaso.destinoUbicacionId === null
			? []
			: await transaccion
					.select({ tipo: ubicaciones.tipo, desde: ubicaciones.existenciaDesde })
					.from(ubicaciones)
					.where(eq(ubicaciones.id, traspaso.destinoUbicacionId));
	const sinCaja = destino?.tipo === "tienda" && destino.desde === null;
	return { receptor: sinCaja ? null : traspaso.destinoUbicacionId, origen: aduana, aduana, traspaso };
}

/** Lo pendiente de una DF-, sin signo: las piezas o la cantidad, con su variante o su material. */
function pendienteDe(
	diferencia: Diferencia,
):
	| { varianteId: string; piezas: number; loteId: string | null }
	| { materialId: string; rolloId: string | null; cantidad: string } {
	const { varianteId, materialId } = diferencia;
	if (varianteId !== null) return { varianteId, piezas: Math.abs(diferencia.piezas ?? 0), loteId: diferencia.loteId };
	const milesimos = aMilesimosConSigno(diferencia.cantidad ?? "0");
	return {
		materialId: materialId ?? "",
		rolloId: diferencia.rolloId,
		cantidad: deMilesimos(milesimos < 0n ? -milesimos : milesimos),
	};
}

/** Si lo pendiente faltó (el tramo lo tiene de más) o sobró. */
function falto(diferencia: Diferencia): boolean {
	return diferencia.varianteId !== null
		? (diferencia.piezas ?? 0) < 0
		: aMilesimosConSigno(diferencia.cantidad ?? "0") < 0n;
}

/**
 * Crea el A- en que entra a Aduana lo aclarado: del mismo tipo, origen y destino que su traspaso, `en_aduana`, con
 * sus referencias; y le pasa las reservas que llegaron a Aduana con esas piezas.
 */
async function entrarAAduana(
	contexto: ContextoDeAccion,
	diferencia: Diferencia,
	lados: LadosDeRecepcion,
): Promise<{ traspasoId: string; folio: string }> {
	const viejo = lados.traspaso;
	const lado = (ubicacionId: string | null, externo: string | null): LadoDeTraspaso | null =>
		ubicacionId !== null ? { ubicacionId } : externo === null ? null : { externo: ladoExterno.parse(externo) };
	const referencias: ReferenciasDeTraspaso = {
		solicitudTiendaId: viejo.solicitudTiendaId,
		salidaTiendaId: viejo.salidaTiendaId,
		solicitudEnvioId: viejo.solicitudEnvioId,
		folioRb: viejo.folioRb,
		pedidoId: viejo.pedidoId,
		notaEntregaId: viejo.notaEntregaId,
		pedidoEspecialTiendaId: viejo.pedidoEspecialTiendaId,
		loteId: viejo.loteId,
		reprocesoId: viejo.reprocesoId,
		ordenCompraId: viejo.ordenCompraId,
		devolucionLineaId: viejo.devolucionLineaId,
		notaCreditoId: viejo.notaCreditoId,
	};
	const pendiente = pendienteDe(diferencia);
	const nuevo = await crearTraspaso(contexto, {
		tipo: z.enum(tiposDeTraspaso).parse(viejo.tipo),
		estado: "en_aduana",
		origen: lado(viejo.origenUbicacionId, viejo.origenExterno),
		destino: lado(viejo.destinoUbicacionId, viejo.destinoExterno),
		renglones: [pendiente],
		referencias,
		fechaSalidaEsperada: viejo.fechaSalidaEsperada,
	});
	// Las reservas de esas piezas llegaron a Aduana con el traspaso viejo: siguen al nuevo.
	if ("varianteId" in pendiente) {
		const suyas = await reservasActivas(
			contexto.transaccion,
			and(
				eq(reservas.traspasoId, viejo.id),
				eq(reservas.varianteId, pendiente.varianteId),
				eq(reservas.ubicacionId, lados.aduana),
			),
		);
		const tomadas = await tomarDeReservas(contexto, suyas, pendiente.piezas, "reasignada");
		if (tomadas.length > 0) {
			await contexto.transaccion
				.update(reservas)
				.set({ traspasoId: nuevo.traspasoId })
				.where(
					inArray(
						reservas.id,
						tomadas.map((tomada) => tomada.id),
					),
				);
		}
	}
	contexto.guardarEvento({
		tipo: "traspaso.en_aduana",
		datos: { traspaso_id: nuevo.traspasoId },
		tablas: ["traspasos", "traspaso_lineas", "reservas"],
		entidad: "traspasos",
		entidadId: nuevo.traspasoId,
		entidadFolio: nuevo.folio,
	});
	return nuevo;
}

/** Un renglón del movimiento de la aclaración: lo pendiente de un lado a otro, con el traspaso y el lote del hueco. */
function renglonDe(diferencia: Diferencia, origen: string | null, destino: string | null): RenglonDeMovimiento {
	return { origen, destino, traspasoId: diferencia.traspasoId, ...pendienteDe(diferencia) };
}

/** Lo que dejó una aclaración, para el mensaje, la bitácora y la salida. */
interface Aclarado {
	movimiento?: RenglonDeMovimiento[];
	nuevo?: { traspasoId: string; folio: string };
	espejo?: Diferencia;
}

/**
 * `llego` y `no_salio`: de dónde a dónde va lo pendiente (la tabla de «Cómo se aclara una de recepción»).
 * @throws `422 aclaracion_no_aplica` donde la tabla dice que no aplica.
 */
async function moverLoPendiente(
	contexto: ContextoDeAccion,
	diferencia: Diferencia,
	aclaracion: "llego" | "no_salio",
): Promise<Aclarado> {
	const lados = await ladosDeRecepcion(contexto, diferencia);
	const hueco = diferencia.ubicacionId;
	const otro = aclaracion === "llego" ? lados.receptor : lados.origen;
	// El otro lado tiene que existir (sin origen en la del taller); lo que sobró no sale de Aduana.
	if (aclaracion === "no_salio" && otro === null) throw noAplica(diferencia);
	if (!falto(diferencia) && otro === lados.aduana) throw noAplica(diferencia);
	const renglon = falto(diferencia) ? renglonDe(diferencia, hueco, otro) : renglonDe(diferencia, otro, hueco);
	await escribirMovimiento(contexto, {
		tipo: "aclaracion_recepcion",
		documento: { tipo: "diferencia", id: diferencia.id, folio: diferencia.folio },
		renglones: [renglon],
	});
	if (otro !== lados.aduana) return { movimiento: [renglon] };
	return { movimiento: [renglon], nuevo: await entrarAAduana(contexto, diferencia, lados) };
}

/**
 * `venia_en_otro`: se aclara junto con su espejo. Lo pendiente pasa del hueco de la que faltó al de la que sobró,
 * en dos renglones que cruzan por el lugar que recibió de más: ese lugar no cambia.
 * @throws `400` sin espejo; `422 espejo_no_corresponde` si no es su espejo.
 */
async function cruzarConSuEspejo(
	contexto: ContextoDeAccion,
	diferencia: Diferencia,
	otraId: string | undefined,
): Promise<Aclarado> {
	if (otraId === undefined) throw errorDeCampo("otra_diferencia_id", "Escoge con qué diferencia se cruzó.");
	if (diferencia.varianteId === null) throw noAplica(diferencia);
	const [espejo] = await diferenciasBloqueadas(contexto, [otraId]);
	const noCorresponde = () =>
		errorDeRegla(
			"espejo_no_corresponde",
			`${espejo?.folio ?? "Esa diferencia"} no es su espejo: tiene que ser de la misma prenda y talla, con las mismas piezas al revés, y estar por aclarar.`,
		);
	if (
		espejo === undefined ||
		espejo.id === diferencia.id ||
		espejo.estado !== "por_aclarar" ||
		(espejo.origen !== "recepcion" && espejo.origen !== "recepcion_taller") ||
		espejo.varianteId !== diferencia.varianteId ||
		espejo.piezas !== -(diferencia.piezas ?? 0)
	) {
		throw noCorresponde();
	}
	const [falta, sobra] = falto(diferencia) ? [diferencia, espejo] : [espejo, diferencia];
	const { receptor } = await ladosDeRecepcion(contexto, sobra);
	const renglones = [renglonDe(falta, falta.ubicacionId, receptor), renglonDe(sobra, receptor, sobra.ubicacionId)];
	await escribirMovimiento(contexto, {
		tipo: "aclaracion_recepcion",
		documento: { tipo: "diferencia", id: diferencia.id, folio: diferencia.folio },
		renglones,
	});
	return { movimiento: renglones, espejo };
}

/**
 * `aclarada` en material: solo cuando su existencia ya no es negativa (llegó el material y cubrió el hueco).
 * @throws `422 sigue_en_negativo`.
 */
async function yaNoEsNegativa(contexto: ContextoDeAccion, diferencia: Diferencia): Promise<void> {
	const { transaccion } = contexto;
	const materialId = diferencia.materialId ?? "";
	const lugar = { ubicacionId: diferencia.ubicacionId, materialId, rolloId: diferencia.rolloId };
	await bloquearExistenciasMaterial(transaccion, [lugar]);
	const [existencia] = await transaccion
		.select({ cantidad: existenciasMaterial.cantidad })
		.from(existenciasMaterial)
		.where(
			and(
				eq(existenciasMaterial.ubicacionId, lugar.ubicacionId),
				eq(existenciasMaterial.materialId, materialId),
				lugar.rolloId === null ? isNull(existenciasMaterial.rolloId) : eq(existenciasMaterial.rolloId, lugar.rolloId),
			),
		);
	if (aMilesimosConSigno(existencia?.cantidad ?? "0") >= 0n) return;
	const [material] = await transaccion
		.select({ nombre: materiales.nombre })
		.from(materiales)
		.where(eq(materiales.id, materialId));
	const [ubicacion] = await transaccion
		.select({ nombre: ubicaciones.nombre })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, lugar.ubicacionId));
	throw errorDeRegla(
		"sigue_en_negativo",
		`${material?.nombre ?? "El material"} sigue en negativo en ${ubicacion?.nombre ?? "su ubicación"}: aclárala con ajuste.`,
	);
}

/**
 * `perdida` (recepción) y `ajuste` (material): el AJ- de la ubicación del hueco, con un renglón (regla 7): en una de
 * recepción, lo que deja el hueco en cero (lo que faltó sale, lo que sobró entra); en una de material, lo que
 * faltaba, que entra.
 */
async function pedirSuAjuste(
	contexto: ContextoDeAccion,
	diferencia: Diferencia,
	motivoId: string,
): Promise<{ ajusteId: string; folio: string; mensaje: string }> {
	const deRecepcion = diferencia.origen === "recepcion" || diferencia.origen === "recepcion_taller";
	const lados = { diferenciaId: diferencia.id, traspasoId: diferencia.traspasoId, loteId: diferencia.loteId };
	const renglon =
		diferencia.varianteId !== null
			? { ...lados, varianteId: diferencia.varianteId, piezas: diferencia.piezas ?? 0 }
			: {
					...lados,
					materialId: diferencia.materialId ?? "",
					rolloId: diferencia.rolloId,
					cantidad: deMilesimos((deRecepcion ? 1n : -1n) * aMilesimosConSigno(diferencia.cantidad ?? "0")),
				};
	const ajuste = await pedirAjuste(contexto, {
		ubicacionId: diferencia.ubicacionId,
		origen: deRecepcion ? "diferencia_recepcion" : "diferencia_material",
		diferenciaId: diferencia.id,
		motivoId,
		departamento: "bodega",
		renglones: [renglon],
	});
	await contexto.transaccion
		.update(diferencias)
		.set({ estado: "esperando_autorizacion", ajusteId: ajuste.ajusteId })
		.where(eq(diferencias.id, diferencia.id));
	return ajuste;
}

/** Deja una DF- resuelta, `aclarada`, con la aclaración, el motivo, quién y cuándo. */
async function resolver(
	contexto: ContextoDeAccion,
	diferencia: Diferencia,
	aclaracion: Aclaracion,
	motivo: string,
	extra: { espejoId?: string; traspasoNuevoId?: string } = {},
): Promise<void> {
	await contexto.transaccion
		.update(diferencias)
		.set({
			estado: "resuelta",
			resolucion: "aclarada",
			aclaracion,
			motivoResolucion: motivo,
			aclaradaConDiferenciaId: extra.espejoId ?? null,
			traspasoNuevoId: extra.traspasoNuevoId ?? null,
			resueltaEn: contexto.ahora.toString(),
			resueltaPor: quienCambia(contexto),
		})
		.where(eq(diferencias.id, diferencia.id));
	contexto.guardarEvento({
		tipo: "diferencia.resuelta",
		datos: { diferencia_id: diferencia.id },
		tablas: ["diferencias", "existencias", "existencias_material", "traspasos", "reservas"],
		entidad: "diferencias",
		entidadId: diferencia.id,
		entidadFolio: diferencia.folio,
	});
}

export const accionAclararDiferencia = implementarAccion(aclararDiferencia, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	// Los candados en el orden fijo: las variantes y los traspasos de las dos DF- (sin bloquearlas), luego las DF-.
	const ids = [datos.diferencia_id, ...(datos.otra_diferencia_id === undefined ? [] : [datos.otra_diferencia_id])];
	const previas = await transaccion
		.select({ varianteId: diferencias.varianteId, traspasoId: diferencias.traspasoId })
		.from(diferencias)
		.where(inArray(diferencias.id, ids));
	await tomarCandadosDeInventario(transaccion, {
		varianteIds: previas.flatMap((previa) => (previa.varianteId === null ? [] : [previa.varianteId])),
		traspasoIds: previas.flatMap((previa) => (previa.traspasoId === null ? [] : [previa.traspasoId])),
	});
	await diferenciasBloqueadas(contexto, ids);
	const diferencia = await diferenciaBloqueada(contexto, datos.diferencia_id);
	await tomarVersion(contexto, diferencias, diferencia.id, version, async () => ({
		diferencia_id: diferencia.id,
		estado: diferencia.estado,
	}));
	await revisarMotivo(contexto, datos.motivo);
	const conAjuste = datos.aclaracion === "perdida" || datos.aclaracion === "ajuste";
	if (conAjuste && datos.motivo_id === undefined) throw errorDeCampo("motivo_id", "Escoge el motivo del ajuste.");
	if (diferencia.estado !== "por_aclarar") {
		throw errorDeRegla("no_por_aclarar", `${diferencia.folio} no está por aclarar.`);
	}
	const deRecepcion = diferencia.origen === "recepcion" || diferencia.origen === "recepcion_taller";
	const suyas: readonly Aclaracion[] = deRecepcion ? aclaracionesDeRecepcion : aclaracionesDeMaterial;
	if (!suyas.includes(datos.aclaracion)) throw noAplica(diferencia);
	const motivo = datos.motivo.trim();
	let aclarado: Aclarado = {};
	let ajuste: { ajusteId: string; folio: string; mensaje: string } | undefined;
	switch (datos.aclaracion) {
		case "llego":
		case "no_salio":
			aclarado = await moverLoPendiente(contexto, diferencia, datos.aclaracion);
			break;
		case "venia_en_otro":
			aclarado = await cruzarConSuEspejo(contexto, diferencia, datos.otra_diferencia_id);
			break;
		case "aclarada":
			await yaNoEsNegativa(contexto, diferencia);
			break;
		case "perdida":
		case "ajuste":
			ajuste = await pedirSuAjuste(contexto, diferencia, await revisarMotivoDeAjuste(contexto, datos.motivo_id));
			await transaccion.update(diferencias).set({ motivoResolucion: motivo }).where(eq(diferencias.id, diferencia.id));
			break;
	}
	if (ajuste === undefined) {
		await resolver(contexto, diferencia, datos.aclaracion, motivo, {
			...(aclarado.espejo === undefined ? {} : { espejoId: aclarado.espejo.id }),
			...(aclarado.nuevo === undefined ? {} : { traspasoNuevoId: aclarado.nuevo.traspasoId }),
		});
		if (aclarado.espejo !== undefined) {
			await resolver(contexto, aclarado.espejo, "venia_en_otro", motivo, { espejoId: diferencia.id });
		}
	}
	contexto.bitacora({
		descripcion: `Aclaró ${diferencia.folio}: ${datos.aclaracion}`,
		entidad: "diferencias",
		entidadId: diferencia.id,
		entidadFolio: diferencia.folio,
		antes: { estado: diferencia.estado },
		despues: {
			estado: ajuste === undefined ? "resuelta" : "esperando_autorizacion",
			aclaracion: datos.aclaracion,
			motivo,
			...(aclarado.espejo === undefined ? {} : { espejo: aclarado.espejo.folio }),
			...(aclarado.nuevo === undefined ? {} : { traspaso_nuevo: aclarado.nuevo.folio }),
			...(ajuste === undefined ? {} : { ajuste: ajuste.folio }),
		},
	});
	const piezas = Math.abs(diferencia.piezas ?? 0);
	const mensaje =
		ajuste !== undefined
			? ajuste.mensaje
			: aclarado.nuevo !== undefined && diferencia.varianteId !== null
				? `${diferencia.folio} aclarada: ${piezas} piezas en aduana en ${aclarado.nuevo.folio}`
				: `${diferencia.folio} aclarada`;
	return {
		resultado: {
			mensaje,
			...(ajuste === undefined ? {} : { ajuste_id: ajuste.ajusteId }),
			...(aclarado.nuevo === undefined ? {} : { traspaso_id: aclarado.nuevo.traspasoId }),
			version: await versionActual(transaccion, diferencias, diferencia.id),
		},
		entidad: { nombre: "diferencias", id: diferencia.id },
	};
});
