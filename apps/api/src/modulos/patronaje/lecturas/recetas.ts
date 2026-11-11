/**
 * Las lecturas de la receta que usan otros módulos: si cubre unas tallas, las prendas que llevan un material, cuánto
 * material lleva un corte o un pedido, y el desperdicio de una prenda.
 * Fase 10 · docs/modulos/patronaje/recetas.md y cuenta-de-material.md («Lecturas»)
 *
 * La cuenta es la del paquete compartido (`cuentaDeMaterial`): la API nunca confía en lo que calculó la pantalla. El
 * desperdicio medido llega con los cortes (fase 12): hasta entonces, toda prenda usa el estimado.
 */

import { cuentaDeMaterial } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { productos } from "../../catalogo/tablas.ts";
import { materiales } from "../../compras/tablas.ts";
import { contenidoDeVersion } from "../dominio/recetas.ts";
import { recetaLineas, recetas } from "../tablas.ts";

/** Lo que recibe `patronaje.receta_cubre_tallas`. */
const pedidoDeCubre = z.object({ producto_id: z.uuid(), talla_ids: z.array(z.uuid()) }).strict();

/** Lo que recibe `patronaje.recetas_con_material`. */
const pedidoDeConMaterial = z.object({ material_id: z.uuid() }).strict();

/** Lo que recibe `patronaje.calcular_material`. */
const pedidoDeCalcular = z
	.object({
		producto_id: z.uuid(),
		piezas_por_talla: z.array(z.object({ talla_id: z.uuid(), piezas: z.number().int().nonnegative() })),
		receta_version_id: z.uuid().optional(),
	})
	.strict();

/** Lo que recibe `patronaje.desperdicio_prenda`. */
const pedidoDeDesperdicio = z.object({ producto_id: z.uuid().optional() }).strict();

/**
 * `patronaje.receta_cubre_tallas`: si la versión vigente tiene valor en todas esas tallas, también las de pedido
 * especial.
 * @param contexto El contexto de quien lee.
 * @param datos La prenda y las tallas.
 * @returns Si tiene receta (una versión vigente), si las cubre y cuáles le faltan (todas, si no tiene receta).
 */
export async function recetaCubreTallas(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ tiene_receta: boolean; cubre: boolean; faltan: string[] }> {
	const { producto_id, talla_ids } = pedidoDeCubre.parse(datos);
	const [receta] = await contexto.transaccion
		.select({ versionId: recetas.versionVigenteId })
		.from(recetas)
		.where(eq(recetas.productoId, producto_id));
	if (receta?.versionId === null || receta === undefined) {
		return { tiene_receta: false, cubre: talla_ids.length === 0, faltan: talla_ids };
	}
	const { lineas } = await contenidoDeVersion(contexto.transaccion, receta.versionId);
	// Un material que va igual cubre toda talla; uno por talla, solo las que tienen valor.
	const faltan = talla_ids.filter((talla) =>
		lineas.some((linea) => linea.modo === "por_talla" && !linea.tallas.some((suya) => suya.tallaId === talla)),
	);
	return { tiene_receta: true, cubre: faltan.length === 0, faltan };
}

/**
 * `patronaje.recetas_con_material`: las prendas activas cuya versión vigente lleva ese material.
 * @param contexto El contexto de quien lee (la baja de un material).
 * @param datos El material.
 * @returns Las prendas, por nombre.
 */
export async function recetasConMaterial(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ prendas: { producto_id: string; nombre: string }[] }> {
	const { material_id } = pedidoDeConMaterial.parse(datos);
	const prendas = await contexto.transaccion
		.selectDistinct({ producto_id: productos.id, nombre: productos.nombre })
		.from(recetas)
		.innerJoin(recetaLineas, eq(recetaLineas.recetaVersionId, recetas.versionVigenteId))
		.innerJoin(productos, eq(productos.id, recetas.productoId))
		.where(and(eq(recetaLineas.materialId, material_id), isNull(productos.bajaEn)))
		.orderBy(asc(productos.nombre));
	return { prendas };
}

/**
 * El desperdicio estimado de una prenda, con sus marcas.
 * @param contexto El contexto de quien lee.
 */
async function desperdicioEstimado(contexto: ContextoDeAccion) {
	const numero = async (clave: string) => Number(await contexto.lectura("admin.parametro", { clave }));
	const estimado = await numero("patronaje.desperdicio_estimado_pct");
	return {
		desperdicio_pct: estimado.toFixed(3),
		medido: false,
		lotes: 0,
		alto: estimado > (await numero("patronaje.desperdicio_alto_pct")),
		dato_flojo: 0 < (await numero("patronaje.dato_flojo_lotes")),
	};
}

/**
 * `patronaje.desperdicio_prenda`: el desperdicio de una prenda, o de todas las que tienen lotes cortados.
 * @param contexto El contexto de quien lee.
 * @param datos La prenda, o ninguna.
 * @returns Por prenda: el desperdicio en por ciento (texto con tres decimales), si es medido, su respaldo (cuántos
 * lotes), si es alto y si es dato flojo. Sin cortes (hasta la fase 12), el estimado; y sin prenda, ninguna.
 */
export async function desperdicioPrenda(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	prendas: {
		producto_id: string;
		desperdicio_pct: string;
		medido: boolean;
		lotes: number;
		alto: boolean;
		dato_flojo: boolean;
	}[];
}> {
	const { producto_id } = pedidoDeDesperdicio.parse(datos);
	if (producto_id === undefined) return { prendas: [] };
	return { prendas: [{ producto_id, ...(await desperdicioEstimado(contexto)) }] };
}

/**
 * Si la unidad de inventario de cada material se cuenta entera, de la lista «Unidades de material».
 * @param contexto El contexto de quien lee.
 * @param materialIds Los materiales.
 */
async function seCuentaEntera(
	contexto: ContextoDeAccion,
	materialIds: readonly string[],
): Promise<Map<string, boolean>> {
	if (materialIds.length === 0) return new Map();
	const leidos = await contexto.transaccion
		.select({ id: materiales.id, entera: listaValores.seCuentaEntera })
		.from(materiales)
		.innerJoin(listas, eq(listas.clave, "unidades_material"))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(inArray(materiales.id, [...materialIds]));
	return new Map(leidos.map((leido) => [leido.id, leido.entera === true]));
}

/**
 * `patronaje.calcular_material`: cuánto lleva cada material de la receta para unas piezas por talla, con la cuenta
 * del paquete compartido.
 * @param contexto El contexto de quien lee.
 * @param datos La prenda, las piezas por talla y, si se pide, una versión (si no, la vigente).
 * @returns La versión con que se contó (nada si no tiene receta), el desperdicio que usó y, por material, cuánto
 * lleva en su unidad de inventario, o `null` («—») si falta un dato.
 */
export async function calcularMaterial(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	receta_version_id: string | null;
	desperdicio_pct: string;
	materiales: { material_id: string; cantidad: number | null }[];
}> {
	const pedido = pedidoDeCalcular.parse(datos);
	const { desperdicio_pct } = await desperdicioEstimado(contexto);
	const [receta] = await contexto.transaccion
		.select({ versionId: recetas.versionVigenteId })
		.from(recetas)
		.where(eq(recetas.productoId, pedido.producto_id));
	const versionId = pedido.receta_version_id ?? receta?.versionId ?? null;
	if (versionId === null) return { receta_version_id: null, desperdicio_pct, materiales: [] };
	const { lineas } = await contenidoDeVersion(contexto.transaccion, versionId);
	const enteros = await seCuentaEntera(
		contexto,
		lineas.map((linea) => linea.materialId),
	);
	const cuenta = cuentaDeMaterial(
		lineas.map((linea) => ({
			materialId: linea.materialId,
			esTelaPrincipal: linea.papel === "tela_principal",
			cantidad: linea.cantidad,
			porTalla: Object.fromEntries(linea.tallas.map((talla) => [talla.tallaId, talla.cantidad])),
			recetaPorUnidadInventario: linea.recetaPorUnidadInventario,
			seCuentaEntera: enteros.get(linea.materialId) ?? false,
		})),
		Object.fromEntries(pedido.piezas_por_talla.map((talla) => [talla.talla_id, talla.piezas])),
		desperdicio_pct,
	);
	return {
		receta_version_id: versionId,
		desperdicio_pct,
		materiales: lineas.map((linea) => ({ material_id: linea.materialId, cantidad: cuenta[linea.materialId] ?? null })),
	};
}
