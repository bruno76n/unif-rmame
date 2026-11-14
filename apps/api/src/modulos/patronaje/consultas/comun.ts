/**
 * Lo que comparten las consultas de las pantallas de Patronaje: las prendas que llevan receta con su estado, sus
 * tallas, su tela principal, su próximo corte y su desperdicio; los parámetros que usan; y cómo se escriben sus textos
 * («Básico», «+6%», «15 oct · en 4 días»). Solo lee: lo de Producción y el desperdicio salen de sus lecturas.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md
 */

import { diasHasta, textoDeDiaCorto, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";

/** Cómo se dice la prenda sin escuela en las listas. */
export const sinEscuela = "Básico";

/** Una talla viva de una prenda. */
export interface TallaLeida {
	talla_id: string;
	nombre: string;
	/** El nombre de su grupo de tallas, para el rango. */
	grupo: string;
	especial: boolean;
}

/** Un lote por cortar de una prenda, como lo da `produccion.lotes_por_cortar`. */
export interface LotePorCortar {
	folio: string;
	fecha_corte: string;
	tallas: { talla_id: string; piezas_planeadas: number }[];
}

/** El desperdicio medido de una prenda, como lo da `patronaje.desperdicio_prenda`. */
export interface DesperdicioLeido {
	desperdicio_pct: string;
	medido: boolean;
	lotes: number;
	alto: boolean;
	dato_flojo: boolean;
}

/** Una prenda que lleva receta, con lo que usan las pantallas. */
export interface PrendaLeida {
	producto_id: string;
	nombre: string;
	escuela: string | null;
	color: string | null;
	seccion_id: string;
	receta_id: string;
	estado: "sin_receta" | "sin_verificar" | "verificada";
	version: number;
	version_vigente_id: string | null;
	vigente: number | null;
	tallas: TallaLeida[];
	/** La tela principal de la versión vigente, con sus metros por talla. */
	tela: { material_id: string; nombre: string; tallas: Map<string, string> } | null;
	/** Cuántos materiales lleva la versión vigente. */
	materiales: number | null;
	/** El próximo lote por cortar. */
	corte: LotePorCortar | null;
	/** Si se cortó alguna vez con cualquiera de sus versiones. */
	desperdicio: DesperdicioLeido | null;
}

/** Los parámetros de Patronaje que usan sus pantallas. */
export interface ParametrosDePatronaje {
	corteProximo: number;
	corteUrgente: number;
	desperdicioEstimado: number;
	desperdicioAlto: number;
	datoFlojo: number;
}

/**
 * Lee los parámetros de Patronaje que usan sus pantallas.
 * @param contexto El contexto de la consulta.
 */
export async function leerParametros(contexto: ContextoDeConsulta): Promise<ParametrosDePatronaje> {
	const numero = async (clave: string) => Number(await contexto.lectura("admin.parametro", { clave }));
	return {
		corteProximo: await numero("patronaje.corte_proximo_dias"),
		corteUrgente: await numero("patronaje.corte_urgente_dias"),
		desperdicioEstimado: await numero("patronaje.desperdicio_estimado_pct"),
		desperdicioAlto: await numero("patronaje.desperdicio_alto_pct"),
		datoFlojo: await numero("patronaje.dato_flojo_lotes"),
	};
}

/** Una prenda como sale de la base. */
const dePrenda = z.object({
	producto_id: z.uuid(),
	nombre: z.string(),
	escuela: z.string().nullable(),
	color: z.string().nullable(),
	seccion_id: z.uuid(),
	receta_id: z.uuid(),
	estado: z.enum(["sin_receta", "sin_verificar", "verificada"]),
	version: z.coerce.number(),
	version_vigente_id: z.uuid().nullable(),
	vigente: z.number().nullable(),
});

/** Lo que regresa `produccion.lotes_por_cortar`, en lo que se usa aquí. */
const deLotesPorCortar = z.object({
	lotes: z.array(
		z.object({
			folio: z.string(),
			producto_id: z.uuid(),
			fecha_corte: z.string(),
			tallas: z.array(z.object({ talla_id: z.uuid(), piezas_planeadas: z.number() })),
		}),
	),
});

/** Lo que regresa `patronaje.desperdicio_prenda`. */
const deDesperdicio = z.object({
	prendas: z.array(
		z.object({
			producto_id: z.uuid(),
			desperdicio_pct: z.string(),
			medido: z.boolean(),
			lotes: z.number(),
			alto: z.boolean(),
			dato_flojo: z.boolean(),
		}),
	),
});

/**
 * Las tallas vivas de unas prendas, en su orden.
 * @param contexto El contexto de la consulta.
 * @param ids Las prendas; sin ellas, todas.
 */
async function tallasDe(contexto: ContextoDeConsulta, ids?: readonly string[]): Promise<Map<string, TallaLeida[]>> {
	const { rows } = await contexto.base.execute(sql`
		SELECT v.producto_id, t.id AS talla_id, t.nombre, g.nombre AS grupo, v.es_pedido_especial AS especial
		FROM variantes v JOIN tallas t ON t.id = v.talla_id JOIN grupos_talla g ON g.id = t.grupo_talla_id
		WHERE v.baja_en IS NULL ${
			ids === undefined
				? sql``
				: sql`AND v.producto_id IN (${sql.join(
						ids.map((id) => sql`${id}::uuid`),
						sql`, `,
					)})`
		}
		ORDER BY ${ordenDeTallas("t")}`);
	const porPrenda = new Map<string, TallaLeida[]>();
	for (const talla of z
		.array(
			z.object({
				producto_id: z.uuid(),
				talla_id: z.uuid(),
				nombre: z.string(),
				grupo: z.string(),
				especial: z.boolean(),
			}),
		)
		.parse(rows)) {
		const suyas = porPrenda.get(talla.producto_id) ?? [];
		suyas.push({ talla_id: talla.talla_id, nombre: talla.nombre, grupo: talla.grupo, especial: talla.especial });
		porPrenda.set(talla.producto_id, suyas);
	}
	return porPrenda;
}

/**
 * La tela principal y cuántos materiales lleva cada versión vigente.
 * @param contexto El contexto de la consulta.
 */
async function telasVigentes(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT r.producto_id, l.material_id, m.nombre, l.papel,
			coalesce(json_agg(json_build_object('talla_id', t.talla_id, 'cantidad', t.cantidad::text))
				FILTER (WHERE t.id IS NOT NULL), '[]') AS tallas
		FROM recetas r JOIN receta_lineas l ON l.receta_version_id = r.version_vigente_id
		JOIN materiales m ON m.id = l.material_id LEFT JOIN receta_linea_tallas t ON t.receta_linea_id = l.id
		GROUP BY r.producto_id, l.id, m.nombre`);
	const lineas = z
		.array(
			z.object({
				producto_id: z.uuid(),
				material_id: z.uuid(),
				nombre: z.string(),
				papel: z.string(),
				tallas: z.array(z.object({ talla_id: z.uuid(), cantidad: z.string() })),
			}),
		)
		.parse(rows);
	const telas = new Map<string, PrendaLeida["tela"]>();
	const cuantos = new Map<string, number>();
	for (const linea of lineas) {
		cuantos.set(linea.producto_id, (cuantos.get(linea.producto_id) ?? 0) + 1);
		if (linea.papel === "tela_principal") {
			telas.set(linea.producto_id, {
				material_id: linea.material_id,
				nombre: linea.nombre,
				tallas: new Map(linea.tallas.map((talla) => [talla.talla_id, talla.cantidad])),
			});
		}
	}
	return { telas, cuantos };
}

/**
 * El próximo lote por cortar de cada prenda, de `produccion.lotes_por_cortar` (que ya vienen por fecha de corte).
 * @param contexto El contexto de la consulta.
 */
export async function proximosCortes(contexto: ContextoDeConsulta): Promise<Map<string, LotePorCortar>> {
	const { lotes } = deLotesPorCortar.parse(await contexto.lectura("produccion.lotes_por_cortar", {}));
	const proximos = new Map<string, LotePorCortar>();
	for (const lote of lotes) if (!proximos.has(lote.producto_id)) proximos.set(lote.producto_id, lote);
	return proximos;
}

/**
 * El desperdicio de las prendas medidas en corte, de `patronaje.desperdicio_prenda`.
 * @param contexto El contexto de la consulta.
 */
export async function desperdiciosMedidos(contexto: ContextoDeConsulta): Promise<Map<string, DesperdicioLeido>> {
	const { prendas } = deDesperdicio.parse(await contexto.lectura("patronaje.desperdicio_prenda", {}));
	return new Map(prendas.filter((prenda) => prenda.medido).map((prenda) => [prenda.producto_id, prenda]));
}

/**
 * Las prendas vivas que llevan receta (su sección la lleva y no son servicio), por nombre, con todo lo que usan las
 * pantallas.
 * @param contexto El contexto de la consulta.
 * @param productoId Una sola prenda, si se pide.
 */
export async function leerPrendas(contexto: ContextoDeConsulta, productoId?: string): Promise<PrendaLeida[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT p.id AS producto_id, p.nombre, e.nombre AS escuela, e.color, s.id AS seccion_id, r.id AS receta_id,
			r.estado, r.version, r.version_vigente_id, v.numero AS vigente
		FROM recetas r JOIN productos p ON p.id = r.producto_id JOIN secciones s ON s.id = p.seccion_id
		LEFT JOIN escuelas e ON e.id = p.escuela_id LEFT JOIN receta_versiones v ON v.id = r.version_vigente_id
		WHERE s.lleva_receta AND NOT p.es_servicio AND p.baja_en IS NULL
			${productoId === undefined ? sql`` : sql`AND p.id = ${productoId}`}
		ORDER BY p.nombre, e.nombre NULLS FIRST`);
	const prendas = z.array(dePrenda).parse(rows);
	const tallas = await tallasDe(contexto, productoId === undefined ? undefined : [productoId]);
	const { telas, cuantos } = await telasVigentes(contexto);
	const cortes = await proximosCortes(contexto);
	const desperdicios = await desperdiciosMedidos(contexto);
	return prendas.map((prenda) => ({
		...prenda,
		tallas: tallas.get(prenda.producto_id) ?? [],
		tela: telas.get(prenda.producto_id) ?? null,
		materiales: cuantos.get(prenda.producto_id) ?? null,
		corte: cortes.get(prenda.producto_id) ?? null,
		desperdicio: desperdicios.get(prenda.producto_id) ?? null,
	}));
}

/**
 * La talla de en medio de una prenda: la de base al llenar y la que dicen Recetas y Rendimiento. Solo cuentan las
 * tallas normales; sin ellas, las de pedido especial.
 * @param tallas Sus tallas, en orden.
 */
export function tallaDeEnMedio(tallas: readonly TallaLeida[]): TallaLeida | undefined {
	const normales = tallas.filter((talla) => !talla.especial);
	const entre = normales.length > 0 ? normales : tallas;
	return entre[Math.floor((entre.length - 1) / 2)];
}

/**
 * Un por ciento de desperdicio como se dice: «+6%».
 * @param pct El por ciento, en texto decimal.
 */
export function textoDePorciento(pct: string | number): string {
	return `+${Math.round(Number(pct))}%`;
}

/**
 * Unos metros con dos decimales, como los escribe Patronaje: «0.92».
 * @param metros En texto decimal.
 */
export function metrosConDos(metros: string | number): string {
	return Number(metros).toFixed(2);
}

/**
 * Los días que faltan para un corte, y cómo se dicen: «15 oct · en 4 días».
 * @param contexto El contexto de la consulta.
 * @param fecha La fecha de corte, en ISO.
 */
export function cuandoSeCorta(contexto: ContextoDeConsulta, fecha: string): { dias: number; texto: string } {
	const dias = diasHasta(contexto.diaDeNegocio, fecha);
	return { dias, texto: `${textoDeDiaCorto(fecha)} · ${textoEnDias(dias)}` };
}

/**
 * Las piezas planeadas de un lote.
 * @param lote El lote.
 */
export function piezasDelLote(lote: LotePorCortar): number {
	return lote.tallas.reduce((suma, talla) => suma + talla.piezas_planeadas, 0);
}

/** El estado de una receta como se dice y se pinta. */
export const estadosDeReceta = {
	sin_receta: { texto: "Sin receta", color: "rojo" },
	sin_verificar: { texto: "Sin verificar", color: "ambar" },
	verificada: { texto: "Verificada", color: "verde" },
} as const;

/** Un desarrollo con lo que usan las pantallas; sus fechas, en días de negocio. */
export interface DesarrolloLeido {
	id: string;
	folio: string;
	version: number;
	etapa: "solicitud" | "muestra" | "aprobacion" | "ficha_tecnica" | "en_catalogo" | "cancelado";
	prenda: string;
	escuela: string | null;
	color: string | null;
	tela: string;
	tela_detalle: string | null;
	tallas: string;
	descripcion: string | null;
	muestra_talla: string | null;
	muestra_entregada: string | null;
	motivo_cambios: string | null;
	aprobado: string | null;
	producto_id: string | null;
	producto: string | null;
	autorizacion: string | null;
	autorizacion_estado: string | null;
	solicito: string;
	ultimo: string;
	cancelado: string | null;
	cancelo: string | null;
	motivo_cancelacion: string | null;
}

/** Un desarrollo como sale de la base. */
const deDesarrollo = z.object({
	id: z.uuid(),
	folio: z.string(),
	version: z.coerce.number(),
	etapa: z.enum(["solicitud", "muestra", "aprobacion", "ficha_tecnica", "en_catalogo", "cancelado"]),
	prenda: z.string(),
	escuela: z.string().nullable(),
	color: z.string().nullable(),
	tela: z.string(),
	tela_detalle: z.string().nullable(),
	tallas: z.string(),
	descripcion: z.string().nullable(),
	muestra_talla: z.string().nullable(),
	muestra_entregada: z.string().nullable(),
	motivo_cambios: z.string().nullable(),
	aprobado: z.string().nullable(),
	producto_id: z.uuid().nullable(),
	producto: z.string().nullable(),
	autorizacion: z.string().nullable(),
	autorizacion_estado: z.string().nullable(),
	solicito: z.string(),
	ultimo: z.string(),
	cancelado: z.string().nullable(),
	cancelo: z.string().nullable(),
	motivo_cancelacion: z.string().nullable(),
});

/**
 * El día de negocio de un momento, en SQL.
 * @param columna El momento.
 */
function diaDe(columna: SQL) {
	return sql`(${columna} AT TIME ZONE 'America/Mexico_City')::date::text`;
}

/**
 * Los desarrollos, del más viejo al más nuevo.
 * @param contexto El contexto de la consulta.
 * @param desarrolloId Uno solo, si se pide.
 */
export async function leerDesarrollos(contexto: ContextoDeConsulta, desarrolloId?: string): Promise<DesarrolloLeido[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT d.id, d.folio, d.version, d.etapa, d.prenda, e.nombre AS escuela, e.color, m.nombre AS tela,
			m.presentacion AS tela_detalle, d.tallas, d.descripcion, d.muestra_talla,
			${diaDe(sql`d.muestra_entregada_en`)} AS muestra_entregada, d.motivo_cambios,
			${diaDe(sql`d.aprobado_en`)} AS aprobado, d.producto_id, p.nombre AS producto, a.folio AS autorizacion,
			a.estado AS autorizacion_estado, ${diaDe(sql`d.creado_en`)} AS solicito,
			${diaDe(sql`(SELECT max(v.creado_en) FROM desarrollo_eventos v WHERE v.desarrollo_id = d.id)`)} AS ultimo,
			${diaDe(sql`d.cancelado_en`)} AS cancelado, coalesce(u.nombre, pe.nombre) AS cancelo, d.motivo_cancelacion
		FROM desarrollos d JOIN materiales m ON m.id = d.tela_material_id LEFT JOIN escuelas e ON e.id = d.escuela_id
		LEFT JOIN productos p ON p.id = d.producto_id LEFT JOIN autorizaciones a ON a.id = d.autorizacion_id
		LEFT JOIN usuarios u ON u.id = d.cancelado_por LEFT JOIN personas pe ON pe.id = u.persona_id
		${desarrolloId === undefined ? sql`` : sql`WHERE d.id = ${desarrolloId}`}
		ORDER BY d.creado_en, d.folio`);
	return z.array(deDesarrollo).parse(rows);
}

/** Cómo se dice el desarrollo sin escuela. */
export const basicoOGeneral = "Básico o general";

/** El nombre de pantalla de cada etapa de un desarrollo. */
export const nombresDeEtapa: Readonly<Record<DesarrolloLeido["etapa"], string>> = {
	solicitud: "Solicitud",
	muestra: "Muestra",
	aprobacion: "Aprobación",
	ficha_tecnica: "Ficha técnica",
	en_catalogo: "En catálogo",
	cancelado: "Descartado",
};

/**
 * Lo que espera una muestra en aprobación: el cliente, con escuela; Dirección, sin ella.
 * @param desarrollo El desarrollo.
 */
export function esperaAprobacion(desarrollo: DesarrolloLeido): string {
	return desarrollo.escuela === null ? "Esperando aprobación de Dirección" : "Esperando aprobación del cliente";
}
