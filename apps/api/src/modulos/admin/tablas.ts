/**
 * Las tablas del módulo `admin` que ya existen.
 * Fase 3 · docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («La tabla `comandos_recibidos`»)
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («La tabla `eventos`» y «Los trabajos programados»)
 *
 * Fase 4 · docs/modulos/admin/folios.md y docs/modulos/admin/configuracion.md (sus tablas)
 *
 * `comandos_recibidos` es de `admin`, pero nace en la fase 3 porque la idempotencia la necesita.
 * `comandos_recibidos`, `eventos` y `trabajos_vueltas` son tablas técnicas: no llevan las columnas
 * comunes; las demás sí. Sus columnas que apuntan a tablas de fases posteriores llevan su `@llavePendiente`.
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	index,
	inet,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeAparato, columnasDeBaja, columnaXidEscritura } from "../../nucleo/base/columnas.ts";
import { ubicaciones } from "../inventario/tablas.ts";

/** Un momento: `timestamptz`. */
function momento(nombre: string) {
	return timestamp(nombre, { withTimezone: true, mode: "string" });
}

/** Cada acción que llegó, de la web, de un aparato o de uniformame.mx: hace que un reintento nunca duplique. */
export const comandosRecibidos = pgTable(
	"comandos_recibidos",
	{
		id: uuid("id").primaryKey(),
		claveIdempotencia: uuid("clave_idempotencia").notNull(),
		origen: text("origen").notNull(),
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		/** @llavePendiente usuarios.id */
		usuarioId: uuid("usuario_id"),
		/** @llavePendiente sesiones.id */
		sesionId: uuid("sesion_id"),
		/** @llavePendiente personas.id */
		personaId: uuid("persona_id"),
		tipoComando: text("tipo_comando").notNull(),
		ocurridoEn: momento("ocurrido_en").notNull(),
		recibidoEn: momento("recibido_en").notNull().defaultNow(),
		cargaHash: text("carga_hash").notNull(),
		carga: jsonb("carga"),
		resultado: text("resultado").notNull(),
		motivoApartado: text("motivo_apartado"),
		esperaEntidadId: uuid("espera_entidad_id"),
		dispositivoRevocado: boolean("dispositivo_revocado").notNull().default(false),
		/** @llavePendiente excepciones.id */
		excepcionId: uuid("excepcion_id"),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		respuesta: jsonb("respuesta"),
		reintentos: integer("reintentos").notNull().default(0),
		ultimoReintentoEn: momento("ultimo_reintento_en"),
		descartadoEn: momento("descartado_en"),
		/** @llavePendiente usuarios.id */
		descartadoPor: uuid("descartado_por"),
		motivoDescarte: text("motivo_descarte"),
		retenidoAplicadoEn: momento("retenido_aplicado_en"),
		/** @llavePendiente usuarios.id */
		retenidoAplicadoPor: uuid("retenido_aplicado_por"),
		actualizadoEn: momento("actualizado_en"),
	},
	(tabla) => [
		uniqueIndex("comandos_recibidos_clave_idempotencia").on(tabla.claveIdempotencia),
		index("comandos_recibidos_dispositivo").on(tabla.dispositivoId, tabla.recibidoEn.desc()),
		index("comandos_recibidos_apartados")
			.on(tabla.recibidoEn)
			.where(sql`${tabla.resultado} = 'apartado' and ${tabla.descartadoEn} is null`),
		index("comandos_recibidos_espera").on(tabla.esperaEntidadId).where(sql`${tabla.esperaEntidadId} is not null`),
		check("comandos_recibidos_origen", sql`${tabla.origen} in ('web', 'aparato', 'linea')`),
		check("comandos_recibidos_resultado", sql`${tabla.resultado} in ('aplicado', 'excepcion', 'apartado')`),
		check(
			"comandos_recibidos_dispositivo_obligatorio",
			sql`${tabla.origen} = 'web' or ${tabla.dispositivoId} is not null`,
		),
		check(
			"comandos_recibidos_cuenta_obligatoria",
			sql`${tabla.origen} <> 'web' or (${tabla.usuarioId} is not null and ${tabla.sesionId} is not null)`,
		),
		check(
			"comandos_recibidos_motivo_apartado",
			sql`${tabla.resultado} <> 'apartado' or ${tabla.motivoApartado} is not null`,
		),
	],
);

/**
 * La bandeja de salida de las acciones: cada evento de dominio, que el worker reparte después de
 * confirmar. Se parte por mes (`creado_en`) en la migración; solo cambian las columnas del proceso.
 */
export const eventos = pgTable(
	"eventos",
	{
		id: uuid("id").notNull(),
		tipo: text("tipo").notNull(),
		modulo: text("modulo").notNull(),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		entidadFolio: text("entidad_folio"),
		datos: jsonb("datos"),
		tablas: text("tablas").array().notNull(),
		ubicacionIds: uuid("ubicacion_ids").array().notNull().default(sql`'{}'`),
		/** @llavePendiente usuarios.id */
		usuarioId: uuid("usuario_id"),
		/** @llavePendiente personas.id */
		personaId: uuid("persona_id"),
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		comandoId: uuid("comando_id"),
		ocurridoEn: momento("ocurrido_en").notNull(),
		procesadoEn: momento("procesado_en"),
		intentos: smallint("intentos").notNull().default(0),
		siguienteIntentoEn: momento("siguiente_intento_en"),
		ultimoError: text("ultimo_error"),
		creadoEn: momento("creado_en").notNull().defaultNow(),
	},
	(tabla) => [
		primaryKey({ columns: [tabla.id, tabla.creadoEn] }),
		index("eventos_pendientes").on(tabla.creadoEn).where(sql`${tabla.procesadoEn} is null`),
		index("eventos_entidad").on(tabla.entidad, tabla.entidadId),
	],
);

/**
 * Cada vuelta de un trabajo programado: el reloj la encola una vez por periodo y queda terminada cuando
 * el trabajo acaba bien; si falla, la siguiente vuelta del reloj la vuelve a encolar.
 */
export const trabajosVueltas = pgTable(
	"trabajos_vueltas",
	{
		trabajo: text("trabajo").notNull(),
		periodo: text("periodo").notNull(),
		encoladoEn: momento("encolado_en").notNull().defaultNow(),
		terminadoEn: momento("terminado_en"),
		intentos: integer("intentos").notNull().default(0),
		ultimoError: text("ultimo_error"),
	},
	(tabla) => [primaryKey({ columns: [tabla.trabajo, tabla.periodo] })],
);

/** Un contador de folio por tipo de documento y alcance (el año, el prefijo del aparato, el tipo de máquina). */
export const contadoresFolio = pgTable(
	"contadores_folio",
	{
		id: uuid("id").primaryKey(),
		tipo: text("tipo").notNull(),
		alcance: text("alcance").notNull().default(""),
		prefijo: text("prefijo").notNull(),
		siguiente: bigint("siguiente", { mode: "number" }).notNull(),
		digitos: smallint("digitos").notNull(),
		minimo: bigint("minimo", { mode: "number" }).notNull().default(1),
		maximo: bigint("maximo", { mode: "number" }),
		asigna: text("asigna").notNull(),
		modulo: text("modulo").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("contadores_folio_tipo_alcance").on(tabla.tipo, tabla.alcance),
		check("contadores_folio_asigna", sql`${tabla.asigna} in ('servidor', 'aparato')`),
	],
);

/** Los parámetros del negocio: un valor por clave (y por ubicación, si lo es), con su tipo y sus límites. */
export const parametros = pgTable(
	"parametros",
	{
		id: uuid("id").primaryKey(),
		clave: text("clave").notNull(),
		ubicacionId: uuid("ubicacion_id").references(() => ubicaciones.id),
		seccion: text("seccion").notNull(),
		nombre: text("nombre").notNull(),
		explicacion: text("explicacion"),
		tipoValor: text("tipo_valor").notNull(),
		unidad: text("unidad"),
		valorEntero: bigint("valor_entero", { mode: "number" }),
		valorPorcentaje: numeric("valor_porcentaje", { precision: 6, scale: 3 }),
		valorTexto: text("valor_texto"),
		valorBooleano: boolean("valor_booleano"),
		opciones: text("opciones").array(),
		minimo: bigint("minimo", { mode: "number" }),
		maximo: bigint("maximo", { mode: "number" }),
		permiteVacio: boolean("permite_vacio").notNull().default(false),
		estadoDecision: text("estado_decision").notNull(),
		moduloLector: text("modulo_lector").notNull(),
		bajaA: text("baja_a").array().notNull().default(sql`'{}'`),
		orden: integer("orden").notNull(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		unique("parametros_clave_ubicacion").on(tabla.clave, tabla.ubicacionId).nullsNotDistinct(),
		index("parametros_xid_escritura").on(tabla.xidEscritura),
		check("parametros_seccion", sql`${tabla.seccion} in ('decision_operacion', 'parametro', 'tecnico')`),
		check(
			"parametros_tipo_valor",
			sql`${tabla.tipoValor} in ('entero', 'centavos', 'porcentaje', 'opcion', 'booleano', 'texto', 'hora')`,
		),
		check("parametros_estado_decision", sql`${tabla.estadoDecision} in ('decidido', 'por_decidir')`),
		// Según su tipo va lleno su valor y los demás en nulo; vacío solo si lo permite.
		check(
			"parametros_valor_de_su_tipo",
			sql`(${tabla.tipoValor} in ('entero', 'centavos')
				and ${tabla.valorPorcentaje} is null and ${tabla.valorTexto} is null and ${tabla.valorBooleano} is null
				and (${tabla.valorEntero} is not null or ${tabla.permiteVacio}))
			or (${tabla.tipoValor} = 'porcentaje'
				and ${tabla.valorEntero} is null and ${tabla.valorTexto} is null and ${tabla.valorBooleano} is null
				and (${tabla.valorPorcentaje} is not null or ${tabla.permiteVacio}))
			or (${tabla.tipoValor} in ('opcion', 'texto', 'hora')
				and ${tabla.valorEntero} is null and ${tabla.valorPorcentaje} is null and ${tabla.valorBooleano} is null
				and (${tabla.valorTexto} is not null or ${tabla.permiteVacio}))
			or (${tabla.tipoValor} = 'booleano'
				and ${tabla.valorEntero} is null and ${tabla.valorPorcentaje} is null and ${tabla.valorTexto} is null
				and (${tabla.valorBooleano} is not null or ${tabla.permiteVacio}))`,
		),
	],
);

/** Cada valor que tuvo un parámetro y desde cuándo. Solo crece. */
export const parametrosHistorial = pgTable(
	"parametros_historial",
	{
		id: uuid("id").primaryKey(),
		parametroId: uuid("parametro_id")
			.notNull()
			.references(() => parametros.id),
		valorAnterior: text("valor_anterior"),
		valorNuevo: text("valor_nuevo").notNull(),
		creadoEn: momento("creado_en").notNull().defaultNow(),
		/** @llavePendiente usuarios.id */
		creadoPor: uuid("creado_por"),
	},
	(tabla) => [index("parametros_historial_parametro").on(tabla.parametroId, tabla.creadoEn.desc())],
);

/** Las listas sencillas que el usuario agrega: categorías de gasto, unidades de material… */
export const listas = pgTable(
	"listas",
	{
		id: uuid("id").primaryKey(),
		clave: text("clave").notNull(),
		nombre: text("nombre").notNull(),
		modulo: text("modulo").notNull(),
		soloDuenaAgrega: boolean("solo_duena_agrega").notNull().default(true),
		bajaA: text("baja_a").array().notNull().default(sql`'{}'`),
		...columnasComunes(),
	},
	(tabla) => [uniqueIndex("listas_clave").on(tabla.clave)],
);

/** Las columnas de baja sin `reactivado_en`: un valor de lista dado de baja no se reactiva. */
function bajaSinReactivar() {
	const { bajaEn, bajaPor, motivoBaja } = columnasDeBaja();
	return { bajaEn, bajaPor, motivoBaja };
}

/** Los valores de una lista: lo nuevo queda al final, y no se renombran ni se quitan. */
export const listaValores = pgTable(
	"lista_valores",
	{
		id: uuid("id").primaryKey(),
		listaId: uuid("lista_id")
			.notNull()
			.references(() => listas.id),
		nombre: text("nombre").notNull(),
		nombreNormalizado: text("nombre_normalizado").notNull(),
		clave: text("clave"),
		seleccionable: boolean("seleccionable").notNull().default(true),
		seCuentaEntera: boolean("se_cuenta_entera"),
		orden: integer("orden").notNull(),
		...bajaSinReactivar(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("lista_valores_nombre").on(tabla.listaId, tabla.nombreNormalizado),
		uniqueIndex("lista_valores_clave").on(tabla.listaId, tabla.clave),
	],
);

/** Los datos de la empresa que salen en las hojas y el ticket. Un solo renglón. */
export const empresa = pgTable(
	"empresa",
	{
		id: uuid("id").primaryKey(),
		unica: boolean("unica").notNull().default(true),
		razonSocial: text("razon_social").notNull(),
		nombreComercial: text("nombre_comercial").notNull(),
		rfc: text("rfc").notNull(),
		domicilio: text("domicilio").notNull(),
		...columnasComunes(),
	},
	(tabla) => [uniqueIndex("empresa_unica").on(tabla.unica), check("empresa_solo_una", sql`${tabla.unica}`)],
);

/** Los módulos del sistema y `sistema`: los que pueden escribir en la bitácora. */
export const modulosDeLaBitacora = [
	"admin",
	"personal",
	"direccion",
	"catalogo",
	"patronaje",
	"compras",
	"ventas",
	"produccion",
	"calidad",
	"mantenimiento",
	"inventario",
	"contaduria",
	"linea",
	"sistema",
] as const;

/**
 * Todo lo que pasa en el sistema: cambios, accesos y consultas sensibles. Solo crece. Se parte por mes
 * (`ocurrido_en`) en la migración.
 */
export const bitacora = pgTable(
	"bitacora",
	{
		id: uuid("id").notNull(),
		ocurridoEn: momento("ocurrido_en").notNull().defaultNow(),
		tipo: text("tipo").notNull(),
		esAlerta: boolean("es_alerta").notNull().default(false),
		/** @llavePendiente usuarios.id */
		usuarioId: uuid("usuario_id"),
		/** @llavePendiente personas.id */
		personaId: uuid("persona_id"),
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		/** @llavePendiente sesiones.id */
		sesionId: uuid("sesion_id"),
		comandoId: uuid("comando_id"),
		correoIntento: text("correo_intento"),
		/** @llavePendiente departamentos.id */
		departamentoId: uuid("departamento_id"),
		modulo: text("modulo").notNull(),
		origen: text("origen").notNull(),
		accion: text("accion").notNull(),
		descripcion: text("descripcion").notNull(),
		descripcionRecortada: text("descripcion_recortada"),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		entidadFolio: text("entidad_folio"),
		antes: jsonb("antes"),
		despues: jsonb("despues"),
		sensibleSueldos: boolean("sensible_sueldos").notNull().default(false),
		mismaPersona: boolean("misma_persona").notNull().default(false),
		confirmadoConGoogleEn: momento("confirmado_con_google_en"),
		ip: inet("ip"),
	},
	(tabla) => [
		primaryKey({ columns: [tabla.id, tabla.ocurridoEn] }),
		index("bitacora_ocurrido").on(tabla.ocurridoEn.desc()),
		index("bitacora_entidad").on(tabla.entidad, tabla.entidadId, tabla.ocurridoEn.desc()),
		index("bitacora_usuario").on(tabla.usuarioId, tabla.ocurridoEn.desc()),
		index("bitacora_persona").on(tabla.personaId, tabla.ocurridoEn.desc()),
		index("bitacora_tipo").on(tabla.tipo, tabla.ocurridoEn.desc()),
		index("bitacora_alertas").on(tabla.ocurridoEn.desc()).where(sql`${tabla.esAlerta}`),
		check("bitacora_tipo", sql`${tabla.tipo} in ('cambio', 'acceso', 'consulta_sensible')`),
		check("bitacora_modulo", sql.raw(`modulo in (${modulosDeLaBitacora.map((modulo) => `'${modulo}'`).join(", ")})`)),
		check(
			"bitacora_origen",
			sql`${tabla.origen} in ('fabrica', 'tienda', 'tablet', 'panel_linea', 'servidor_linea', 'sistema')`,
		),
	],
);

/** Los tipos de aviso del núcleo; cada módulo que agrega los suyos los suma al CHECK en su migración. */
export const tiposDeAvisoDelNucleo = [
	"autorizacion_pedida",
	"autorizacion_decidida",
	"alerta_seguridad",
	"dispositivo_sin_sincronizar",
	"alerta_direccion",
	"restauracion_por_probar",
	"respaldo_fallido",
	"pin_bloqueado",
	"trabajo_fallido",
] as const;

/** Lo que una persona tiene que saber: un aviso por cuenta, en su campana y, si su tipo lo pide, por correo. */
export const avisos = pgTable(
	"avisos",
	{
		id: uuid("id").primaryKey(),
		/** @llavePendiente usuarios.id */
		usuarioId: uuid("usuario_id").notNull(),
		tipo: text("tipo").notNull(),
		texto: text("texto").notNull(),
		enlace: text("enlace"),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		eventoId: uuid("evento_id"),
		leidoEn: momento("leido_en"),
		porCorreo: boolean("por_correo").notNull(),
		correoEnviadoEn: momento("correo_enviado_en"),
		correoIntentos: smallint("correo_intentos").notNull().default(0),
		correoError: text("correo_error"),
		creadoEn: momento("creado_en").notNull().defaultNow(),
		actualizadoEn: momento("actualizado_en"),
	},
	(tabla) => [
		index("avisos_sin_leer").on(tabla.usuarioId, tabla.creadoEn.desc()).where(sql`${tabla.leidoEn} is null`),
		index("avisos_correo_pendiente")
			.on(tabla.creadoEn)
			.where(sql`${tabla.porCorreo} and ${tabla.correoEnviadoEn} is null`),
		check("avisos_tipo", sql.raw(`tipo in (${tiposDeAvisoDelNucleo.map((tipo) => `'${tipo}'`).join(", ")})`)),
	],
);

/** Los propósitos de un archivo: de ellos salen los tipos que acepta. */
export const propositosDeArchivo = [
	"foto",
	"comprobante",
	"documento_contador",
	"factura_proveedor",
	"etiqueta",
	"guia",
	"pdf_documento",
	"evidencia_restauracion",
] as const;

/** El registro de cada archivo que vive en R2: la base no guarda el contenido. */
export const archivos = pgTable(
	"archivos",
	{
		id: uuid("id").primaryKey(),
		proposito: text("proposito").notNull(),
		modulo: text("modulo").notNull(),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		nombreOriginal: text("nombre_original").notNull(),
		tipoMime: text("tipo_mime").notNull(),
		tamanoBytes: bigint("tamano_bytes", { mode: "number" }).notNull(),
		sha256: text("sha256").notNull(),
		almacenClave: text("almacen_clave").notNull(),
		subidoEn: momento("subido_en"),
		...columnasDeAparato(),
		...bajaSinReactivar(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("archivos_almacen_clave").on(tabla.almacenClave),
		index("archivos_entidad").on(tabla.entidad, tabla.entidadId),
		index("archivos_sha256").on(tabla.sha256),
		check("archivos_proposito", sql.raw(`proposito in (${propositosDeArchivo.map((p) => `'${p}'`).join(", ")})`)),
	],
);

/** Cada impresora de etiquetas: de una ubicación, con su programa puente (uno por impresora). */
export const impresoras = pgTable(
	"impresoras",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		modelo: text("modelo").notNull(),
		ubicacionId: uuid("ubicacion_id")
			.notNull()
			.references(() => ubicaciones.id),
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		...bajaSinReactivar(),
		...columnasComunes(),
	},
	// Un puente atiende una sola impresora sin baja.
	(tabla) => [
		uniqueIndex("impresoras_un_puente")
			.on(tabla.dispositivoId)
			.where(sql`${tabla.dispositivoId} is not null and ${tabla.bajaEn} is null`),
	],
);

/** Cada trabajo de impresión: de `por_imprimir` a `mandado` y a `impreso` o `fallo`. */
export const trabajosImpresion = pgTable(
	"trabajos_impresion",
	{
		id: uuid("id").primaryKey(),
		impresoraId: uuid("impresora_id")
			.notNull()
			.references(() => impresoras.id),
		tipo: text("tipo").notNull(),
		ids: uuid("ids").array().notNull(),
		copias: smallint("copias").notNull(),
		estado: text("estado").notNull(),
		mandadoEn: momento("mandado_en"),
		terminadoEn: momento("terminado_en"),
		error: text("error"),
		/** @llavePendiente usuarios.id */
		pedidoPor: uuid("pedido_por"),
		/** @llavePendiente sesiones.id */
		sesionId: uuid("sesion_id"),
		...columnasComunes(),
	},
	(tabla) => [
		index("trabajos_impresion_por_imprimir")
			.on(tabla.impresoraId, tabla.creadoEn)
			.where(sql`${tabla.estado} = 'por_imprimir'`),
		check("trabajos_impresion_estado", sql`${tabla.estado} in ('por_imprimir', 'mandado', 'impreso', 'fallo')`),
		check("trabajos_impresion_error", sql`${tabla.estado} <> 'fallo' or ${tabla.error} is not null`),
		check("trabajos_impresion_copias", sql`${tabla.copias} >= 1`),
	],
);

/** Cada respaldo semanal, correcto o fallido. Solo crece; lo escribe el sistema. */
export const respaldos = pgTable(
	"respaldos",
	{
		id: uuid("id").primaryKey(),
		hechoEn: momento("hecho_en").notNull(),
		estado: text("estado").notNull(),
		tamanoBytes: bigint("tamano_bytes", { mode: "number" }),
		cifrado: boolean("cifrado").notNull(),
		destino: text("destino").notNull(),
		sha256: text("sha256"),
		error: text("error"),
		creadoEn: momento("creado_en").notNull().defaultNow(),
	},
	(tabla) => [
		index("respaldos_hecho").on(tabla.hechoEn.desc()),
		check("respaldos_estado", sql`${tabla.estado} in ('correcto', 'fallido')`),
	],
);

/** Cada prueba de restauración, con su evidencia. */
export const restauracionesProbadas = pgTable(
	"restauraciones_probadas",
	{
		id: uuid("id").primaryKey(),
		probadaEn: momento("probada_en").notNull(),
		tipo: text("tipo").notNull(),
		respaldoId: uuid("respaldo_id").references(() => respaldos.id),
		puntoRestauradoEn: momento("punto_restaurado_en"),
		ambiente: text("ambiente").notNull().default("pruebas"),
		conteosCuadraron: boolean("conteos_cuadraron").notNull(),
		conteos: jsonb("conteos"),
		evidenciaArchivoId: uuid("evidencia_archivo_id")
			.notNull()
			.references(() => archivos.id),
		nota: text("nota"),
		...columnasComunes(),
	},
	(tabla) => [
		index("restauraciones_probadas_probada").on(tabla.probadaEn.desc()),
		check("restauraciones_probadas_tipo", sql`${tabla.tipo} in ('semanal_externo', 'punto_en_el_tiempo')`),
		check("restauraciones_probadas_ambiente", sql`${tabla.ambiente} in ('pruebas')`),
		check(
			"restauraciones_probadas_de_su_tipo",
			sql`(${tabla.tipo} = 'semanal_externo' and ${tabla.respaldoId} is not null)
			or (${tabla.tipo} = 'punto_en_el_tiempo' and ${tabla.puntoRestauradoEn} is not null)`,
		),
		check("restauraciones_probadas_quien", sql`${tabla.creadoPor} is not null`),
	],
);
