/**
 * Las lecturas de las existencias que usan otros módulos: el material de una ubicación y las piezas de una
 * variante.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («Lecturas»)
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { bloquearExistencias, candadoDeVariantes } from "../dominio/candados.ts";
import { existencias, existenciasMaterial, reservas, ubicaciones } from "../tablas.ts";

/** Lo que recibe `inventario.existencia_material`. */
const pedidoDeMaterial = z.object({ material_id: z.uuid(), ubicacion_id: z.uuid().optional() });

/**
 * `inventario.existencia_material`: cuánto hay de un material en una ubicación, o en todas si no viene.
 * @param contexto El contexto de la acción.
 * @param datos `material_id` y, si se pide una, `ubicacion_id`.
 * @returns La cantidad en su unidad de inventario, como texto decimal (`"12.500"`): todos sus rollos juntos; y,
 * por ubicación, la que no es cero, con su nombre (para decir dónde hay).
 */
export async function existenciaMaterial(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ cantidad: string; por_ubicacion: { ubicacion_id: string; ubicacion: string; cantidad: string }[] }> {
	const { material_id, ubicacion_id } = pedidoDeMaterial.parse(datos);
	const porUbicacion = await contexto.transaccion
		.select({
			ubicacion_id: existenciasMaterial.ubicacionId,
			ubicacion: ubicaciones.nombre,
			cantidad: sql<string>`sum(${existenciasMaterial.cantidad})::numeric(12, 3)::text`,
		})
		.from(existenciasMaterial)
		.innerJoin(ubicaciones, eq(ubicaciones.id, existenciasMaterial.ubicacionId))
		.where(
			and(
				eq(existenciasMaterial.materialId, material_id),
				ubicacion_id === undefined ? undefined : eq(existenciasMaterial.ubicacionId, ubicacion_id),
			),
		)
		.groupBy(existenciasMaterial.ubicacionId, ubicaciones.nombre, ubicaciones.codigo)
		.having(sql`sum(${existenciasMaterial.cantidad}) <> 0`)
		.orderBy(ubicaciones.codigo);
	// La suma se hace en la base, en `numeric`: nunca pasa por un número con decimales.
	const [suma] = await contexto.transaccion
		.select({ cantidad: sql<string>`coalesce(sum(${existenciasMaterial.cantidad}), 0)::numeric(12, 3)::text` })
		.from(existenciasMaterial)
		.where(
			and(
				eq(existenciasMaterial.materialId, material_id),
				ubicacion_id === undefined ? undefined : eq(existenciasMaterial.ubicacionId, ubicacion_id),
			),
		);
	return { cantidad: suma?.cantidad ?? "0.000", por_ubicacion: porUbicacion };
}

/** Lo que recibe `inventario.piezas_de_variante`. */
const pedidoDeVariante = z.object({ variante_id: z.uuid(), bloquear: z.boolean().optional() });

/**
 * `inventario.piezas_de_variante`: dónde hay piezas de una variante. Con `bloquear`, antes de leer toma el
 * candado de la variante y sus existencias en el orden fijo: ningún movimiento se cruza con lo que decide
 * quien la llama (la baja de una talla).
 * @param contexto El contexto de la acción.
 * @param datos `variante_id` y `bloquear`.
 * @returns Por ubicación, la existencia que no es cero (también negativa, en Tránsito o En camino a aduana), y
 * las reservas activas con sus piezas y su documento. El folio del documento lo pone quien lo muestra, con la
 * fase de su módulo.
 */
export async function piezasDeVariante(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	existencias: { ubicacion_id: string; ubicacion: string; piezas: number }[];
	reservas: { reserva_id: string; ubicacion_id: string; piezas: number; motivo: string; documento_id: string | null }[];
}> {
	const { variante_id, bloquear } = pedidoDeVariante.parse(datos);
	const { transaccion } = contexto;
	if (bloquear === true) {
		await candadoDeVariantes(transaccion, [variante_id]);
		const suyas = await transaccion
			.select({ ubicacionId: existencias.ubicacionId })
			.from(existencias)
			.where(eq(existencias.varianteId, variante_id));
		await bloquearExistencias(
			transaccion,
			suyas.map(({ ubicacionId }) => ({ ubicacionId, varianteId: variante_id })),
		);
	}
	const hay = await transaccion
		.select({ ubicacion_id: existencias.ubicacionId, ubicacion: ubicaciones.nombre, piezas: existencias.piezas })
		.from(existencias)
		.innerJoin(ubicaciones, eq(ubicaciones.id, existencias.ubicacionId))
		.where(and(eq(existencias.varianteId, variante_id), ne(existencias.piezas, 0)))
		.orderBy(ubicaciones.orden);
	const apartadas = await transaccion
		.select({
			reserva_id: reservas.id,
			ubicacion_id: reservas.ubicacionId,
			piezas: reservas.piezas,
			motivo: reservas.motivo,
			documento_id: sql<
				string | null
			>`coalesce(${reservas.pedidoId}, ${reservas.notaEntregaId}, ${reservas.pedidoLineaId}, ${reservas.apartadoTiendaId}, ${reservas.pedidoEspecialTiendaId})`,
		})
		.from(reservas)
		.where(and(eq(reservas.varianteId, variante_id), eq(reservas.estado, "activa")))
		.orderBy(reservas.creadoEn);
	return { existencias: hay, reservas: apartadas };
}
