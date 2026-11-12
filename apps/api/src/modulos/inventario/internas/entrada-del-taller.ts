/**
 * `inventario.registrar_entrada_del_taller`: la única que mueve piezas del Taller a Aduana. La llaman «Recibir del
 * taller» y «Recibir reproceso».
 * Fases 14 y 16 · docs/modulos/inventario/recepcion-del-taller.md (reglas 3 a 7, «`inventario.registrar_entrada_del_taller`»)
 *
 * Escribe la recepción a ciegas con lo aprobado como esperado; un A- por destino del reparto, `en_aduana`, con sus
 * etiquetas por imprimir; el movimiento del Taller a Aduana por talla y destino, con el A- y el lote; la reserva
 * `pedido_externo` de lo que va al cliente de un pedido; en un lote, el consumo de sus avíos; y una DF- por talla que
 * no cuadró, a cargo del Taller.
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { nombreDeVariante } from "../dominio/reservas.ts";
import {
	apartarLoDelCliente,
	crearPartesDelReparto,
	leerLoteParaAduana,
	nombresDelReparto,
	repartoDelTaller,
} from "../dominio/taller.ts";
import { recepciones, recepcionLineas } from "../tablas.ts";

/** Lo que recibe: de dónde viene, el lote y, por talla, lo aprobado y lo contado. */
const pedidoDeEntrada = z
	.object({
		origen: z.enum(["lote", "reproceso"]),
		lote_id: z.uuid(),
		revision_id: z.uuid().optional(),
		reproceso_id: z.uuid().optional(),
		/** El folio de lo que llega: el del lote o el del reproceso (`L-2026-124-R1`). */
		folio: z.string(),
		tallas: z
			.array(z.object({ variante_id: z.uuid(), aprobadas: z.number().int().min(0), contadas: z.number().int().min(0) }))
			.min(1),
	})
	.strict()
	.refine(
		(pedido) => (pedido.origen === "lote") === (pedido.revision_id !== undefined && pedido.reproceso_id === undefined),
	);

/**
 * Los avíos que la entrega a corte de un lote pasó al Taller, por material: lo de sus entregas vigentes sin rollo.
 * La tela no: esa la cierra el corte.
 */
async function aviosDelLote(contexto: ContextoDeAccion, loteId: string) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT l.material_id, sum(l.cantidad)::numeric(12, 3)::text AS cantidad
		FROM entregas_corte e JOIN movimiento_lineas l ON l.movimiento_id = e.movimiento_id
		WHERE e.lote_id = ${loteId} AND e.estado IN ('entregada', 'cerrada') AND l.rollo_id IS NULL
			AND l.material_id IS NOT NULL
		GROUP BY l.material_id ORDER BY l.material_id`);
	return z.array(z.object({ material_id: z.uuid(), cantidad: z.string() })).parse(rows);
}

/**
 * Registra lo que llega del taller.
 * @param contexto El contexto de la acción de Aduana.
 * @param datos Lo que llega, con lo aprobado y lo contado por talla.
 * @returns La recepción, sus A-, sus DF- y lo que hace falta para el mensaje (nunca lo aprobado).
 */
export async function registrarEntradaDelTaller(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeEntrada.parse(datos);
	const { transaccion } = contexto;
	await candadoDeVariantes(
		transaccion,
		pedido.tallas.map((talla) => talla.variante_id),
	);
	const lote = await leerLoteParaAduana(contexto, pedido.lote_id);
	const esReproceso = pedido.origen === "reproceso";
	const reparto = await repartoDelTaller(
		contexto,
		lote,
		esReproceso,
		pedido.tallas.map((talla) => ({ varianteId: talla.variante_id, piezas: talla.contadas })),
	);
	const [taller, aduana] = [await ubicacionDeTipo(transaccion, "taller"), await ubicacionDeTipo(transaccion, "aduana")];
	const quien = quienCambia(contexto);
	// La recepción, a ciegas: lo aprobado se guarda como lo esperado.
	const recepcionId = uuidv7();
	await transaccion.insert(recepciones).values({
		id: recepcionId,
		tipo: "aduana_del_taller",
		ubicacionId: aduana,
		modo: "ciego",
		loteId: lote.lote_id,
		revisionId: pedido.revision_id ?? null,
		reprocesoId: pedido.reproceso_id ?? null,
		recibidoEn: contexto.ahora.toString(),
		recibidoPor: quien,
		huboDiferencia: pedido.tallas.some((talla) => talla.aprobadas !== talla.contadas),
		creadoPor: quien,
	});
	await transaccion.insert(recepcionLineas).values(
		pedido.tallas.map((talla, i) => ({
			id: uuidv7(),
			recepcionId,
			renglon: i + 1,
			varianteId: talla.variante_id,
			loteId: lote.lote_id,
			piezasEsperadas: talla.aprobadas,
			piezasContadas: talla.contadas,
			creadoPor: quien,
		})),
	);
	// Un A- por destino del reparto, con lo que llegó de cada talla: nace en aduana, con sus etiquetas por imprimir.
	const creadas = await crearPartesDelReparto(contexto, reparto, {
		origenId: taller,
		lote,
		reprocesoId: pedido.reproceso_id ?? null,
		recepcionId,
	});
	let movimientoId: string | null = null;
	if (creadas.length > 0) {
		// Un renglón por talla y destino, del Taller a Aduana, con su A- y el lote.
		const movimiento = await escribirMovimiento(contexto, {
			tipo: esReproceso ? "recepcion_reproceso" : "recepcion_taller",
			documento: { tipo: "recepcion", id: recepcionId, folio: pedido.folio },
			renglones: creadas.flatMap(({ traspasoId, parte }) =>
				parte.tallas.map((talla) => ({
					origen: taller,
					destino: aduana,
					varianteId: talla.varianteId,
					piezas: talla.piezas,
					traspasoId,
					loteId: lote.lote_id,
				})),
			),
			numero: 1,
		});
		movimientoId = movimiento.movimientoId;
		await transaccion.update(recepciones).set({ movimientoId }).where(eq(recepciones.id, recepcionId));
		// Lo del cliente queda apartado en Aduana para su pedido.
		await apartarLoDelCliente(contexto, creadas);
	}
	// En un lote, sus avíos salen del Taller: los que pasó su entrega a corte (regla 7).
	if (!esReproceso) {
		const avios = (await aviosDelLote(contexto, lote.lote_id)).filter((avio) => aMilesimosConSigno(avio.cantidad) > 0n);
		if (avios.length > 0) {
			await escribirMovimiento(contexto, {
				tipo: "consumo_avios",
				documento: { tipo: "recepcion", id: recepcionId, folio: pedido.folio },
				renglones: avios.map((avio) => ({
					origen: taller,
					destino: null,
					materialId: avio.material_id,
					cantidad: deMilesimos(aMilesimosConSigno(avio.cantidad)),
					loteId: lote.lote_id,
				})),
				numero: 2,
			});
		}
	}
	// Lo que no cuadró se queda en el Taller, a cargo del Taller: una DF- por talla (regla 6).
	const diferencias: { diferencia_id: string; folio: string }[] = [];
	for (const talla of pedido.tallas) {
		if (talla.contadas === talla.aprobadas) continue;
		const { talla: nombre } = await nombreDeVariante(transaccion, talla.variante_id);
		const abierta = await abrirDiferencia(contexto, {
			origen: "recepcion_taller",
			ubicacionId: taller,
			aCargoUbicacionId: taller,
			hueco: { varianteId: talla.variante_id, piezas: talla.contadas - talla.aprobadas, sistemaDecia: talla.aprobadas },
			descripcion: `Calidad aprobó ${talla.aprobadas} de ${pedido.folio} talla ${nombre} y Aduana contó ${talla.contadas}`,
			recepcionId,
			loteId: lote.lote_id,
			movimientoId,
		});
		diferencias.push({ diferencia_id: abierta.diferenciaId, folio: abierta.folio });
	}
	contexto.guardarEvento({
		tipo: "recepcion.del_taller",
		datos: { recepcion_id: recepcionId, lote_id: lote.lote_id },
		tablas: ["recepciones", "recepcion_lineas", "existencias", "existencias_material", "diferencias", "reservas"],
		entidad: "recepciones",
		entidadId: recepcionId,
		entidadFolio: pedido.folio,
	});
	const suma = (de: (talla: (typeof pedido.tallas)[number]) => number) =>
		pedido.tallas.reduce((total, talla) => total + de(talla), 0);
	return {
		recepcion_id: recepcionId,
		traspasos: creadas.map((creada) => ({ traspaso_id: creada.traspasoId, folio: creada.folio })),
		diferencias,
		destino: nombresDelReparto(reparto),
		piezas: suma((talla) => talla.contadas),
		faltaron: suma((talla) => Math.max(0, talla.aprobadas - talla.contadas)),
		sobraron: suma((talla) => Math.max(0, talla.contadas - talla.aprobadas)),
	};
}

/** Lo que regresa la interna a quien la llama. */
export const entradaRegistrada = z.object({
	recepcion_id: z.uuid(),
	traspasos: z.array(z.object({ traspaso_id: z.uuid(), folio: z.string() })),
	diferencias: z.array(z.object({ diferencia_id: z.uuid(), folio: z.string() })),
	destino: z.string(),
	piezas: z.number(),
	faltaron: z.number(),
	sobraron: z.number(),
});
