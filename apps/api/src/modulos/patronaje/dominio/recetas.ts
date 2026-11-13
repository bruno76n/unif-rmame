/**
 * Lo que comparten la acción y las internas de la receta: la prenda con sus tallas, la receta con su candado, el
 * contenido de una versión (leerlo, escribirlo y compararlo).
 * Fase 10 · docs/modulos/patronaje/recetas.md (reglas, tablas)
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import { escuelas, productos, secciones, tallas, variantes } from "../../catalogo/tablas.ts";
import { recetaLineas, recetaLineaTallas, recetaMedidas, recetas, recetaVersiones } from "../tablas.ts";

/** Una talla de la prenda: su nombre y si es de pedido especial (opcional en la receta). */
export interface TallaDeLaPrenda {
	id: string;
	nombre: string;
	esPedidoEspecial: boolean;
}

/** La prenda de una receta: su nombre, su escuela, si su sección lleva receta y sus tallas en orden. */
export interface Prenda {
	id: string;
	nombre: string;
	escuela: string | null;
	seccion: string;
	llevaReceta: boolean;
	tallas: TallaDeLaPrenda[];
}

/** Un material de una versión. */
export interface LineaDeVersion {
	papel: string;
	materialId: string;
	modo: string;
	unidadReceta: string;
	/** Con tres decimales, si va igual en todas las tallas. */
	cantidad: string | null;
	recetaPorUnidadInventario: string;
	orden: number;
	/** Por talla, con tres decimales, si cambia por talla. */
	tallas: { tallaId: string; cantidad: string }[];
}

/** Una medida de una versión, con su valor por talla. */
export interface MedidaDeVersion {
	medida: string;
	orden: number;
	valores: { tallaId: string; valorCm: string }[];
}

/** Lo que guarda una versión. */
export interface ContenidoDeVersion {
	lineas: LineaDeVersion[];
	medidas: MedidaDeVersion[];
}

/** Una receta como se guarda. */
export type Receta = typeof recetas.$inferSelect;

/**
 * Lee la prenda con sus tallas vivas (sin las dadas de baja), en el orden de las tallas.
 * @throws `404` si no existe.
 */
export async function leerPrenda(transaccion: Transaccion, productoId: string): Promise<Prenda> {
	const [producto] = await transaccion
		.select({
			id: productos.id,
			nombre: productos.nombre,
			escuela: escuelas.nombre,
			seccion: secciones.nombre,
			llevaReceta: secciones.llevaReceta,
			esServicio: productos.esServicio,
		})
		.from(productos)
		.innerJoin(secciones, eq(secciones.id, productos.seccionId))
		.leftJoin(escuelas, eq(escuelas.id, productos.escuelaId))
		.where(eq(productos.id, productoId));
	if (producto === undefined) throw noExiste();
	const suyas = await transaccion
		.select({ id: tallas.id, nombre: tallas.nombre, esPedidoEspecial: variantes.esPedidoEspecial })
		.from(variantes)
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(and(eq(variantes.productoId, productoId), isNull(variantes.bajaEn)))
		.orderBy(ordenDeTallas("tallas"));
	return {
		id: producto.id,
		nombre: producto.nombre,
		escuela: producto.escuela,
		seccion: producto.seccion,
		llevaReceta: producto.llevaReceta && !producto.esServicio,
		tallas: suyas,
	};
}

/**
 * Lee la receta de una prenda y la bloquea.
 * @returns La receta, o nada si la prenda no lleva.
 */
export async function bloquearReceta(transaccion: Transaccion, productoId: string): Promise<Receta | undefined> {
	const [receta] = await transaccion.select().from(recetas).where(eq(recetas.productoId, productoId)).for("update");
	return receta;
}

/**
 * Lee lo que guarda una versión, en orden.
 * @param transaccion La transacción.
 * @param versionId La versión.
 */
export async function contenidoDeVersion(transaccion: Transaccion, versionId: string): Promise<ContenidoDeVersion> {
	const lineas = await transaccion
		.select()
		.from(recetaLineas)
		.where(eq(recetaLineas.recetaVersionId, versionId))
		.orderBy(asc(recetaLineas.papel), asc(recetaLineas.orden));
	const porTalla =
		lineas.length === 0
			? []
			: await transaccion
					.select()
					.from(recetaLineaTallas)
					.where(
						inArray(
							recetaLineaTallas.recetaLineaId,
							lineas.map((linea) => linea.id),
						),
					);
	const medidas = await transaccion
		.select()
		.from(recetaMedidas)
		.where(eq(recetaMedidas.recetaVersionId, versionId))
		.orderBy(asc(recetaMedidas.orden));
	const porNombre = new Map<string, MedidaDeVersion>();
	for (const renglon of medidas) {
		const medida = porNombre.get(renglon.medida) ?? { medida: renglon.medida, orden: renglon.orden, valores: [] };
		medida.valores.push({ tallaId: renglon.tallaId, valorCm: renglon.valorCm });
		porNombre.set(renglon.medida, medida);
	}
	return {
		lineas: lineas.map((linea) => ({
			papel: linea.papel,
			materialId: linea.materialId,
			modo: linea.modo,
			unidadReceta: linea.unidadReceta,
			cantidad: linea.cantidad,
			recetaPorUnidadInventario: linea.recetaPorUnidadInventario,
			orden: linea.orden,
			tallas: porTalla
				.filter((talla) => talla.recetaLineaId === linea.id)
				.map((talla) => ({ tallaId: talla.tallaId, cantidad: talla.cantidad })),
		})),
		medidas: [...porNombre.values()],
	};
}

/**
 * Escribe una versión con su contenido y la deja vigente.
 * @param contexto El contexto de la acción.
 * @param receta La receta.
 * @param version Su número, su motivo y, si se copió, la versión del base.
 * @param contenido Sus materiales y sus medidas.
 * @param estado El estado en que queda la receta.
 * @returns El id de la versión.
 */
export async function escribirVersion(
	contexto: ContextoDeAccion,
	receta: Receta,
	version: { numero: number; motivo: string; copiadaDeVersionId?: string },
	contenido: ContenidoDeVersion,
	estado: "sin_verificar" | "verificada",
): Promise<string> {
	const { transaccion } = contexto;
	const quien = quienCambia(contexto);
	const versionId = uuidv7();
	await transaccion.insert(recetaVersiones).values({
		id: versionId,
		recetaId: receta.id,
		numero: version.numero,
		motivo: version.motivo,
		copiadaDeVersionId: version.copiadaDeVersionId ?? null,
		creadoPor: quien,
	});
	for (const linea of contenido.lineas) {
		const lineaId = uuidv7();
		await transaccion.insert(recetaLineas).values({
			id: lineaId,
			recetaVersionId: versionId,
			papel: linea.papel,
			materialId: linea.materialId,
			modo: linea.modo,
			unidadReceta: linea.unidadReceta,
			cantidad: linea.cantidad,
			recetaPorUnidadInventario: linea.recetaPorUnidadInventario,
			orden: linea.orden,
			creadoPor: quien,
		});
		if (linea.tallas.length > 0) {
			await transaccion.insert(recetaLineaTallas).values(
				linea.tallas.map((talla) => ({
					id: uuidv7(),
					recetaLineaId: lineaId,
					tallaId: talla.tallaId,
					cantidad: talla.cantidad,
					creadoPor: quien,
				})),
			);
		}
	}
	const medidas = contenido.medidas.flatMap((medida) =>
		medida.valores.map((valor) => ({
			id: uuidv7(),
			recetaVersionId: versionId,
			medida: medida.medida,
			orden: medida.orden,
			tallaId: valor.tallaId,
			valorCm: valor.valorCm,
			creadoPor: quien,
		})),
	);
	if (medidas.length > 0) await transaccion.insert(recetaMedidas).values(medidas);
	await transaccion
		.update(recetas)
		.set({
			versionVigenteId: versionId,
			estado,
			...(estado === "verificada" ? {} : { verificadaEn: null, verificadaLoteId: null }),
		})
		.where(eq(recetas.id, receta.id));
	return versionId;
}

/**
 * Los materiales de una versión sin su orden, en un orden fijo: lo que decide si cambió la tela o los avíos.
 * @param lineas Los materiales.
 */
export function materialesComparables(lineas: readonly LineaDeVersion[]): string {
	return JSON.stringify(
		[...lineas]
			.map((linea) => ({
				papel: linea.papel,
				materialId: linea.materialId,
				modo: linea.modo,
				unidadReceta: linea.unidadReceta,
				cantidad: linea.cantidad,
				recetaPorUnidadInventario: linea.recetaPorUnidadInventario,
				tallas: [...linea.tallas].sort((una, otra) => una.tallaId.localeCompare(otra.tallaId)),
			}))
			.sort((una, otra) => una.materialId.localeCompare(otra.materialId)),
	);
}

/**
 * Todo el contenido de una versión, en un orden fijo: lo que decide si hay cambios.
 * @param contenido Los materiales y las medidas.
 */
export function contenidoComparable(contenido: ContenidoDeVersion): string {
	return JSON.stringify({
		materiales: materialesComparables(contenido.lineas),
		ordenes: [...contenido.lineas].map((linea) => `${linea.materialId}:${linea.orden}`).sort(),
		medidas: [...contenido.medidas]
			.map((medida) => ({
				medida: medida.medida,
				orden: medida.orden,
				valores: [...medida.valores].sort((uno, otro) => uno.tallaId.localeCompare(otro.tallaId)),
			}))
			.sort((una, otra) => una.medida.localeCompare(otra.medida)),
	});
}

/**
 * Guarda un evento de la receta: «hay cambios» para Compras, Bodega y Producción.
 * @param contexto El contexto de la acción.
 * @param tipo `receta.guardada` o `receta.verificada`.
 * @param receta La receta.
 * @param version El número de la versión, si nació una.
 */
export function guardarEventoDeReceta(
	contexto: ContextoDeAccion,
	tipo: "receta.guardada" | "receta.verificada",
	receta: Pick<Receta, "id" | "productoId">,
	version?: number,
): void {
	contexto.guardarEvento({
		tipo,
		datos: { receta_id: receta.id, producto_id: receta.productoId, ...(version === undefined ? {} : { version }) },
		tablas: ["recetas", "receta_versiones", "receta_lineas", "receta_linea_tallas", "receta_medidas"],
		entidad: "recetas",
		entidadId: receta.id,
	});
}
