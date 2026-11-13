/**
 * `catalogo.pendientes` y la pastilla de Catálogo en el menú.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Quién entra», «Pendientes»)
 *
 * Los renglones: los modelos sin precio (regla 8 de listas de precios), un renglón por producto con variantes nuevas
 * sin etiqueta y, solo con `catalogo.etiqueta_lleva_precio`, uno por producto con etiquetas por reimprimir. Las cifras:
 * productos activos, listas, el siguiente código, los cambios de precio por semana (6 semanas, de lunes a domingo, en
 * hora de México) y las variantes sin etiqueta. La pastilla cuenta los productos distintos con algo pendiente y nunca
 * va roja.
 */

import { inicioDeSemana, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { pendientesDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { filas, modelosSinPrecio, parametroSiNo, siguienteCodigo } from "./comunes.ts";

/** Cuántas semanas lleva la gráfica de cambios de precio. */
const semanas = 6;

/** Un renglón de etiquetas, por producto. */
const porEtiquetar = z.object({
	producto_id: z.uuid(),
	producto: z.string(),
	escuela: z.string().nullable(),
	tallas: z.array(z.string()),
});

/**
 * Los productos activos con variantes vivas en un estado de etiqueta, con sus tallas en orden.
 * @param base La base.
 * @param estado `por_imprimir` o `por_reimprimir`.
 */
function productosConEtiquetas(base: Base, estado: "por_imprimir" | "por_reimprimir") {
	return filas(
		base,
		sql`SELECT p.id AS producto_id, p.nombre AS producto, e.nombre AS escuela,
			array_agg(t.nombre ORDER BY g.orden, t.orden) AS tallas
			FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
			JOIN grupos_talla g ON g.id = t.grupo_talla_id LEFT JOIN escuelas e ON e.id = p.escuela_id
			WHERE v.estado_etiqueta = ${estado} AND v.baja_en IS NULL AND v.descontinuada_en IS NULL AND p.baja_en IS NULL
			GROUP BY p.id, p.nombre, e.nombre ORDER BY p.nombre, e.nombre`,
		porEtiquetar,
	);
}

/**
 * Los renglones de Pendientes, todos.
 * @param base La base.
 */
async function renglonesDePendientes(base: Base) {
	const modelos = await filas(
		base,
		sql`SELECT m.producto_id, p.nombre AS producto, e.nombre AS escuela, m.lista
			FROM (${modelosSinPrecio}) m JOIN productos p ON p.id = m.producto_id LEFT JOIN escuelas e ON e.id = p.escuela_id
			ORDER BY p.nombre, m.lista`,
		z.object({ producto_id: z.uuid(), producto: z.string(), escuela: z.string().nullable(), lista: z.string() }),
	);
	const nuevas = await productosConEtiquetas(base, "por_imprimir");
	const reimprimir = (await parametroSiNo(base, "catalogo.etiqueta_lleva_precio"))
		? await productosConEtiquetas(base, "por_reimprimir")
		: [];
	return [
		...modelos.map((modelo) => ({
			tipo: "modelo_sin_precio" as const,
			grupo: "productos" as const,
			...modelo,
			tallas: [],
		})),
		...nuevas.map((renglon) => ({ tipo: "etiquetas" as const, grupo: "etiquetas" as const, ...renglon, lista: null })),
		...reimprimir.map((renglon) => ({
			tipo: "reimprimir" as const,
			grupo: "etiquetas" as const,
			...renglon,
			lista: null,
		})),
	];
}

/** La pastilla de Catálogo: los productos distintos con algo pendiente; nunca roja. */
export async function pastillaCatalogo({ base }: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const renglones = await renglonesDePendientes(base);
	return { conteo: new Set(renglones.map((renglon) => renglon.producto_id)).size, rojo: false };
}

/**
 * Los cambios de precio de cada una de las últimas semanas, de lunes a domingo en hora de México.
 * @param base La base.
 * @param lunes El lunes de esta semana.
 */
async function cambiosPorSemana(base: Base, lunes: ReturnType<typeof inicioDeSemana>): Promise<number[]> {
	const desde = lunes.subtract({ days: 7 * (semanas - 1) });
	const porSemana = await filas(
		base,
		sql`SELECT floor(((b.ocurrido_en AT TIME ZONE ${zonaDelNegocio})::date - ${desde.toString()}::date) / 7)::int AS semana,
			count(*)::int AS cambios
			FROM bitacora b WHERE b.entidad = 'productos' AND b.tipo = 'cambio' AND b.descripcion LIKE 'Precio %'
			  AND (b.ocurrido_en AT TIME ZONE ${zonaDelNegocio})::date >= ${desde.toString()}::date
			GROUP BY 1`,
		z.object({ semana: z.number().int(), cambios: z.number().int() }),
	);
	return Array.from({ length: semanas }, (_, semana) => porSemana.find((fila) => fila.semana === semana)?.cambios ?? 0);
}

export const consultaPendientes = implementarConsulta(pendientesDeCatalogo, async (contexto, parametros) => {
	const { base, diaDeNegocio } = contexto;
	const todos = await renglonesDePendientes(base);
	const grupo = parametros.grupo ?? "todos";
	const [cuentas] = await filas(
		base,
		sql`SELECT (SELECT count(*) FROM productos WHERE baja_en IS NULL)::int AS productos,
			(SELECT count(*) FROM listas_precios WHERE baja_en IS NULL)::int AS listas,
			(SELECT count(*) FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.estado_etiqueta = 'por_imprimir'
			  AND v.baja_en IS NULL AND v.descontinuada_en IS NULL AND p.baja_en IS NULL)::int AS sin_etiqueta`,
		z.object({ productos: z.number(), listas: z.number(), sin_etiqueta: z.number() }),
	);
	const porSemana = await cambiosPorSemana(base, inicioDeSemana(diaDeNegocio));
	const etiquetas = todos.filter((renglon) => renglon.grupo === "etiquetas");
	return {
		resultado: {
			cifras: {
				productos_activos: cuentas?.productos ?? 0,
				modelos_sin_precio: todos.filter((renglon) => renglon.tipo === "modelo_sin_precio").length,
				listas: cuentas?.listas ?? 0,
				siguiente_codigo: await siguienteCodigo(contexto),
				cambios_por_semana: porSemana,
				cambios_esta_semana: porSemana.at(-1) ?? 0,
				variantes_sin_etiqueta: cuentas?.sin_etiqueta ?? 0,
				productos_con_etiquetas_nuevas: todos.filter((renglon) => renglon.tipo === "etiquetas").length,
			},
			renglones: grupo === "todos" ? todos : todos.filter((renglon) => renglon.grupo === grupo),
			conteos: { todos: todos.length, productos: todos.length - etiquetas.length, etiquetas: etiquetas.length },
		},
	};
});
