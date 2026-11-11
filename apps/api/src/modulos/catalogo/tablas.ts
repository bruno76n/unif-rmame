/**
 * Las tablas de `catalogo`: escuelas, secciones, grupos de tallas, tallas, tipos de prenda y sus medidas,
 * listas de precios y categorías de mayoreo.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md, tallas-y-tipos-de-prenda.md y listas-de-precios.md
 *
 * Nada se borra: lo que se quita queda con su baja. Las tallas bajan a la tablet, así que llevan
 * `xid_escritura`.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnaXidEscritura, momento } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";

/** Las columnas de una baja que se puede deshacer. */
function columnasDeBaja() {
	return {
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references((): AnyPgColumn => usuarios.id),
		motivoBaja: text("motivo_baja"),
		reactivadoEn: momento("reactivado_en"),
	};
}

/** Para quién se hacen modelos propios. */
export const escuelas = pgTable(
	"escuelas",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		municipio: text("municipio").notNull(),
		color: text("color").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("escuelas_nombre_municipio").on(
			sql`sin_acentos(${tabla.nombre})`,
			sql`sin_acentos(${tabla.municipio})`,
		),
		index("escuelas_version").on(tabla.version),
		check("escuelas_nombre", sql`char_length(${tabla.nombre}) between 4 and 80`),
		check("escuelas_municipio", sql`char_length(${tabla.municipio}) between 3 and 60`),
		check("escuelas_color", sql`${tabla.color} ~ '^#[0-9A-Fa-f]{6}$'`),
	],
);

/** Un bloque del catálogo (Playeras, Pantalones…): ordena las pantallas y dice si sus productos llevan receta. */
export const secciones = pgTable(
	"secciones",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		orden: integer("orden").notNull(),
		llevaReceta: boolean("lleva_receta").notNull().default(true),
		tipoPrendaDefectoId: uuid("tipo_prenda_defecto_id").references((): AnyPgColumn => tiposPrenda.id),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("secciones_nombre").on(sql`lower(${tabla.nombre})`),
		check("secciones_nombre", sql`char_length(${tabla.nombre}) between 3 and 40`),
	],
);

/** Un grupo de tallas (Infantil, Juvenil y adulto…). */
export const gruposTalla = pgTable(
	"grupos_talla",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		orden: integer("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("grupos_talla_nombre").on(sql`lower(${tabla.nombre})`),
		check("grupos_talla_nombre", sql`char_length(${tabla.nombre}) between 3 and 40`),
	],
);

/** Una talla de un grupo, con su orden. */
export const tallas = pgTable(
	"tallas",
	{
		id: uuid("id").primaryKey(),
		grupoTallaId: uuid("grupo_talla_id")
			.notNull()
			.references(() => gruposTalla.id),
		nombre: text("nombre").notNull(),
		orden: integer("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("tallas_grupo_nombre").on(tabla.grupoTallaId, sql`lower(${tabla.nombre})`),
		index("tallas_xid_escritura").on(tabla.xidEscritura),
		check("tallas_nombre", sql`char_length(${tabla.nombre}) between 1 and 10`),
	],
);

/** El molde de un producto nuevo: propone sus medidas y su flujo. */
export const tiposPrenda = pgTable(
	"tipos_prenda",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		seccionId: uuid("seccion_id")
			.notNull()
			.references((): AnyPgColumn => secciones.id),
		/** @llavePendiente flujos.id */
		flujoDefectoId: uuid("flujo_defecto_id"),
		orden: integer("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("tipos_prenda_nombre").on(sql`lower(${tabla.nombre})`),
		check("tipos_prenda_nombre", sql`char_length(${tabla.nombre}) between 3 and 40`),
	],
);

/** Las medidas iniciales de un tipo de prenda, con un número por talla. */
export const tipoPrendaMedidas = pgTable(
	"tipo_prenda_medidas",
	{
		id: uuid("id").primaryKey(),
		tipoPrendaId: uuid("tipo_prenda_id")
			.notNull()
			.references(() => tiposPrenda.id),
		medida: text("medida").notNull(),
		orden: integer("orden").notNull(),
		tallaId: uuid("talla_id")
			.notNull()
			.references(() => tallas.id),
		valorCm: numeric("valor_cm", { precision: 12, scale: 3 }),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("tipo_prenda_medidas_vigente")
			.on(tabla.tipoPrendaId, sql`lower(${tabla.medida})`, tabla.tallaId)
			.where(sql`${tabla.bajaEn} is null`),
		check("tipo_prenda_medidas_medida", sql`char_length(${tabla.medida}) >= 3`),
	],
);

/** Una lista de precios: las tres generales (Mostrador, Mayoreo, En línea) y una por cliente externo. */
export const listasPrecios = pgTable(
	"listas_precios",
	{
		id: uuid("id").primaryKey(),
		tipo: text("tipo").notNull(),
		nombre: text("nombre").notNull(),
		nombreCorto: text("nombre_corto"),
		descripcion: text("descripcion"),
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id"),
		pctBasicos: numeric("pct_basicos", { precision: 6, scale: 3 }),
		pctEspeciales: numeric("pct_especiales", { precision: 6, scale: 3 }),
		orden: integer("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("listas_precios_nombre").on(sql`lower(${tabla.nombre})`),
		uniqueIndex("listas_precios_general")
			.on(tabla.tipo)
			.where(sql`${tabla.tipo} <> 'cliente' and ${tabla.bajaEn} is null`),
		uniqueIndex("listas_precios_cliente").on(tabla.clienteId).where(sql`${tabla.clienteId} is not null`),
		index("listas_precios_version").on(tabla.version),
		check("listas_precios_tipo", sql`${tabla.tipo} in ('mostrador', 'mayoreo', 'en_linea', 'cliente')`),
		check("listas_precios_cliente", sql`(${tabla.tipo} = 'cliente') = (${tabla.clienteId} is not null)`),
		check(
			"listas_precios_porcentajes",
			sql`(${tabla.tipo} = 'cliente' or (${tabla.pctBasicos} is null and ${tabla.pctEspeciales} is null)) and (${tabla.pctBasicos} is null or ${tabla.pctBasicos} between 0 and 100) and (${tabla.pctEspeciales} is null or ${tabla.pctEspeciales} between 0 and 100)`,
		),
	],
);

/** Una categoría de mayoreo: qué porcentaje del cliente le toca a un producto. */
export const categoriasMayoreo = pgTable(
	"categorias_mayoreo",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		descripcion: text("descripcion").notNull(),
		porcentajeQueAplica: text("porcentaje_que_aplica").notNull(),
		defectoPara: text("defecto_para"),
		orden: integer("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("categorias_mayoreo_nombre").on(sql`lower(${tabla.nombre})`),
		uniqueIndex("categorias_mayoreo_defecto").on(tabla.defectoPara).where(sql`${tabla.defectoPara} is not null`),
		index("categorias_mayoreo_version").on(tabla.version),
		check("categorias_mayoreo_aplica", sql`${tabla.porcentajeQueAplica} in ('basicos', 'especiales', 'ninguno')`),
		check(
			"categorias_mayoreo_defecto",
			sql`${tabla.defectoPara} is null or ${tabla.defectoPara} in ('con_escuela', 'sin_escuela')`,
		),
	],
);
