CREATE TABLE "escuelas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"municipio" text NOT NULL,
	"color" text NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "escuelas_nombre" CHECK (char_length("escuelas"."nombre") between 4 and 80),
	CONSTRAINT "escuelas_municipio" CHECK (char_length("escuelas"."municipio") between 3 and 60),
	CONSTRAINT "escuelas_color" CHECK ("escuelas"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "grupos_talla" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "grupos_talla_nombre" CHECK (char_length("grupos_talla"."nombre") between 3 and 40)
);
--> statement-breakpoint
CREATE TABLE "secciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"lleva_receta" boolean DEFAULT true NOT NULL,
	"tipo_prenda_defecto_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "secciones_nombre" CHECK (char_length("secciones"."nombre") between 3 and 40)
);
--> statement-breakpoint
CREATE TABLE "tallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"grupo_talla_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "tallas_nombre" CHECK (char_length("tallas"."nombre") between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "tipo_prenda_medidas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo_prenda_id" uuid NOT NULL,
	"medida" text NOT NULL,
	"orden" integer NOT NULL,
	"talla_id" uuid NOT NULL,
	"valor_cm" numeric(12, 3),
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "tipo_prenda_medidas_medida" CHECK (char_length("tipo_prenda_medidas"."medida") >= 3)
);
--> statement-breakpoint
CREATE TABLE "tipos_prenda" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"seccion_id" uuid NOT NULL,
	"flujo_defecto_id" uuid,
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "tipos_prenda_nombre" CHECK (char_length("tipos_prenda"."nombre") between 3 and 40)
);
--> statement-breakpoint
ALTER TABLE "escuelas" ADD CONSTRAINT "escuelas_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escuelas" ADD CONSTRAINT "escuelas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_talla" ADD CONSTRAINT "grupos_talla_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_talla" ADD CONSTRAINT "grupos_talla_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secciones" ADD CONSTRAINT "secciones_tipo_prenda_defecto_id_tipos_prenda_id_fk" FOREIGN KEY ("tipo_prenda_defecto_id") REFERENCES "public"."tipos_prenda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secciones" ADD CONSTRAINT "secciones_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secciones" ADD CONSTRAINT "secciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tallas" ADD CONSTRAINT "tallas_grupo_talla_id_grupos_talla_id_fk" FOREIGN KEY ("grupo_talla_id") REFERENCES "public"."grupos_talla"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tallas" ADD CONSTRAINT "tallas_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tallas" ADD CONSTRAINT "tallas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_prenda_medidas" ADD CONSTRAINT "tipo_prenda_medidas_tipo_prenda_id_tipos_prenda_id_fk" FOREIGN KEY ("tipo_prenda_id") REFERENCES "public"."tipos_prenda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_prenda_medidas" ADD CONSTRAINT "tipo_prenda_medidas_talla_id_tallas_id_fk" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_prenda_medidas" ADD CONSTRAINT "tipo_prenda_medidas_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_prenda_medidas" ADD CONSTRAINT "tipo_prenda_medidas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_prenda" ADD CONSTRAINT "tipos_prenda_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "public"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_prenda" ADD CONSTRAINT "tipos_prenda_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_prenda" ADD CONSTRAINT "tipos_prenda_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escuelas_nombre_municipio" ON "escuelas" USING btree (sin_acentos("nombre"),sin_acentos("municipio"));--> statement-breakpoint
CREATE INDEX "escuelas_version" ON "escuelas" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "grupos_talla_nombre" ON "grupos_talla" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "secciones_nombre" ON "secciones" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "tallas_grupo_nombre" ON "tallas" USING btree ("grupo_talla_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "tallas_xid_escritura" ON "tallas" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_prenda_medidas_vigente" ON "tipo_prenda_medidas" USING btree ("tipo_prenda_id",lower("medida"),"talla_id") WHERE "tipo_prenda_medidas"."baja_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_prenda_nombre" ON "tipos_prenda" USING btree (lower("nombre"));--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; las tallas bajan a la tablet, así que llevan `xid_escritura`.
SELECT poner_disparador_comun('escuelas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('secciones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('grupos_talla', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('tallas', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('tipos_prenda', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('tipo_prenda_medidas', baja_a_aparatos => false);
