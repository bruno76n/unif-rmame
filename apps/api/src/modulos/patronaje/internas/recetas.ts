/**
 * `patronaje.iniciar_receta` y `patronaje.verificar_receta`: la receta nace con el producto, y el primer corte la
 * verifica.
 * Fase 10 · docs/modulos/patronaje/recetas.md (reglas 1, 8 y 9, «Acciones internas»)
 *
 * La copia del base trae su versión vigente como versión 1, solo con las tallas del producto nuevo y con las
 * medidas del alta en lugar de las copiadas. `verificar_receta` la llama el cierre del corte (fase 12).
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	bloquearReceta,
	type ContenidoDeVersion,
	contenidoDeVersion,
	escribirVersion,
	guardarEventoDeReceta,
	leerPrenda,
	type MedidaDeVersion,
} from "../dominio/recetas.ts";
import { recetas, recetaVersiones } from "../tablas.ts";

/** Lo que recibe `patronaje.iniciar_receta`. */
const pedidoDeIniciar = z
	.object({
		producto_id: z.uuid(),
		producto_base_id: z.uuid().optional(),
		medidas: z
			.array(
				z.object({
					medida: z.string().trim().min(3),
					orden: z.number().int().nonnegative(),
					valores: z.array(z.object({ talla_id: z.uuid(), valor_cm: z.number().positive().nullable() })),
				}),
			)
			.optional(),
	})
	.strict();

/** Lo que recibe `patronaje.verificar_receta`. */
const pedidoDeVerificar = z.object({ producto_id: z.uuid(), lote_id: z.uuid() }).strict();

/** El aviso del alta cuando las medidas no tienen dónde guardarse. */
const medidasDescartadas = "Las medidas se capturan con la receta en Patronaje";

/**
 * Las medidas del alta, como se guardan: solo las tallas del producto y los valores que vienen.
 * @param medidas Las del alta.
 * @param suyas Las tallas del producto.
 */
function medidasDelAlta(
	medidas: z.output<typeof pedidoDeIniciar>["medidas"],
	suyas: ReadonlySet<string>,
): MedidaDeVersion[] {
	return (medidas ?? []).map((medida) => ({
		medida: medida.medida,
		orden: medida.orden,
		valores: medida.valores.flatMap((valor) =>
			valor.valor_cm === null || !suyas.has(valor.talla_id)
				? []
				: [{ tallaId: valor.talla_id, valorCm: valor.valor_cm.toFixed(3) }],
		),
	}));
}

/**
 * La versión vigente del base, copiada para el producto nuevo: sus materiales solo con las tallas del producto, y
 * las medidas del alta si vienen.
 * @returns El contenido y la versión de la que sale, o nada si el base no tiene receta.
 */
async function copiaDelBase(
	contexto: ContextoDeAccion,
	baseId: string,
	suyas: ReadonlySet<string>,
	medidas: z.output<typeof pedidoDeIniciar>["medidas"],
): Promise<{ contenido: ContenidoDeVersion; motivo: string; versionId: string } | undefined> {
	const { transaccion } = contexto;
	const [deLaBase] = await transaccion
		.select({ versionId: recetas.versionVigenteId, numero: recetaVersiones.numero })
		.from(recetas)
		.innerJoin(recetaVersiones, eq(recetaVersiones.id, recetas.versionVigenteId))
		.where(eq(recetas.productoId, baseId));
	if (deLaBase?.versionId === null || deLaBase === undefined) return undefined;
	const copiada = await contenidoDeVersion(transaccion, deLaBase.versionId);
	const base = await leerPrenda(transaccion, baseId);
	const delAlta = medidasDelAlta(medidas, suyas);
	return {
		contenido: {
			lineas: copiada.lineas.map((linea) => ({
				...linea,
				tallas: linea.tallas.filter((talla) => suyas.has(talla.tallaId)),
			})),
			medidas:
				delAlta.length > 0
					? delAlta
					: copiada.medidas.map((medida) => ({
							...medida,
							valores: medida.valores.filter((valor) => suyas.has(valor.tallaId)),
						})),
		},
		motivo: `Copiada de ${base.nombre}${base.escuela === null ? "" : ` · ${base.escuela}`}, versión ${deLaBase.numero}`,
		versionId: deLaBase.versionId,
	};
}

/**
 * `patronaje.iniciar_receta`: la receta del producto nuevo, en `sin_receta`; a partir de otro producto con receta,
 * su versión vigente copiada como versión 1, `sin_verificar`.
 * @param contexto El contexto del alta del producto.
 * @param datos El producto, el base y las medidas del alta.
 * @returns La receta, su estado y el aviso si las medidas no tuvieron dónde guardarse.
 */
export async function iniciarReceta(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ receta_id: string; estado: string; avisos: string[] }> {
	const pedido = pedidoDeIniciar.parse(datos);
	const { transaccion } = contexto;
	await transaccion.insert(recetas).values({ id: uuidv7(), productoId: pedido.producto_id }).onConflictDoNothing();
	const receta = await bloquearReceta(transaccion, pedido.producto_id);
	if (receta === undefined) throw new Error(`no nació la receta de ${pedido.producto_id}`);
	const prenda = await leerPrenda(transaccion, pedido.producto_id);
	const suyas = new Set(prenda.tallas.map((talla) => talla.id));
	const copia =
		pedido.producto_base_id === undefined
			? undefined
			: await copiaDelBase(contexto, pedido.producto_base_id, suyas, pedido.medidas);
	const hayMedidas = (pedido.medidas ?? []).length > 0;
	if (copia === undefined) {
		return { receta_id: receta.id, estado: receta.estado, avisos: hayMedidas ? [medidasDescartadas] : [] };
	}
	await escribirVersion(
		contexto,
		receta,
		{ numero: 1, motivo: copia.motivo, copiadaDeVersionId: copia.versionId },
		copia.contenido,
		"sin_verificar",
	);
	guardarEventoDeReceta(contexto, "receta.guardada", receta, 1);
	return { receta_id: receta.id, estado: "sin_verificar", avisos: [] };
}

/**
 * `patronaje.verificar_receta`: el cierre del primer corte verifica la receta.
 * @param contexto El contexto del cierre del corte.
 * @param datos El producto y el lote.
 * @returns La versión vigente, que el lote congela, y si la verificó.
 * @throws `422 sin_receta`: «Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.».
 */
export async function verificarReceta(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ receta_version_id: string; verifico: boolean }> {
	const pedido = pedidoDeVerificar.parse(datos);
	const receta = await bloquearReceta(contexto.transaccion, pedido.producto_id);
	if (receta?.versionVigenteId === null || receta === undefined) {
		throw errorDeRegla("sin_receta", "Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.");
	}
	if (receta.estado !== "sin_verificar") return { receta_version_id: receta.versionVigenteId, verifico: false };
	await contexto.transaccion
		.update(recetas)
		.set({ estado: "verificada", verificadaEn: contexto.ahora.toString(), verificadaLoteId: pedido.lote_id })
		.where(eq(recetas.id, receta.id));
	guardarEventoDeReceta(contexto, "receta.verificada", receta);
	return { receta_version_id: receta.versionVigenteId, verifico: true };
}
