/**
 * Las tablas de `catalogo`: escuelas, secciones, grupos de tallas, tallas, tipos de prenda y sus medidas,
 * listas de precios, categorías de mayoreo, productos, variantes y precios.
 * Fase 8 · docs/modulos/catalogo/ (la tabla de cada archivo)
 *
 * Nada se borra: lo que se quita queda con su baja, y un precio se cierra. Las tallas, los productos y las
 * variantes bajan a la tablet, así que llevan `xid_escritura`.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnaXidEscritura, momento } from "../../nucleo/base/columnas.ts";
import { archivos, dispositivos, usuarios } from "../admin/tablas.ts";

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

/** Un id que nunca existe, para que un único trate un vacío como un valor más (`NULLS NOT DISTINCT`). */
const sinValor = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/** Una prenda, un accesorio o un servicio de mostrador. */
export const productos = pgTable(
	"productos",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		seccionId: uuid("seccion_id")
			.notNull()
			.references(() => secciones.id),
		escuelaId: uuid("escuela_id").references(() => escuelas.id),
		tipoPrendaId: uuid("tipo_prenda_id").references(() => tiposPrenda.id),
		/** @llavePendiente flujos.id */
		flujoId: uuid("flujo_id"),
		categoriaMayoreoId: uuid("categoria_mayoreo_id")
			.notNull()
			.references(() => categoriasMayoreo.id),
		esServicio: boolean("es_servicio").notNull().default(false),
		canalMostrador: boolean("canal_mostrador").notNull(),
		canalEnLinea: boolean("canal_en_linea").notNull(),
		canalExternos: boolean("canal_externos").notNull(),
		recargoPedidoEspecialCentavos: bigint("recargo_pedido_especial_centavos", { mode: "number" }).notNull(),
		fotoArchivoId: uuid("foto_archivo_id").references(() => archivos.id),
		productoBaseId: uuid("producto_base_id").references((): AnyPgColumn => productos.id),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("productos_nombre_escuela").on(
			sql`lower(${tabla.nombre})`,
			sql`coalesce(${tabla.escuelaId}, ${sinValor})`,
		),
		index("productos_seccion").on(tabla.seccionId).where(sql`${tabla.bajaEn} is null`),
		index("productos_escuela").on(tabla.escuelaId),
		index("productos_version").on(tabla.version),
		index("productos_xid_escritura").on(tabla.xidEscritura),
		check("productos_nombre", sql`char_length(${tabla.nombre}) between 4 and 80`),
		check(
			"productos_en_linea",
			sql`not ${tabla.canalEnLinea} or (${tabla.escuelaId} is null and not ${tabla.esServicio})`,
		),
		check(
			"productos_canal",
			sql`${tabla.bajaEn} is not null or ${tabla.canalMostrador} or ${tabla.canalEnLinea} or ${tabla.canalExternos}`,
		),
		check(
			"productos_recargo",
			sql`${tabla.recargoPedidoEspecialCentavos} >= 0 and ${tabla.recargoPedidoEspecialCentavos} % 100 = 0`,
		),
	],
);

/** Un producto en una talla, con su código de barras para siempre. */
export const variantes = pgTable(
	"variantes",
	{
		id: uuid("id").primaryKey(),
		productoId: uuid("producto_id")
			.notNull()
			.references(() => productos.id),
		tallaId: uuid("talla_id")
			.notNull()
			.references(() => tallas.id),
		codigo: text("codigo").notNull(),
		codigoMigradoDeTienda: boolean("codigo_migrado_de_tienda").notNull().default(false),
		esPedidoEspecial: boolean("es_pedido_especial").notNull().default(false),
		estadoEtiqueta: text("estado_etiqueta").notNull(),
		etiquetaImpresaEn: momento("etiqueta_impresa_en"),
		etiquetaImpresaPor: uuid("etiqueta_impresa_por").references((): AnyPgColumn => usuarios.id),
		reimprimirDesde: momento("reimprimir_desde"),
		descontinuadaEn: momento("descontinuada_en"),
		descontinuadaPor: uuid("descontinuada_por").references((): AnyPgColumn => usuarios.id),
		motivoDescontinuada: text("motivo_descontinuada"),
		reactivadaEn: momento("reactivada_en"),
		reactivadaPor: uuid("reactivada_por").references((): AnyPgColumn => usuarios.id),
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references((): AnyPgColumn => usuarios.id),
		motivoBaja: text("motivo_baja"),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("variantes_codigo").on(tabla.codigo),
		uniqueIndex("variantes_id_producto").on(tabla.id, tabla.productoId),
		uniqueIndex("variantes_producto_talla").on(tabla.productoId, tabla.tallaId).where(sql`${tabla.bajaEn} is null`),
		index("variantes_producto").on(tabla.productoId),
		index("variantes_por_etiquetar")
			.on(tabla.productoId)
			.where(sql`${tabla.estadoEtiqueta} in ('por_imprimir', 'por_reimprimir') and ${tabla.bajaEn} is null`),
		index("variantes_version").on(tabla.version),
		index("variantes_xid_escritura").on(tabla.xidEscritura),
		check("variantes_codigo", sql`${tabla.codigo} ~ '^[0-9]{6}$'`),
		check(
			"variantes_codigo_migrado",
			sql`(${tabla.codigoMigradoDeTienda} and ${tabla.codigo}::int between 500001 and 599999) or (not ${tabla.codigoMigradoDeTienda} and ${tabla.codigo}::int between 100001 and 499999)`,
		),
		check(
			"variantes_estado_etiqueta",
			sql`${tabla.estadoEtiqueta} in ('por_imprimir', 'impresa', 'por_reimprimir', 'al_fabricar')`,
		),
		check("variantes_al_fabricar", sql`(${tabla.estadoEtiqueta} = 'al_fabricar') = ${tabla.esPedidoEspecial}`),
		check(
			"variantes_impresa",
			sql`${tabla.estadoEtiqueta} not in ('impresa', 'por_reimprimir') or ${tabla.etiquetaImpresaEn} is not null`,
		),
		check(
			"variantes_reimprimir",
			sql`(${tabla.estadoEtiqueta} = 'por_reimprimir') = (${tabla.reimprimirDesde} is not null)`,
		),
		check("variantes_descontinuada", sql`(${tabla.descontinuadaEn} is null) = (${tabla.motivoDescontinuada} is null)`),
		check("variantes_baja", sql`(${tabla.bajaEn} is null) = (${tabla.motivoBaja} is null)`),
	],
);

/** El precio de un producto en una lista: el base (sin talla) o el propio de una talla, con su historia. */
export const precios = pgTable(
	"precios",
	{
		id: uuid("id").primaryKey(),
		listaId: uuid("lista_id")
			.notNull()
			.references(() => listasPrecios.id),
		productoId: uuid("producto_id")
			.notNull()
			.references(() => productos.id),
		varianteId: uuid("variante_id"),
		precioCentavos: bigint("precio_centavos", { mode: "number" }).notNull(),
		vigenteDesde: momento("vigente_desde").notNull().default(sql`now()`),
		vigenteHasta: momento("vigente_hasta"),
		finMotivo: text("fin_motivo"),
		origen: text("origen").notNull(),
		confirmadoConGoogleEn: momento("confirmado_con_google_en"),
		dispositivoId: uuid("dispositivo_id").references(() => dispositivos.id),
		/** @llavePendiente usuarios_panel.id */
		usuarioPanelId: uuid("usuario_panel_id"),
		...columnasComunes(),
	},
	(tabla) => [
		foreignKey({
			name: "precios_variante_del_producto",
			columns: [tabla.varianteId, tabla.productoId],
			foreignColumns: [variantes.id, variantes.productoId],
		}),
		uniqueIndex("precios_vigente")
			.on(tabla.listaId, tabla.productoId, sql`coalesce(${tabla.varianteId}, ${sinValor})`)
			.where(sql`${tabla.vigenteHasta} is null`),
		index("precios_historial").on(tabla.productoId, tabla.listaId, sql`${tabla.vigenteDesde} desc`),
		index("precios_version").on(tabla.version),
		check("precios_precio", sql`${tabla.precioCentavos} > 0 and ${tabla.precioCentavos} % 100 = 0`),
		check("precios_fin", sql`(${tabla.vigenteHasta} is null) = (${tabla.finMotivo} is null)`),
		check("precios_fin_motivo", sql`${tabla.finMotivo} is null or ${tabla.finMotivo} in ('reemplazado', 'quitado')`),
		check(
			"precios_origen",
			sql`${tabla.origen} in ('alta_producto', 'ficha', 'cambio_en_bloque', 'tienda_en_linea', 'panel_uniformame', 'migracion')`,
		),
		check("precios_bloque", sql`${tabla.origen} <> 'cambio_en_bloque' or ${tabla.confirmadoConGoogleEn} is not null`),
		check("precios_panel", sql`${tabla.origen} <> 'panel_uniformame' or ${tabla.usuarioPanelId} is not null`),
	],
);
