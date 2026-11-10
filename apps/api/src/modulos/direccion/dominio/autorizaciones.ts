/**
 * Lo que comparten las acciones de las autorizaciones: sus ligas por tipo, leerlas y quién las pide.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md
 */

import {
	type TipoDeAutorizacion,
	tiposDeAutorizacion,
} from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { autorizaciones } from "../tablas.ts";

/** Las ligas a los documentos, como llegan en los datos de las internas. */
export const ligas = z.object({
	ajuste_id: z.uuid().optional(),
	recepcion_id: z.uuid().optional(),
	orden_compra_linea_id: z.uuid().optional(),
	nota_entrega_id: z.uuid().optional(),
	nota_credito_id: z.uuid().optional(),
	factura_proveedor_id: z.uuid().optional(),
	desarrollo_id: z.uuid().optional(),
	usuario_solicitado_id: z.uuid().optional(),
});

/** Las ligas de una autorización. */
export type Ligas = z.infer<typeof ligas>;

/** El nombre de una liga. */
export type NombreDeLiga = keyof Ligas;

/** Las ligas que lleva cada tipo; la primera es su documento. */
export const ligasDelTipo: Readonly<Record<TipoDeAutorizacion, readonly NombreDeLiga[]>> = {
	ajuste_inventario: ["ajuste_id"],
	recepcion_de_mas: ["recepcion_id", "orden_compra_linea_id"],
	nota_credito: ["nota_entrega_id", "nota_credito_id"],
	pago_fuera_de_lo_normal: ["factura_proveedor_id"],
	aprobar_desarrollo: ["desarrollo_id"],
	alta_usuario: ["usuario_solicitado_id"],
};

/** Una autorización como la leen las acciones. */
export type Autorizacion = typeof autorizaciones.$inferSelect;

/** El campo de Drizzle de cada liga: `nota_entrega_id` → `notaEntregaId`. */
const campoDeLiga = {
	ajuste_id: "ajusteId",
	recepcion_id: "recepcionId",
	orden_compra_linea_id: "ordenCompraLineaId",
	nota_entrega_id: "notaEntregaId",
	nota_credito_id: "notaCreditoId",
	factura_proveedor_id: "facturaProveedorId",
	desarrollo_id: "desarrolloId",
	usuario_solicitado_id: "usuarioSolicitadoId",
} as const satisfies Record<NombreDeLiga, keyof Autorizacion>;

/**
 * La columna de una liga.
 * @param liga Su nombre.
 */
export function columnaDeLiga(liga: NombreDeLiga) {
	return autorizaciones[campoDeLiga[liga]];
}

/**
 * El tipo de una autorización leída de la base.
 * @param autorizacion La autorización.
 */
export function tipoDe(autorizacion: Autorizacion): TipoDeAutorizacion {
	return z.enum(tiposDeAutorizacion).parse(autorizacion.tipo);
}

/**
 * Las ligas de una autorización leída, con sus nombres de la base.
 * @param autorizacion La autorización.
 */
export function ligasDe(autorizacion: Autorizacion): Ligas {
	return Object.fromEntries(
		ligasDelTipo[tipoDe(autorizacion)].map((liga) => [liga, autorizacion[campoDeLiga[liga]] ?? undefined]),
	);
}

/**
 * El documento al que apunta una autorización: su primera liga.
 * @param autorizacion La autorización.
 */
export function documentoDe(autorizacion: Autorizacion): string | null {
	const [primera] = ligasDelTipo[tipoDe(autorizacion)];
	return primera === undefined ? null : (autorizacion[campoDeLiga[primera]] ?? null);
}

/**
 * Lee una autorización y la bloquea.
 * @param transaccion La transacción de la acción.
 * @param id La autorización.
 * @throws `404` si no existe.
 */
export async function leerAutorizacion(transaccion: Transaccion, id: string): Promise<Autorizacion> {
	const [autorizacion] = await transaccion.select().from(autorizaciones).where(eq(autorizaciones.id, id)).for("update");
	if (autorizacion === undefined) throw noExiste();
	return autorizacion;
}
