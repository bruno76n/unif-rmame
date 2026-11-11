/**
 * Lo que comparten los registros de operación: lo hecho en un bulto por operación, el flujo del lote en orden, la
 * tarifa que valía y el avance del lote con cada registro.
 * Fase 12 · docs/modulos/produccion/registros-de-operacion.md (reglas 3 a 7) y lotes.md (reglas 4 a 6)
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { v5 as uuidv5, v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { subirVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { flujoOperaciones, lotes, loteTallas, operaciones, registrosOperacion } from "../tablas.ts";

/** Una operación del flujo congelado de un lote, en su orden. */
export interface OperacionDelLote {
	flujoOperacionId: string;
	nombre: string;
	esCorte: boolean;
	orden: number;
}

/**
 * Las operaciones vigentes del flujo de un lote, en su orden.
 * @param flujoId El flujo que el lote congeló al cortarse.
 */
export function operacionesDelLote(contexto: ContextoDeAccion, flujoId: string): Promise<OperacionDelLote[]> {
	return contexto.transaccion
		.select({
			flujoOperacionId: flujoOperaciones.id,
			nombre: operaciones.nombre,
			esCorte: operaciones.esCorte,
			orden: flujoOperaciones.orden,
		})
		.from(flujoOperaciones)
		.innerJoin(operaciones, eq(operaciones.id, flujoOperaciones.operacionId))
		.where(and(eq(flujoOperaciones.flujoId, flujoId), sql`${flujoOperaciones.bajaEn} is null`))
		.orderBy(asc(flujoOperaciones.orden));
}

/** Lo hecho en un bulto por operación: las buenas y las dañadas de sus registros vigentes. */
export async function hechoEnElBulto(contexto: ContextoDeAccion, bultoId: string) {
	const filas = await contexto.transaccion
		.select({
			flujoOperacionId: registrosOperacion.flujoOperacionId,
			buenas: sql<number>`sum(${registrosOperacion.piezasBuenas})::int`,
			danadas: sql<number>`sum(${registrosOperacion.piezasDanadas})::int`,
		})
		.from(registrosOperacion)
		.where(and(eq(registrosOperacion.bultoId, bultoId), eq(registrosOperacion.estado, "vigente")))
		.groupBy(registrosOperacion.flujoOperacionId);
	return new Map(filas.map((fila) => [fila.flujoOperacionId, { buenas: fila.buenas, danadas: fila.danadas }]));
}

/** Lo que regresa `personal.tarifa_vigente`. */
const tarifaVigente = z.object({ tarifa_operacion_id: z.uuid(), tarifa_centavos: z.number() }).nullable();

/**
 * La tarifa que valía para una operación de un flujo en un momento (regla 4), o `null` si todavía no tenía.
 * @param en El momento en que se hizo.
 */
export async function tarifaQueValia(contexto: ContextoDeAccion, flujoOperacionId: string, en: string) {
	return tarifaVigente.parse(
		await contexto.lectura("personal.tarifa_vigente", { flujo_operacion_id: flujoOperacionId, en }),
	);
}

/**
 * Suma o resta lo de un registro en la talla de su bulto (regla 6): la merma con las dañadas y, en la última
 * operación, las terminadas con las buenas; sube la versión del lote, que es un agregado con sus tallas.
 * @param signo 1 al registrar, −1 al cancelar.
 */
export async function moverLaTalla(
	contexto: ContextoDeAccion,
	registro: { loteId: string; varianteId: string; buenas: number; danadas: number; esUltima: boolean },
	signo: 1 | -1,
) {
	await contexto.transaccion
		.update(loteTallas)
		.set({
			piezasMerma: sql`${loteTallas.piezasMerma} + ${signo * registro.danadas}`,
			...(registro.esUltima
				? { piezasTerminadas: sql`${loteTallas.piezasTerminadas} + ${signo * registro.buenas}` }
				: {}),
		})
		.where(and(eq(loteTallas.loteId, registro.loteId), eq(loteTallas.varianteId, registro.varianteId)));
	await subirVersion(contexto.transaccion, lotes, registro.loteId);
}

/**
 * Si un lote quedó completo: en todas sus tallas cortadas, terminadas + merma llegan a las cortadas (regla 5).
 * @param loteId El lote.
 */
export async function loteCompleto(contexto: ContextoDeAccion, loteId: string): Promise<boolean> {
	const tallas = await contexto.transaccion
		.select({
			cortadas: loteTallas.piezasCortadas,
			terminadas: loteTallas.piezasTerminadas,
			merma: loteTallas.piezasMerma,
		})
		.from(loteTallas)
		.where(eq(loteTallas.loteId, loteId));
	const conPiezas = tallas.filter((talla) => (talla.cortadas ?? 0) > 0);
	return conPiezas.length > 0 && conPiezas.every((talla) => talla.terminadas + talla.merma >= (talla.cortadas ?? 0));
}

/** Pasa un lote en proceso a terminado y guarda `lote.terminado`: Calidad lo ve por revisar. */
export async function terminarLote(contexto: ContextoDeAccion, lote: { id: string; folio: string }) {
	await contexto.transaccion
		.update(lotes)
		.set({ estado: "terminado", terminadoEn: contexto.ahora.toString() })
		.where(and(eq(lotes.id, lote.id), eq(lotes.estado, "en_proceso")));
	contexto.guardarEvento({
		tipo: "lote.terminado",
		datos: { lote_id: lote.id },
		tablas: ["lotes", "lote_tallas"],
		entidad: "lotes",
		entidadId: lote.id,
		entidadFolio: lote.folio,
	});
}

/** Un bulto del corte, con lo que lleva. */
interface BultoDelCorte {
	id: string;
	numero: number;
	piezas: number;
}

/**
 * Los registros del corte: uno por bulto en la operación de corte del flujo, a nombre de quien cortó, con la tarifa
 * vigente (o vacía) y la clave derivada de la acción, «corte» y el número de bulto. Cuentan para la nómina por pieza
 * igual que uno de la tablet y no se cancelan.
 */
export async function registrosDelCorte(
	contexto: ContextoDeAccion,
	corte: { id: string; loteId: string; flujoId: string; personaId: string; bultos: readonly BultoDelCorte[] },
) {
	const [deCorte] = (await operacionesDelLote(contexto, corte.flujoId)).filter((operacion) => operacion.esCorte);
	if (deCorte === undefined) throw new Error("el flujo del lote no tiene corte");
	const clave = contexto.claveIdempotencia;
	if (clave === undefined) throw new Error("el corte se cierra con una acción con su clave");
	const ahora = contexto.ahora.toString();
	const tarifa = await tarifaQueValia(contexto, deCorte.flujoOperacionId, ahora);
	if (corte.bultos.length === 0) return;
	await contexto.transaccion.insert(registrosOperacion).values(
		corte.bultos.map((bulto) => ({
			id: uuidv7(),
			origen: "corte" as const,
			corteId: corte.id,
			bultoId: bulto.id,
			loteId: corte.loteId,
			flujoOperacionId: deCorte.flujoOperacionId,
			personaId: corte.personaId,
			piezasBuenas: bulto.piezas,
			piezasDanadas: 0,
			tarifaCentavos: tarifa?.tarifa_centavos ?? null,
			tarifaOperacionId: tarifa?.tarifa_operacion_id ?? null,
			claveIdempotencia: uuidv5(`corte:${bulto.numero}`, clave),
			hechoEn: ahora,
			fecha: contexto.diaDeNegocio.toString(),
			sinInternet: false,
			creadoPor: quienCambia(contexto),
		})),
	);
}
