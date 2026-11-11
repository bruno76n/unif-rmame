/**
 * `inventario.registrar_merma_produccion` e `inventario.revertir_merma_produccion`: las piezas dañadas de un registro
 * de la tablet salen del Taller con su lote, y vuelven si el registro se cancela.
 * Fase 12 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md («Acciones internas»), aunque viven en la fase 14
 *
 * Nunca rechazan: el tope del bulto lo revisa Producción y va a excepciones. El documento del movimiento es el
 * registro, y su clave, la del registro: la misma subida dos veces no descuenta dos veces.
 */

import { and, eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { escribirMovimiento, revertirMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { movimientos } from "../tablas.ts";

/** Lo que recibe `inventario.registrar_merma_produccion`. */
const deLaMerma = z.object({
	registro_operacion_id: z.uuid(),
	lote_id: z.uuid(),
	variante_id: z.uuid(),
	piezas: z.number().int().positive(),
	ocurrido_en: z.iso.datetime({ offset: true }),
	dispositivo_id: z.uuid().nullable(),
	persona_id: z.uuid().nullable(),
});

/** La clave del movimiento de la merma de un registro (y de su reversión). */
const claveDe = (registroId: string, que: "merma" | "reversion") => uuidv5(`merma_produccion:${que}`, registroId);

/**
 * La merma de un registro: del Taller a Fuera, con su lote, su persona y su tablet.
 * @returns El movimiento.
 */
export async function registrarMermaProduccion(contexto: ContextoDeAccion, datos: unknown) {
	const merma = deLaMerma.parse(datos);
	const taller = await ubicacionDeTipo(contexto.transaccion, "taller");
	const movimiento = await escribirMovimiento(contexto, {
		tipo: "merma_produccion",
		documento: { tipo: "registro_operacion", id: merma.registro_operacion_id },
		renglones: [
			{ origen: taller, destino: null, varianteId: merma.variante_id, piezas: merma.piezas, loteId: merma.lote_id },
		],
		ocurridoEn: Temporal.Instant.from(merma.ocurrido_en),
		clave: claveDe(merma.registro_operacion_id, "merma"),
		personaId: merma.persona_id,
		dispositivoId: merma.dispositivo_id,
	});
	return { movimiento_id: movimiento.movimientoId };
}

/**
 * La reversión de la merma de un registro que se cancela: de Fuera al Taller.
 * @returns La reversión.
 * @throws Error si el registro no tiene merma, o ya se revirtió: es un error del programa.
 */
export async function revertirMermaProduccion(contexto: ContextoDeAccion, datos: unknown) {
	const { registro_operacion_id } = z.object({ registro_operacion_id: z.uuid() }).parse(datos);
	const [suya] = await contexto.transaccion
		.select({ id: movimientos.id })
		.from(movimientos)
		.where(
			and(
				eq(movimientos.tipo, "merma_produccion"),
				eq(movimientos.documentoTipo, "registro_operacion"),
				eq(movimientos.documentoId, registro_operacion_id),
			),
		);
	if (suya === undefined) throw new Error(`el registro ${registro_operacion_id} no tiene merma`);
	const reversion = await revertirMovimiento(contexto, {
		movimientoId: suya.id,
		clave: claveDe(registro_operacion_id, "reversion"),
	});
	return { movimiento_id: reversion.movimientoId };
}
