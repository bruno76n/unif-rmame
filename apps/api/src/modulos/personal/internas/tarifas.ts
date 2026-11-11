/**
 * `personal.copiar_tarifas_flujo`: el flujo nuevo que parte de otro copia sus tarifas; y
 * `personal.tocar_tarifas_operacion`: la tarifa de una operación que se quita del flujo vuelve a bajar a la tablet.
 * Fase 7 · docs/modulos/personal/tarifas.md (regla 6, «`personal.copiar_tarifas_flujo`»); fase 12 · la misma, «Lo que
 * baja a la tablet»
 *
 * La llama `produccion.crear_flujo` (fase 12) en su transacción. No rechaza ni pide «ven sueldos y tarifas»:
 * la tarifa no viaja a la pantalla de quien crea el flujo, y lo que regresa no lleva montos. Una operación
 * del origen sin tarifa queda «Sin tarifa».
 */

import { and, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { tarifasOperacion } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	flujo_origen_id: z.uuid(),
	flujo_id: z.uuid(),
	/** Cómo se llaman los dos flujos, para la bitácora. */
	origen: z.string().min(1),
	flujo: z.string().min(1),
	operaciones: z.array(z.object({ origen_id: z.uuid(), nueva_id: z.uuid() })),
});

/**
 * Copia la tarifa vigente de cada operación de origen a su operación nueva, desde ahora.
 * @param contexto El contexto de quien crea el flujo.
 * @param datos Los dos flujos, sus nombres y las operaciones.
 * @returns `copiadas`: cuántas.
 */
export async function copiarTarifasFlujo(contexto: ContextoDeAccion, datos: unknown) {
	const pedida = pedido.parse(datos);
	const { transaccion, quien } = contexto;
	if (pedida.operaciones.length === 0) return { copiadas: 0 };
	const vigentes = await transaccion
		.select({ flujoOperacionId: tarifasOperacion.flujoOperacionId, tarifaCentavos: tarifasOperacion.tarifaCentavos })
		.from(tarifasOperacion)
		.where(
			and(
				inArray(
					tarifasOperacion.flujoOperacionId,
					pedida.operaciones.map((operacion) => operacion.origen_id),
				),
				isNull(tarifasOperacion.vigenteHasta),
			),
		);
	const porOrigen = new Map(vigentes.map((vigente) => [vigente.flujoOperacionId, vigente.tarifaCentavos]));
	const nuevas = pedida.operaciones.flatMap((operacion) => {
		const tarifa = porOrigen.get(operacion.origen_id);
		return tarifa === undefined
			? []
			: [
					{
						id: uuidv7(),
						flujoOperacionId: operacion.nueva_id,
						tarifaCentavos: tarifa,
						vigenteDesde: contexto.ahora.toString(),
						creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
					},
				];
	});
	const [primera] = nuevas;
	if (primera === undefined) return { copiadas: 0 };
	await transaccion.insert(tarifasOperacion).values(nuevas);
	contexto.bitacora({
		descripcion: {
			plantilla: "Copió {n} tarifas de {origen} a {flujo}",
			valores: { n: String(nuevas.length), origen: pedida.origen, flujo: pedida.flujo },
		},
		entidad: "tarifas_operacion",
		entidadId: primera.id,
		despues: { flujo_id: pedida.flujo_id, tarifa_centavos: nuevas.map((nueva) => nueva.tarifaCentavos) },
	});
	contexto.guardarEvento({
		tipo: "tarifa.puesta",
		datos: { flujo_id: pedida.flujo_id },
		tablas: ["tarifas_operacion"],
	});
	return { copiadas: nuevas.length };
}

/**
 * `personal.tocar_tarifas_operacion`: toca las tarifas vigentes de unas operaciones del flujo para que la tablet las
 * vuelva a ver: su filtro depende de que la operación siga en el flujo, que vive en otra tabla (ver
 * docs/cimientos/SINCRONIZACION.md, «Filtros que cambian sin tocar el renglón»). La llama
 * `produccion.quitar_operacion_flujo`.
 * @param datos `flujo_operacion_ids`.
 */
export async function tocarTarifasOperacion(contexto: ContextoDeAccion, datos: unknown): Promise<void> {
	const { flujo_operacion_ids } = z.object({ flujo_operacion_ids: z.array(z.uuid()) }).parse(datos);
	if (flujo_operacion_ids.length === 0) return;
	await contexto.transaccion
		.update(tarifasOperacion)
		.set({ actualizadoEn: sql`now()` })
		.where(and(inArray(tarifasOperacion.flujoOperacionId, flujo_operacion_ids), isNull(tarifasOperacion.vigenteHasta)));
}
