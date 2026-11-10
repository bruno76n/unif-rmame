CREATE TABLE "contadores_folio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"alcance" text DEFAULT '' NOT NULL,
	"prefijo" text NOT NULL,
	"siguiente" bigint NOT NULL,
	"digitos" smallint NOT NULL,
	"minimo" bigint DEFAULT 1 NOT NULL,
	"maximo" bigint,
	"asigna" text NOT NULL,
	"modulo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "contadores_folio_asigna" CHECK ("contadores_folio"."asigna" in ('servidor', 'aparato'))
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unica" boolean DEFAULT true NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_comercial" text NOT NULL,
	"rfc" text NOT NULL,
	"domicilio" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "empresa_solo_una" CHECK ("empresa"."unica")
);
--> statement-breakpoint
CREATE TABLE "lista_valores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lista_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"clave" text,
	"seleccionable" boolean DEFAULT true NOT NULL,
	"se_cuenta_entera" boolean,
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"nombre" text NOT NULL,
	"modulo" text NOT NULL,
	"solo_duena_agrega" boolean DEFAULT true NOT NULL,
	"baja_a" text[] DEFAULT '{}' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"ubicacion_id" uuid,
	"seccion" text NOT NULL,
	"nombre" text NOT NULL,
	"explicacion" text,
	"tipo_valor" text NOT NULL,
	"unidad" text,
	"valor_entero" bigint,
	"valor_porcentaje" numeric(6, 3),
	"valor_texto" text,
	"valor_booleano" boolean,
	"opciones" text[],
	"minimo" bigint,
	"maximo" bigint,
	"permite_vacio" boolean DEFAULT false NOT NULL,
	"estado_decision" text NOT NULL,
	"modulo_lector" text NOT NULL,
	"baja_a" text[] DEFAULT '{}' NOT NULL,
	"orden" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "parametros_clave_ubicacion" UNIQUE NULLS NOT DISTINCT("clave","ubicacion_id"),
	CONSTRAINT "parametros_seccion" CHECK ("parametros"."seccion" in ('decision_operacion', 'parametro', 'tecnico')),
	CONSTRAINT "parametros_tipo_valor" CHECK ("parametros"."tipo_valor" in ('entero', 'centavos', 'porcentaje', 'opcion', 'booleano', 'texto', 'hora')),
	CONSTRAINT "parametros_estado_decision" CHECK ("parametros"."estado_decision" in ('decidido', 'por_decidir')),
	CONSTRAINT "parametros_valor_de_su_tipo" CHECK (("parametros"."tipo_valor" in ('entero', 'centavos')
				and "parametros"."valor_porcentaje" is null and "parametros"."valor_texto" is null and "parametros"."valor_booleano" is null
				and ("parametros"."valor_entero" is not null or "parametros"."permite_vacio"))
			or ("parametros"."tipo_valor" = 'porcentaje'
				and "parametros"."valor_entero" is null and "parametros"."valor_texto" is null and "parametros"."valor_booleano" is null
				and ("parametros"."valor_porcentaje" is not null or "parametros"."permite_vacio"))
			or ("parametros"."tipo_valor" in ('opcion', 'texto', 'hora')
				and "parametros"."valor_entero" is null and "parametros"."valor_porcentaje" is null and "parametros"."valor_booleano" is null
				and ("parametros"."valor_texto" is not null or "parametros"."permite_vacio"))
			or ("parametros"."tipo_valor" = 'booleano'
				and "parametros"."valor_entero" is null and "parametros"."valor_porcentaje" is null and "parametros"."valor_texto" is null
				and ("parametros"."valor_booleano" is not null or "parametros"."permite_vacio")))
);
--> statement-breakpoint
CREATE TABLE "parametros_historial" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parametro_id" uuid NOT NULL,
	"valor_anterior" text,
	"valor_nuevo" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "ubicaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"responsable_persona_id" uuid,
	"prefijo_folio" text,
	"surte_en_linea" boolean DEFAULT false NOT NULL,
	"existencia_desde" timestamp with time zone,
	"orden" smallint NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ubicaciones_tipo" CHECK ("ubicaciones"."tipo" in ('aduana', 'bodega', 'tienda', 'taller', 'transito', 'en_camino_aduana'))
);
--> statement-breakpoint
ALTER TABLE "lista_valores" ADD CONSTRAINT "lista_valores_lista_id_listas_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."listas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros" ADD CONSTRAINT "parametros_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_historial" ADD CONSTRAINT "parametros_historial_parametro_id_parametros_id_fk" FOREIGN KEY ("parametro_id") REFERENCES "public"."parametros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contadores_folio_tipo_alcance" ON "contadores_folio" USING btree ("tipo","alcance");--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_unica" ON "empresa" USING btree ("unica");--> statement-breakpoint
CREATE UNIQUE INDEX "lista_valores_nombre" ON "lista_valores" USING btree ("lista_id","nombre_normalizado");--> statement-breakpoint
CREATE UNIQUE INDEX "lista_valores_clave" ON "lista_valores" USING btree ("lista_id","clave");--> statement-breakpoint
CREATE UNIQUE INDEX "listas_clave" ON "listas" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "parametros_xid_escritura" ON "parametros" USING btree ("xid_escritura");--> statement-breakpoint
CREATE INDEX "parametros_historial_parametro" ON "parametros_historial" USING btree ("parametro_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ubicaciones_codigo" ON "ubicaciones" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "ubicaciones_prefijo_folio" ON "ubicaciones" USING btree ("prefijo_folio");--> statement-breakpoint
CREATE UNIQUE INDEX "ubicaciones_una_por_tipo" ON "ubicaciones" USING btree ("tipo") WHERE "ubicaciones"."tipo" <> 'tienda' and "ubicaciones"."baja_en" is null;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): el disparador de las columnas comunes en cada tabla
-- de negocio; `parametros` baja a la tablet, así que lleva `xid_escritura`.
SELECT poner_disparador_comun('ubicaciones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('contadores_folio', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('parametros', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('listas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('lista_valores', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('empresa', baja_a_aparatos => false);
--> statement-breakpoint
-- El historial de los parámetros solo crece (docs/modulos/admin/configuracion.md).
SELECT marcar_solo_crece('parametros_historial');
