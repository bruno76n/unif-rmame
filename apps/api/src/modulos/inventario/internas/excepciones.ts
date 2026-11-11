/**
 * Las internas de las excepciones: abrir una y marcarla resuelta.
 * Fase 9 · docs/modulos/inventario/excepciones.md («Acciones internas»)
 *
 * Quien abre una excepción ya aplicó lo que llegó: la excepción no deshace nada. Va a la bandeja de Bodega o,
 * si es de dinero, a la de Contaduría.
 */

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { excepciones, tiposDeDocumentoDeMovimiento, tiposDeExcepcion } from "../tablas.ts";

/** Los tipos de dinero: van a la bandeja de Contaduría. */
const tiposDeDinero: readonly string[] = [
	"totales_no_cuadran",
	"pago_de_pedido_cancelado",
	"anticipo_mayor_total",
	"corte_no_coincide",
	"corte_repetido",
];

/** Lo que recibe `inventario.registrar_excepcion`. */
const pedidoDeExcepcion = z
	.object({
		tipo: z.string().min(1),
		descripcion: z.string().min(1),
		area: z.enum(["bodega", "contaduria"]).optional(),
		ubicacion_id: z.uuid().optional(),
		variante_id: z.uuid().optional(),
		documento_tipo: z.enum(tiposDeDocumentoDeMovimiento).optional(),
		documento_id: z.uuid().optional(),
		documento_folio: z.string().optional(),
		comando_id: z.uuid().optional(),
		dispositivo_id: z.uuid().optional(),
		persona_id: z.uuid().optional(),
		cuadre_id: z.uuid().optional(),
		datos: z.unknown().optional(),
	})
	.strict();

/**
 * `inventario.registrar_excepcion`: abre una excepción `por_revisar`, en su bandeja.
 * @param contexto El contexto de quien aplicó lo que no cuadra (la subida, el cuadre, una acción).
 * @param datos El tipo, qué pasó y, si los hay, el lugar, la variante, el documento, el comando, el aparato, la
 * persona, el cuadre y lo que llegó. Sin comando, el de la acción que la abre.
 * @returns El id de la excepción, que la subida guarda en el comando.
 * @throws Error (un `500`, `tipo_desconocido`) si el tipo no es uno de los del código.
 */
export async function registrarExcepcion(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ excepcion_id: string }> {
	const pedido = pedidoDeExcepcion.parse(datos);
	const tipo = tiposDeExcepcion.find((conocido) => conocido === pedido.tipo);
	if (tipo === undefined) throw new Error(`tipo_desconocido: ${pedido.tipo}`);
	const id = uuidv7();
	const { quien } = contexto;
	const area = pedido.area ?? (tiposDeDinero.includes(tipo) ? "contaduria" : "bodega");
	await contexto.transaccion.insert(excepciones).values({
		id,
		tipo,
		area,
		estado: "por_revisar",
		descripcion: pedido.descripcion,
		ubicacionId: pedido.ubicacion_id ?? null,
		varianteId: pedido.variante_id ?? null,
		documentoTipo: pedido.documento_tipo ?? null,
		documentoId: pedido.documento_id ?? null,
		documentoFolio: pedido.documento_folio ?? null,
		comandoId: pedido.comando_id ?? contexto.comandoId ?? null,
		dispositivoId: pedido.dispositivo_id ?? (quien.tipo === "aparato" ? quien.dispositivoId : null),
		personaId: pedido.persona_id ?? (quien.tipo === "aparato" ? (quien.personaId ?? null) : null),
		cuadreId: pedido.cuadre_id ?? null,
		datos: pedido.datos ?? null,
		detectadaEn: contexto.ahora.toString(),
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
	});
	contexto.guardarEvento({
		tipo: "excepcion.creada",
		datos: { excepcion_id: id, tipo, area },
		tablas: ["excepciones"],
		entidad: "excepciones",
		entidadId: id,
	});
	return { excepcion_id: id };
}

/** Lo que recibe `inventario.tomar_version_excepcion`. */
const pedidoDeVersion = z.object({ excepcion_id: z.uuid(), version: z.number().int().optional() }).strict();

/**
 * `inventario.tomar_version_excepcion`: revisa y toma la versión que se leyó de una excepción, para la acción de
 * otro módulo que la decide (la dueña que aplica un movimiento retenido). La excepción es de `inventario`: solo él
 * la escribe.
 * @param contexto El contexto de la acción.
 * @param datos La excepción y la versión que se leyó.
 * @throws `409` si cambió desde que se leyó.
 */
export async function tomarVersionExcepcion(contexto: ContextoDeAccion, datos: unknown): Promise<void> {
	const { excepcion_id, version } = pedidoDeVersion.parse(datos);
	await tomarVersion(contexto, excepciones, excepcion_id, version, async () => {
		const [suya] = await contexto.transaccion
			.select({ id: excepciones.id, estado: excepciones.estado, resolucion: excepciones.resolucion })
			.from(excepciones)
			.where(eq(excepciones.id, excepcion_id));
		return suya;
	});
}

/** Lo que recibe `inventario.marcar_excepcion_resuelta`. */
const pedidoDeMarcar = z
	.object({ excepcion_id: z.uuid(), resolucion: z.string().min(1), resuelta_por: z.uuid().nullable() })
	.strict();

/**
 * `inventario.marcar_excepcion_resuelta`: resuelve una excepción desde otra acción (la dueña aplicó el movimiento
 * retenido). Si ya estaba resuelta, no hace nada y no falla. No mueve inventario.
 * @param contexto El contexto de la acción que la resuelve.
 * @param datos La excepción, la resolución ya armada y quién.
 * @returns Si la resolvió ahora.
 */
export async function marcarExcepcionResuelta(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ resuelta: boolean }> {
	const pedido = pedidoDeMarcar.parse(datos);
	const cambiadas = await contexto.transaccion
		.update(excepciones)
		.set({
			estado: "resuelta",
			resueltaEn: contexto.ahora.toString(),
			resueltaPor: pedido.resuelta_por,
			resolucion: pedido.resolucion,
		})
		.where(and(eq(excepciones.id, pedido.excepcion_id), eq(excepciones.estado, "por_revisar")))
		.returning({ id: excepciones.id });
	if (cambiadas.length === 0) return { resuelta: false };
	contexto.guardarEvento({
		tipo: "excepcion.resuelta",
		datos: { excepcion_id: pedido.excepcion_id },
		tablas: ["excepciones"],
		entidad: "excepciones",
		entidadId: pedido.excepcion_id,
	});
	return { resuelta: true };
}
