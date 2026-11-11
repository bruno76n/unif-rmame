/**
 * Las lecturas de la receta que usan otros módulos: si cubre unas tallas, las prendas que llevan un material, cuánto
 * material lleva un corte o un pedido, y el desperdicio de una prenda.
 * Fase 10 · docs/modulos/patronaje/recetas.md y cuenta-de-material.md («Lecturas»)
 *
 * La cuenta es la del paquete compartido (`cuentaDeMaterial`): la API nunca confía en lo que calculó la pantalla. El
 * desperdicio de una prenda es el medido con sus cortes (`produccion.cortes_de_prenda`, fase 12) o, sin cortes, el
 * estimado.
 */

import {
	aMilesimos,
	cuentaDeMaterial,
	deMilesimos,
	pideLaReceta,
} from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { productos } from "../../catalogo/tablas.ts";
import { listaDeUnidades } from "../../compras/siembra.ts";
import { materiales } from "../../compras/tablas.ts";
import { contenidoDeVersion } from "../dominio/recetas.ts";
import { recetaLineas, recetas, recetaVersiones } from "../tablas.ts";

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

/** Lo que regresa `produccion.cortes_de_prenda`, en lo que se usa aquí. */
const deLosCortes = z.object({
	cortes: z.array(
		z.object({
			producto_id: z.uuid(),
			receta_version_id: z.uuid().nullable(),
			metros_usados: z.string().nullable(),
			tallas: z.array(z.object({ talla_id: z.uuid(), piezas: z.number() })),
		}),
	),
});

/** El desperdicio de una prenda: en por ciento con tres decimales, si es medido, su respaldo, si es alto y si es flojo. */
interface Desperdicio {
	desperdicio_pct: string;
	medido: boolean;
	lotes: number;
	alto: boolean;
	dato_flojo: boolean;
}

/**
 * El desperdicio de unas prendas (regla 6): Σ metros reales de su tela principal ÷ Σ metros del patrón − 1, cada
 * lote contra su propia versión; un lote abajo del piso del patrón no cuenta. Sin lotes medidos, el estimado.
 * @param productoId Una prenda, o todas las que tienen cortes.
 * @returns Por prenda, su desperdicio.
 */
async function desperdicioDePrendas(
	contexto: ContextoDeAccion,
	productoId?: string,
): Promise<Map<string, Desperdicio>> {
	const numero = async (clave: string) => Number(await contexto.lectura("admin.parametro", { clave }));
	const estimado = await numero("patronaje.desperdicio_estimado_pct");
	const alto = await numero("patronaje.desperdicio_alto_pct");
	const flojo = await numero("patronaje.dato_flojo_lotes");
	const sumas = new Map<string, { real: bigint; patron: bigint; lotes: number }>();
	if (productoId !== undefined) sumas.set(productoId, { real: 0n, patron: 0n, lotes: 0 });
	if (contexto.hayLectura("produccion.cortes_de_prenda")) {
		const { cortes } = deLosCortes.parse(
			await contexto.lectura(
				"produccion.cortes_de_prenda",
				productoId === undefined ? {} : { producto_id: productoId },
			),
		);
		for (const corte of cortes) {
			if (corte.receta_version_id === null || corte.metros_usados === null) continue;
			const { lineas } = await contenidoDeVersion(contexto.transaccion, corte.receta_version_id);
			const principal = lineas.find((linea) => linea.papel === "tela_principal");
			if (principal === undefined) continue;
			const piso = pideLaReceta(
				[
					{
						materialId: principal.materialId,
						esTelaPrincipal: true,
						cantidad: principal.cantidad,
						porTalla: Object.fromEntries(principal.tallas.map((talla) => [talla.tallaId, talla.cantidad])),
						recetaPorUnidadInventario: principal.recetaPorUnidadInventario,
						seCuentaEntera: false,
					},
				],
				Object.fromEntries(corte.tallas.map((talla) => [talla.talla_id, talla.piezas])),
				"0",
			)[principal.materialId];
			const real = aMilesimos(corte.metros_usados);
			// Un lote abajo del piso del patrón no cuenta.
			if (piso === null || piso === undefined || piso === 0n || real < piso) continue;
			const suya = sumas.get(corte.producto_id) ?? { real: 0n, patron: 0n, lotes: 0 };
			sumas.set(corte.producto_id, { real: suya.real + real, patron: suya.patron + piso, lotes: suya.lotes + 1 });
		}
	}
	const resultado = new Map<string, Desperdicio>();
	for (const [id, suma] of sumas) {
		// En milésimos de por ciento: (real ÷ patrón − 1) × 100 000, redondeado.
		const pct =
			suma.lotes === 0 ? null : Number(((suma.real - suma.patron) * 100_000n + suma.patron / 2n) / suma.patron) / 1000;
		const desperdicio = pct ?? estimado;
		resultado.set(id, {
			desperdicio_pct: desperdicio.toFixed(3),
			medido: pct !== null,
			lotes: suma.lotes,
			alto: desperdicio > alto,
			dato_flojo: suma.lotes < flojo,
		});
	}
	return resultado;
}

/**
 * `patronaje.desperdicio_prenda`: el desperdicio de una prenda, o de todas las que tienen lotes cortados.
 * @param contexto El contexto de quien lee.
 * @param datos La prenda, o ninguna.
 * @returns Por prenda: el desperdicio en por ciento (texto con tres decimales), si es medido, su respaldo (cuántos
 * lotes), si es alto y si es dato flojo. Sin cortes, el estimado.
 */
export async function desperdicioPrenda(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ prendas: ({ producto_id: string } & Desperdicio)[] }> {
	const { producto_id } = pedidoDeDesperdicio.parse(datos);
	const porPrenda = await desperdicioDePrendas(contexto, producto_id);
	return { prendas: [...porPrenda].map(([id, desperdicio]) => ({ producto_id: id, ...desperdicio })) };
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
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(inArray(materiales.id, [...materialIds]));
	return new Map(leidos.map((leido) => [leido.id, leido.entera === true]));
}

/**
 * `patronaje.calcular_material`: cuánto lleva cada material de la receta para unas piezas por talla, con la cuenta
 * del paquete compartido.
 * @param contexto El contexto de quien lee.
 * @param datos La prenda, las piezas por talla y, si se pide, una versión (si no, la vigente).
 * @returns La versión con que se contó (nada si no tiene receta), el desperdicio que usó y, por material, su papel,
 * cuánto lleva en su unidad de inventario (entero), y con sus decimales lo que pide la receta y el piso del patrón (el
 * corte, fase 12); `null` («—») si falta un dato.
 */
export async function calcularMaterial(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	receta_version_id: string | null;
	desperdicio_pct: string;
	materiales: {
		material_id: string;
		papel: string;
		cantidad: number | null;
		pide: string | null;
		piso: string | null;
	}[];
}> {
	const pedido = pedidoDeCalcular.parse(datos);
	const desperdicio_pct =
		(await desperdicioDePrendas(contexto, pedido.producto_id)).get(pedido.producto_id)?.desperdicio_pct ?? "0";
	const [receta] = await contexto.transaccion
		.select({ id: recetas.id, versionId: recetas.versionVigenteId })
		.from(recetas)
		.where(eq(recetas.productoId, pedido.producto_id));
	// La versión que congeló un lote tiene que ser de la receta de ese producto.
	if (pedido.receta_version_id !== undefined) {
		if (receta === undefined) throw new Error(`${pedido.producto_id} no tiene receta: no tiene la versión que pide`);
		const [suya] = await contexto.transaccion
			.select({ id: recetaVersiones.id })
			.from(recetaVersiones)
			.where(and(eq(recetaVersiones.id, pedido.receta_version_id), eq(recetaVersiones.recetaId, receta.id)));
		if (suya === undefined)
			throw new Error(`la versión ${pedido.receta_version_id} no es de la receta de ese producto`);
	}
	const versionId = pedido.receta_version_id ?? receta?.versionId ?? null;
	if (versionId === null) return { receta_version_id: null, desperdicio_pct, materiales: [] };
	const { lineas } = await contenidoDeVersion(contexto.transaccion, versionId);
	const enteros = await seCuentaEntera(
		contexto,
		lineas.map((linea) => linea.materialId),
	);
	const deLaCuenta = lineas.map((linea) => ({
		materialId: linea.materialId,
		esTelaPrincipal: linea.papel === "tela_principal",
		cantidad: linea.cantidad,
		porTalla: Object.fromEntries(linea.tallas.map((talla) => [talla.tallaId, talla.cantidad])),
		recetaPorUnidadInventario: linea.recetaPorUnidadInventario,
		seCuentaEntera: enteros.get(linea.materialId) ?? false,
	}));
	const piezas = Object.fromEntries(pedido.piezas_por_talla.map((talla) => [talla.talla_id, talla.piezas]));
	const cuenta = cuentaDeMaterial(deLaCuenta, piezas, desperdicio_pct);
	// Con sus decimales: lo que pide la receta (con el desperdicio de la principal) y el piso del patrón (sin él).
	const pide = pideLaReceta(deLaCuenta, piezas, desperdicio_pct);
	const piso = pideLaReceta(deLaCuenta, piezas, "0");
	const enTexto = (milesimos: bigint | null | undefined) =>
		milesimos === null || milesimos === undefined ? null : deMilesimos(milesimos);
	return {
		receta_version_id: versionId,
		desperdicio_pct,
		materiales: lineas.map((linea) => ({
			material_id: linea.materialId,
			papel: linea.papel,
			cantidad: cuenta[linea.materialId] ?? null,
			pide: enTexto(pide[linea.materialId]),
			piso: enTexto(piso[linea.materialId]),
		})),
	};
}
