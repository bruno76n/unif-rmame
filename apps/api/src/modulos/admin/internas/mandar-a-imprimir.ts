/**
 * `admin.mandar_a_imprimir`: pide un trabajo de impresión a la impresora de una ubicación (o a una).
 * Fase 4 · docs/modulos/admin/impresion.md («`admin.mandar_a_imprimir` · interna»)
 *
 * Si la impresora no tiene puente o su puente no da señales, responde `impresora_sin_puente` y la acción
 * que pidió imprimir ofrece el PDF. Si sí, escribe el trabajo en `por_imprimir` y guarda
 * `impresion.pedida`, que le llega en vivo al puente como `impresion`.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { puenteConectado } from "../dominio/impresion.ts";
import { impresoras, trabajosImpresion } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z
	.object({
		impresora_id: z.uuid().optional(),
		ubicacion_id: z.uuid().optional(),
		tipo: z.string().min(1),
		ids: z.array(z.uuid()).min(1),
		copias: z.number().int().positive(),
	})
	.refine((datos) => datos.impresora_id !== undefined || datos.ubicacion_id !== undefined);

/**
 * Pide el trabajo.
 * @param contexto El contexto de la acción de imprimir.
 * @param datos La impresora o la ubicación, el tipo de etiqueta, lo que se imprime y las copias.
 * @returns `trabajo_id`.
 * @throws `422 impresora_sin_puente`; `400` en `copias` si pasan del máximo.
 */
export async function mandarAImprimir(contexto: ContextoDeAccion, datos: unknown): Promise<{ trabajo_id: string }> {
	const trabajo = pedido.parse(datos);
	const { transaccion } = contexto;
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "admin.copias_max_impresion" }));
	if (trabajo.copias > maximo) throw errorDeCampo("copias", `Escribe de 1 a ${maximo} copias.`);
	const [impresora] = await transaccion
		.select({ id: impresoras.id, dispositivoId: impresoras.dispositivoId, ubicacion: ubicaciones.nombre })
		.from(impresoras)
		.innerJoin(ubicaciones, eq(ubicaciones.id, impresoras.ubicacionId))
		.where(
			and(
				isNull(impresoras.bajaEn),
				trabajo.impresora_id === undefined
					? eq(impresoras.ubicacionId, trabajo.ubicacion_id ?? "")
					: eq(impresoras.id, trabajo.impresora_id),
			),
		)
		.orderBy(desc(impresoras.creadoEn))
		.limit(1);
	if (impresora === undefined || !(await puenteConectado(contexto, impresora.dispositivoId))) {
		const ubicacion =
			impresora?.ubicacion ??
			(await transaccion
				.select({ nombre: ubicaciones.nombre })
				.from(ubicaciones)
				.where(eq(ubicaciones.id, trabajo.ubicacion_id ?? ""))
				.then((renglones) => renglones[0]?.nombre ?? "esa ubicación"));
		throw errorDeRegla("impresora_sin_puente", `La impresora de ${ubicacion} no está conectada. Usa el PDF.`);
	}
	const id = uuidv7();
	const { quien } = contexto;
	await transaccion.insert(trabajosImpresion).values({
		id,
		impresoraId: impresora.id,
		tipo: trabajo.tipo,
		ids: trabajo.ids,
		copias: trabajo.copias,
		estado: "por_imprimir",
		pedidoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
		sesionId: quien.tipo === "cuenta" ? quien.sesionId : null,
	});
	await contexto.interna("admin.guardar_evento", {
		tipo: "impresion.pedida",
		modulo: "admin",
		datos: { trabajo_id: id, dispositivo_id: impresora.dispositivoId },
		tablas: ["trabajos_impresion"],
		entidad: "trabajos_impresion",
		entidadId: id,
	});
	return { trabajo_id: id };
}
