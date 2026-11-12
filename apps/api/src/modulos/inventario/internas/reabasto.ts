/**
 * Las internas del reabasto: `inventario.guardar_minimo` (la llama `admin.cambiar_minimo`) e
 * `inventario.decidir_sugerencia` (la llama `produccion.levantar_orden_sugerencia`).
 * Fase 14 · docs/modulos/inventario/minimos-y-reabasto.md («Acciones internas»)
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { revisarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ordenesProduccion } from "../../produccion/tablas.ts";
import { minimos, nivelesDeMinimo, sugerenciasReabasto, ubicaciones } from "../tablas.ts";

/** Lo que recibe `inventario.guardar_minimo`. */
const pedidoDeMinimo = z
	.object({
		ubicacion_id: z.uuid(),
		nivel: z.enum(nivelesDeMinimo),
		piezas: z.number().int().positive(),
		version: z.number().int().optional(),
	})
	.strict();

/**
 * `inventario.guardar_minimo`: da de baja el mínimo vigente y crea el nuevo; con la misma cantidad no escribe nada.
 * Revisa la versión del vigente: dos cambios a la vez no se pisan.
 * @param contexto El contexto de `admin.cambiar_minimo`.
 * @param datos La ubicación, el nivel, las piezas y la versión del vigente.
 * @returns El mínimo vigente, sus piezas y su ubicación, y si cambió.
 * @throws `422 ubicacion_sin_minimo` fuera de Bodega y las tiendas.
 */
export async function guardarMinimo(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeMinimo.parse(datos);
	const { transaccion } = contexto;
	const [ubicacion] = await transaccion
		.select({ nombre: ubicaciones.nombre, tipo: ubicaciones.tipo })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, pedido.ubicacion_id));
	const [vigente] = await transaccion
		.select()
		.from(minimos)
		.where(and(eq(minimos.ubicacionId, pedido.ubicacion_id), eq(minimos.nivel, pedido.nivel), isNull(minimos.bajaEn)));
	if (
		ubicacion === undefined ||
		(ubicacion.tipo !== "bodega" && ubicacion.tipo !== "tienda") ||
		vigente === undefined
	) {
		throw errorDeRegla("ubicacion_sin_minimo", `${ubicacion?.nombre ?? "Esa ubicación"} no lleva mínimo.`);
	}
	await revisarVersion(contexto, minimos, vigente.id, pedido.version, async () => ({
		minimo_id: vigente.id,
		piezas: vigente.piezas,
	}));
	const base = { ubicacion: ubicacion.nombre, antes: vigente.piezas };
	if (vigente.piezas === pedido.piezas)
		return { ...base, minimo_id: vigente.id, piezas: vigente.piezas, cambio: false };
	const quien = quienCambia(contexto);
	await transaccion
		.update(minimos)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quien })
		.where(eq(minimos.id, vigente.id));
	const nuevoId = uuidv7();
	await transaccion.insert(minimos).values({
		id: nuevoId,
		ubicacionId: pedido.ubicacion_id,
		nivel: pedido.nivel,
		piezas: pedido.piezas,
		creadoPor: quien,
	});
	contexto.guardarEvento({
		tipo: "minimo.cambiado",
		datos: { minimo_id: nuevoId, ubicacion_id: pedido.ubicacion_id, nivel: pedido.nivel },
		tablas: ["minimos"],
		entidad: "minimos",
		entidadId: nuevoId,
	});
	return { ...base, minimo_id: nuevoId, piezas: pedido.piezas, cambio: true };
}

/** Lo que recibe `inventario.decidir_sugerencia`. */
const pedidoDeDecision = z
	.object({ sugerencia_ids: z.array(z.uuid()).min(1), orden_produccion_id: z.uuid(), lote_id: z.uuid() })
	.strict();

/**
 * `inventario.decidir_sugerencia`: deja levantadas las sugerencias con su orden y su lote. Las toma en orden de id:
 * dos «Levantar orden» de la misma sugerencia van una tras otra, y la segunda ve que ya se levantó.
 * @param contexto El contexto de `produccion.levantar_orden_sugerencia`.
 * @param datos Las sugerencias, la orden y el lote.
 * @throws `422 sugerencia_ya_decidida`: «Esa sugerencia ya se levantó: {OP}.».
 */
export async function decidirSugerencia(contexto: ContextoDeAccion, datos: unknown): Promise<{ levantadas: number }> {
	const pedido = pedidoDeDecision.parse(datos);
	const { transaccion } = contexto;
	const suyas = await transaccion
		.select({ id: sugerenciasReabasto.id, estado: sugerenciasReabasto.estado, orden: ordenesProduccion.folio })
		.from(sugerenciasReabasto)
		.leftJoin(ordenesProduccion, eq(ordenesProduccion.id, sugerenciasReabasto.ordenProduccionId))
		.where(inArray(sugerenciasReabasto.id, pedido.sugerencia_ids))
		.orderBy(asc(sugerenciasReabasto.id))
		.for("update", { of: sugerenciasReabasto });
	const levantada = suyas.find((suya) => suya.estado !== "por_decidir");
	if (levantada !== undefined || suyas.length !== new Set(pedido.sugerencia_ids).size) {
		throw errorDeRegla("sugerencia_ya_decidida", `Esa sugerencia ya se levantó: ${levantada?.orden ?? "otra orden"}.`);
	}
	await transaccion
		.update(sugerenciasReabasto)
		.set({
			estado: "levantada",
			ordenProduccionId: pedido.orden_produccion_id,
			loteId: pedido.lote_id,
			decididaEn: contexto.ahora.toString(),
			decididaPor: quienCambia(contexto),
		})
		.where(inArray(sugerenciasReabasto.id, pedido.sugerencia_ids));
	for (const suya of suyas) {
		contexto.guardarEvento({
			tipo: "sugerencia.levantada",
			datos: { sugerencia_id: suya.id, orden_produccion_id: pedido.orden_produccion_id },
			tablas: ["sugerencias_reabasto"],
			entidad: "sugerencias_reabasto",
			entidadId: suya.id,
		});
	}
	return { levantadas: suyas.length };
}
