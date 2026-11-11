CREATE TABLE "categorias_mayoreo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text NOT NULL,
	"porcentaje_que_aplica" text NOT NULL,
	"defecto_para" text,
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_mayoreo_aplica" CHECK ("categorias_mayoreo"."porcentaje_que_aplica" in ('basicos', 'especiales', 'ninguno')),
	CONSTRAINT "categorias_mayoreo_defecto" CHECK ("categorias_mayoreo"."defecto_para" is null or "categorias_mayoreo"."defecto_para" in ('con_escuela', 'sin_escuela'))
);
--> statement-breakpoint
CREATE TABLE "listas_precios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"nombre_corto" text,
	"descripcion" text,
	"cliente_id" uuid,
	"pct_basicos" numeric(6, 3),
	"pct_especiales" numeric(6, 3),
	"orden" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "listas_precios_tipo" CHECK ("listas_precios"."tipo" in ('mostrador', 'mayoreo', 'en_linea', 'cliente')),
	CONSTRAINT "listas_precios_cliente" CHECK (("listas_precios"."tipo" = 'cliente') = ("listas_precios"."cliente_id" is not null)),
	CONSTRAINT "listas_precios_porcentajes" CHECK (("listas_precios"."tipo" = 'cliente' or ("listas_precios"."pct_basicos" is null and "listas_precios"."pct_especiales" is null)) and ("listas_precios"."pct_basicos" is null or "listas_precios"."pct_basicos" between 0 and 100) and ("listas_precios"."pct_especiales" is null or "listas_precios"."pct_especiales" between 0 and 100))
);
--> statement-breakpoint
ALTER TABLE "categorias_mayoreo" ADD CONSTRAINT "categorias_mayoreo_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_mayoreo" ADD CONSTRAINT "categorias_mayoreo_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_mayoreo_nombre" ON "categorias_mayoreo" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_mayoreo_defecto" ON "categorias_mayoreo" USING btree ("defecto_para") WHERE "categorias_mayoreo"."defecto_para" is not null;--> statement-breakpoint
CREATE INDEX "categorias_mayoreo_version" ON "categorias_mayoreo" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "listas_precios_nombre" ON "listas_precios" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "listas_precios_general" ON "listas_precios" USING btree ("tipo") WHERE "listas_precios"."tipo" <> 'cliente' and "listas_precios"."baja_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "listas_precios_cliente" ON "listas_precios" USING btree ("cliente_id") WHERE "listas_precios"."cliente_id" is not null;--> statement-breakpoint
CREATE INDEX "listas_precios_version" ON "listas_precios" USING btree ("version");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes las pone el disparador.
SELECT poner_disparador_comun('listas_precios', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('categorias_mayoreo', baja_a_aparatos => false);
