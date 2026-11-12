/**
 * `inventario.recibir_en_aduana`: Aduana recibe lo que viene en camino de Bodega o de una tienda. Lo que llegó pasa
 * de En camino a aduana a Aduana; lo que no llegó se queda en su tramo, a cargo de quien lo mandó; lo que llegó de
 * más sale igual del tramo. Cada renglón que no cuadró abre su DF-. Lo que sigue al traspaso cambia con él.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (regla 7, «`inventario.recibir_en_aduana`»)
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (regla 2): la DF- `recepcion` de cada renglón
 *
 * Una devolución de un cliente llega `esperado`, de Fuera: lo que llegó entra a Aduana y lo que no llegó nunca fue
 * inventario. Por tipo: una devolución al proveedor surtida de Bodega queda lista para «Devolver al proveedor»; lo
 * surtido para un pedido externo deja su reserva en Aduana, o regresa a Bodega si el pedido ya se canceló (fase 16);
 * lo bueno de una devolución de cliente a un hijo para Bodega, y lo demás de cada tipo, llegan con sus fases
 * (decisión 574).
 */

import { aMilesimosConSigno, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { recibirEnAduana } from "@uniformame/compartido/contratos/inventario/recepciones";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { tomarCandadosDeInventario } from "../dominio/candados.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo, ubicacionPorId } from "../dominio/recepciones.ts";
import { cambiarEstadoTraspaso, type TraspasoCreado } from "../dominio/traspasos.ts";
import { regresarAlOrigen } from "../internas/reservas.ts";
import { recepciones, recepcionLineas, traspasoLineas, traspasos } from "../tablas.ts";

/** Lo que regresa `ventas.avance_pedido` que importa aquí: el estado del pedido. */
const estadoDelPedido = z.object({ estado: z.string() });

/**
 * Si lo que llegó es lo surtido para un pedido externo que ya se canceló, lo reparte en un `regresa` a Bodega: sus
 * reservas se liberaron al cancelarlo y nada lo espera en Aduana.
 * @returns El hijo `regresa`, o `null` si no aplica.
 */
async function regresaSiSeCancelo(
	contexto: ContextoDeAccion,
	traspaso: typeof traspasos.$inferSelect,
	contados: readonly { linea: typeof traspasoLineas.$inferSelect; llego: bigint }[],
): Promise<TraspasoCreado | null> {
	if (traspaso.tipo !== "surtido_pedido_externo" || traspaso.pedidoId === null) return null;
	const pedido = estadoDelPedido.parse(
		await contexto.lectura("ventas.avance_pedido", { pedido_id: traspaso.pedidoId }),
	);
	if (pedido.estado !== "cancelado") return null;
	const porVariante = new Map<string, number>();
	for (const { linea, llego } of contados) {
		if (linea.varianteId === null || llego === 0n) continue;
		porVariante.set(linea.varianteId, (porVariante.get(linea.varianteId) ?? 0) + Number(llego));
	}
	return regresarAlOrigen(contexto, traspaso.id, porVariante);
}

export const accionRecibirEnAduana = implementarAccion(recibirEnAduana, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const lineas = await transaccion
		.select()
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, datos.traspaso_id))
		.orderBy(asc(traspasoLineas.renglon));
	await tomarCandadosDeInventario(transaccion, {
		varianteIds: lineas.flatMap((linea) => (linea.varianteId === null ? [] : [linea.varianteId])),
		traspasoIds: [datos.traspaso_id],
	});
	const [traspaso] = await transaccion.select().from(traspasos).where(eq(traspasos.id, datos.traspaso_id));
	if (traspaso === undefined) throw noExiste();
	await tomarVersion(contexto, traspasos, traspaso.id, version, async () => ({
		traspaso_id: traspaso.id,
		estado: traspaso.estado,
	}));
	const deCliente = traspaso.tipo === "devolucion_cliente_externo" || traspaso.tipo === "devolucion_linea";
	if (traspaso.estado !== (deCliente ? "esperado" : "en_camino_aduana")) {
		throw errorDeRegla("no_por_recibir", `${traspaso.folio} ya se recibió`);
	}
	// Lo que llegó de cada renglón: completo, lo enviado; con diferencias (siempre, en la devolución de un cliente), lo
	// contado, que viene para cada renglón.
	const modo = deCliente ? "con_diferencias" : datos.modo;
	const contados = lineas.map((linea) => {
		const esPrenda = linea.varianteId !== null;
		const enviado = esPrenda ? BigInt(linea.piezasEnviadas ?? 0) : aMilesimosConSigno(linea.cantidadEnviada ?? "0");
		if (modo === "completo") return { linea, esPrenda, enviado, llego: enviado };
		const suyo = datos.renglones?.find((renglon) => renglon.traspaso_linea_id === linea.id);
		const llego = esPrenda
			? suyo?.piezas === undefined
				? undefined
				: BigInt(suyo.piezas)
			: suyo?.cantidad === undefined
				? undefined
				: aMilesimosConSigno(suyo.cantidad);
		if (llego === undefined) {
			throw new ErrorDeApi("validacion", "falta_renglon", "Escribe cuántas llegaron de cada prenda, aunque sea 0", {
				campos: { renglones: "Escribe cuántas llegaron de cada prenda, aunque sea 0" },
			});
		}
		return { linea, esPrenda, enviado, llego };
	});
	const aduana = await ubicacionDeTipo(transaccion, "aduana");
	const enCamino = await ubicacionDeTipo(transaccion, "en_camino_aduana");
	const recepcionId = uuidv7();
	const huboDiferencia = contados.some(({ enviado, llego }) => enviado !== llego);
	await transaccion.insert(recepciones).values({
		id: recepcionId,
		tipo: deCliente ? "aduana_devolucion" : "aduana_de_camino",
		ubicacionId: aduana,
		modo,
		traspasoId: traspaso.id,
		recibidoEn: contexto.ahora.toString(),
		recibidoPor: quienCambia(contexto),
		huboDiferencia,
		creadoPor: quienCambia(contexto),
	});
	const renglones: RenglonDeMovimiento[] = contados.flatMap(({ linea, esPrenda, llego }): RenglonDeMovimiento[] => {
		if (llego === 0n) return [];
		const lados = { origen: deCliente ? null : enCamino, destino: aduana, traspasoId: traspaso.id };
		return esPrenda
			? [{ ...lados, varianteId: linea.varianteId ?? "", piezas: Number(llego), loteId: linea.loteId }]
			: [{ ...lados, materialId: linea.materialId ?? "", rolloId: linea.rolloId, cantidad: deMilesimos(llego) }];
	});
	let movimientoId: string | null = null;
	if (renglones.length > 0) {
		const movimiento = await escribirMovimiento(contexto, {
			tipo: deCliente
				? traspaso.tipo === "devolucion_linea"
					? "devolucion_linea"
					: "devolucion_cliente_externo"
				: "recepcion_aduana",
			documento: { tipo: "recepcion", id: recepcionId, folio: traspaso.folio },
			renglones,
		});
		movimientoId = movimiento.movimientoId;
		await transaccion
			.update(recepciones)
			.set({ movimientoId: movimiento.movimientoId })
			.where(eq(recepciones.id, recepcionId));
	}
	const quien = quienCambia(contexto);
	await transaccion.insert(recepcionLineas).values(
		contados.map(({ linea, esPrenda, enviado, llego }, i) => ({
			id: uuidv7(),
			recepcionId,
			renglon: i + 1,
			traspasoLineaId: linea.id,
			varianteId: linea.varianteId,
			materialId: linea.materialId,
			rolloId: linea.rolloId,
			loteId: linea.loteId,
			...(esPrenda
				? { piezasEsperadas: Number(enviado), piezasContadas: Number(llego) }
				: { cantidadEsperada: deMilesimos(enviado), cantidadContada: deMilesimos(llego) }),
			creadoPor: quien,
		})),
	);
	for (const { linea, esPrenda, llego } of contados) {
		await transaccion
			.update(traspasoLineas)
			.set(esPrenda ? { piezasRecibidasAduana: Number(llego) } : { cantidadRecibidaAduana: deMilesimos(llego) })
			.where(eq(traspasoLineas.id, linea.id));
	}
	// Lo que no cuadró se queda en el tramo, a cargo de quien lo mandó: una DF- por renglón. Lo que no llegó de una
	// devolución de un cliente nunca fue inventario: no deja diferencia.
	const origen = (await ubicacionPorId(transaccion, traspaso.origenUbicacionId)) ?? {
		nombre: "quien lo mandó",
		tipo: "",
	};
	if (!deCliente) {
		for (const { linea, esPrenda, enviado, llego } of contados) {
			if (enviado === llego) continue;
			if (traspaso.origenUbicacionId === null) throw new Error(`${traspaso.folio} en camino sin origen`);
			await abrirDiferencia(contexto, {
				origen: "recepcion",
				ubicacionId: enCamino,
				aCargoUbicacionId: traspaso.origenUbicacionId,
				hueco: esPrenda
					? { varianteId: linea.varianteId ?? "", piezas: Number(llego - enviado), sistemaDecia: Number(enviado) }
					: { materialId: linea.materialId ?? "", rolloId: linea.rolloId, cantidad: deMilesimos(llego - enviado) },
				descripcion: `${origen.nombre} mandó ${esPrenda ? enviado : cantidadEnTexto(enviado)} en ${traspaso.folio} y Aduana recibió ${esPrenda ? llego : cantidadEnTexto(llego)}`,
				traspasoId: traspaso.id,
				traspasoLineaId: linea.id,
				recepcionId,
				loteId: linea.loteId,
				movimientoId,
			});
		}
	}
	await cambiarEstadoTraspaso(contexto, traspaso.id, "en_aduana");
	await transaccion.update(traspasos).set({ recepcionAduanaId: recepcionId }).where(eq(traspasos.id, traspaso.id));
	// Lo surtido para un pedido que se canceló mientras venía en camino regresa a Bodega; si sigue, su reserva quedó
	// en Aduana con la pieza.
	const regresa = await regresaSiSeCancelo(contexto, traspaso, contados);
	contexto.bitacora({
		descripcion: `Recibió ${traspaso.folio}`,
		entidad: "traspasos",
		entidadId: traspaso.id,
		entidadFolio: traspaso.folio,
		antes: { estado: traspaso.estado },
		despues: {
			estado: "en_aduana",
			llego: contados.map(({ linea, esPrenda, llego }) => ({
				renglon: linea.renglon,
				...(esPrenda ? { piezas: Number(llego) } : { cantidad: deMilesimos(llego) }),
			})),
		},
	});
	contexto.guardarEvento({
		tipo: "traspaso.en_aduana",
		datos: { traspaso_id: traspaso.id },
		tablas: [
			"traspasos",
			"traspaso_lineas",
			"recepciones",
			"recepcion_lineas",
			"existencias",
			"existencias_material",
			"reservas",
			"diferencias",
		],
		entidad: "traspasos",
		entidadId: traspaso.id,
		entidadFolio: traspaso.folio,
	});
	// El mensaje: a una tienda, para quién; lo demás, cuántas; si no cuadró, a cargo de quién queda.
	const piezas = contados.filter(({ esPrenda }) => esPrenda).reduce((suma, { llego }) => suma + Number(llego), 0);
	const faltaron = contados
		.filter(({ esPrenda }) => esPrenda)
		.reduce((suma, { enviado, llego }) => suma + Math.max(0, Number(enviado - llego)), 0);
	const faltoMaterial = contados.some(({ esPrenda, enviado, llego }) => !esPrenda && llego < enviado);
	const destino = (await ubicacionPorId(transaccion, traspaso.destinoUbicacionId)) ?? { nombre: "", tipo: "" };
	const soloMaterial = contados.every(({ esPrenda }) => !esPrenda);
	const base = soloMaterial
		? `${traspaso.folio} recibido en aduana`
		: ["solicitud_tienda", "reabasto"].includes(traspaso.tipo) && destino.tipo === "tienda"
			? `${traspaso.folio} recibido en aduana: ${piezas} piezas para ${destino.nombre}`
			: `${traspaso.folio} recibido en aduana: ${piezas} piezas`;
	const falto = deCliente
		? ""
		: faltaron > 0
			? `. Faltaron ${faltaron}: queda por aclarar a cargo de ${origen.nombre}`
			: faltoMaterial
				? `. Faltó material: queda por aclarar a cargo de ${origen.nombre}`
				: "";
	return {
		resultado: {
			recepcion_id: recepcionId,
			mensaje: `${base}${falto}${regresa === null ? "" : `. El pedido se canceló: regresa a Bodega en ${regresa.folio}`}`,
			version: await versionActual(transaccion, traspasos, traspaso.id),
		},
		entidad: { nombre: "traspasos", id: traspaso.id },
	};
});
