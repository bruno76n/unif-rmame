/**
 * Lo que comparten las acciones y las lecturas de los precios: los vigentes, cerrar y crear, el precio de una
 * talla, las etiquetas por reimprimir y subir la versión del producto.
 * Fase 8 · docs/modulos/catalogo/precios.md (reglas 2 a 4 y 8) y variantes-codigos-y-etiquetas.md (regla 5)
 *
 * Cambiar un precio es cerrar el vigente y crear otro, en la misma transacción: el rol de la app solo puede
 * llenar el fin de un precio.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { precios, productos, variantes } from "../tablas.ts";
import { quienCambia } from "./comunes.ts";

/** Un precio vigente, como lo leen las acciones. */
export type PrecioVigente = typeof precios.$inferSelect;

/**
 * Los precios vigentes de unos productos, bloqueados para cerrarlos.
 * @param transaccion La transacción.
 * @param productoIds Los productos.
 * @param listaId Solo los de esa lista, si se da.
 */
export async function preciosVigentes(
	transaccion: Transaccion,
	productoIds: readonly string[],
	listaId?: string,
): Promise<PrecioVigente[]> {
	if (productoIds.length === 0) return [];
	return transaccion
		.select()
		.from(precios)
		.where(
			and(
				inArray(precios.productoId, [...productoIds]),
				isNull(precios.vigenteHasta),
				listaId === undefined ? undefined : eq(precios.listaId, listaId),
			),
		)
		.for("update");
}

/** De dónde viene un precio nuevo. */
export interface OrigenDelPrecio {
	origen: "ficha" | "cambio_en_bloque" | "tienda_en_linea" | "panel_uniformame";
	confirmadoConGoogleEn?: string;
	dispositivoId?: string;
	usuarioPanelId?: string;
}

/**
 * Cambia un precio: cierra el vigente (`reemplazado` si hay otro, `quitado` si no) y crea el nuevo.
 * @param contexto El contexto de la acción.
 * @param cambio El vigente (si hay), dónde va y el precio nuevo (`null`: quitarlo).
 * @param origen De dónde viene.
 */
export async function cambiarPrecio(
	contexto: ContextoDeAccion,
	cambio: {
		vigente: PrecioVigente | undefined;
		listaId: string;
		productoId: string;
		varianteId: string | null;
		precio: number | null;
	},
	origen: OrigenDelPrecio,
): Promise<void> {
	const { transaccion } = contexto;
	const ahora = contexto.ahora.toString();
	if (cambio.vigente !== undefined) {
		await transaccion
			.update(precios)
			.set({ vigenteHasta: ahora, finMotivo: cambio.precio === null ? "quitado" : "reemplazado" })
			.where(eq(precios.id, cambio.vigente.id));
	}
	if (cambio.precio === null) return;
	await transaccion.insert(precios).values({
		id: uuidv7(),
		listaId: cambio.listaId,
		productoId: cambio.productoId,
		varianteId: cambio.varianteId,
		precioCentavos: cambio.precio,
		vigenteDesde: ahora,
		origen: origen.origen,
		confirmadoConGoogleEn: origen.confirmadoConGoogleEn ?? null,
		dispositivoId: origen.dispositivoId ?? null,
		usuarioPanelId: origen.usuarioPanelId ?? null,
		creadoPor: origen.origen === "panel_uniformame" ? null : quienCambia(contexto),
	});
}

/**
 * El precio de una talla en una lista sin el recargo: el suyo o el base; en una talla de pedido especial, el
 * base (nunca tiene precio propio).
 * @param deLaLista Los precios vigentes del producto en esa lista.
 * @param variante La talla.
 */
export function precioSinRecargo(
	deLaLista: readonly Pick<PrecioVigente, "varianteId" | "precioCentavos">[],
	variante: { id: string; esPedidoEspecial: boolean },
): number | null {
	const base = deLaLista.find((precio) => precio.varianteId === null)?.precioCentavos ?? null;
	if (variante.esPedidoEspecial) return base;
	return deLaLista.find((precio) => precio.varianteId === variante.id)?.precioCentavos ?? base;
}

/**
 * Con `catalogo.etiqueta_lleva_precio`, pasa a `por_reimprimir` las tallas normales activas, ya impresas, cuyo
 * precio de Mostrador cambió.
 * @param contexto El contexto de la acción.
 * @param productoId El producto.
 * @param antes El precio de Mostrador de cada talla antes, por variante.
 * @param despues El de después.
 * @returns Cuántas etiquetas quedan por reimprimir.
 */
export async function marcarPorReimprimir(
	contexto: ContextoDeAccion,
	productoId: string,
	antes: ReadonlyMap<string, number | null>,
	despues: ReadonlyMap<string, number | null>,
): Promise<number> {
	const llevaPrecio = await contexto.lectura("admin.parametro", { clave: "catalogo.etiqueta_lleva_precio" });
	if (llevaPrecio !== true) return 0;
	const cambiaron = [...despues].filter(([id, precio]) => antes.get(id) !== precio).map(([id]) => id);
	if (cambiaron.length === 0) return 0;
	const marcadas = await contexto.transaccion
		.update(variantes)
		.set({ estadoEtiqueta: "por_reimprimir", reimprimirDesde: contexto.ahora.toString() })
		.where(
			and(
				eq(variantes.productoId, productoId),
				inArray(variantes.id, cambiaron),
				eq(variantes.estadoEtiqueta, "impresa"),
				eq(variantes.esPedidoEspecial, false),
				isNull(variantes.descontinuadaEn),
				isNull(variantes.bajaEn),
			),
		)
		.returning({ id: variantes.id });
	return marcadas.length;
}

/**
 * El precio de Mostrador de cada talla normal activa de un producto.
 * @param transaccion La transacción.
 * @param productoId El producto.
 * @param mostradorId La lista Mostrador.
 * @returns Por variante, su precio (el suyo o el base), o `null`.
 */
export async function mostradorPorTalla(
	transaccion: Transaccion,
	productoId: string,
	mostradorId: string,
): Promise<Map<string, number | null>> {
	const suyas = await transaccion
		.select({ id: variantes.id, esPedidoEspecial: variantes.esPedidoEspecial })
		.from(variantes)
		.where(and(eq(variantes.productoId, productoId), isNull(variantes.bajaEn), eq(variantes.esPedidoEspecial, false)));
	const deMostrador = await transaccion
		.select({ varianteId: precios.varianteId, precioCentavos: precios.precioCentavos })
		.from(precios)
		.where(and(eq(precios.productoId, productoId), eq(precios.listaId, mostradorId), isNull(precios.vigenteHasta)));
	return new Map(suyas.map((variante) => [variante.id, precioSinRecargo(deMostrador, variante)]));
}

/**
 * Sube la versión de un producto sin la versión que se leyó (una interna que cambia su precio): quien tenga su
 * ficha abierta recibe `409`.
 * @param transaccion La transacción.
 * @param productoId El producto.
 */
export async function subirVersionDelProducto(transaccion: Transaccion, productoId: string): Promise<void> {
	await transaccion.update(productos).set({ actualizadoEn: sql`now()` }).where(eq(productos.id, productoId));
}

/**
 * Guarda `precio.cambiado` de un producto en una lista: «hay cambios» en `precios`.
 * @param contexto El contexto de la acción.
 * @param productoId El producto.
 * @param listaId La lista.
 */
export function eventoDePrecio(contexto: ContextoDeAccion, productoId: string, listaId: string): void {
	contexto.guardarEvento({
		tipo: "precio.cambiado",
		datos: { producto_id: productoId, lista_id: listaId },
		tablas: ["precios"],
		entidad: "productos",
		entidadId: productoId,
	});
}
