CREATE TABLE "receta_linea_tallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receta_linea_id" uuid NOT NULL,
	"talla_id" uuid NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "receta_linea_tallas_cantidad" CHECK ("receta_linea_tallas"."cantidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receta_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receta_version_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"material_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"unidad_receta" text NOT NULL,
	"cantidad" numeric(12, 3),
	"receta_por_unidad_inventario" numeric(12, 3) NOT NULL,
	"orden" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "receta_lineas_papel" CHECK ("receta_lineas"."papel" in ('tela_principal', 'combinacion', 'forro', 'avio')),
	CONSTRAINT "receta_lineas_modo" CHECK ("receta_lineas"."modo" in ('igual', 'por_talla')),
	CONSTRAINT "receta_lineas_unidad" CHECK ("receta_lineas"."unidad_receta" in ('m', 'cm', 'pza')),
	CONSTRAINT "receta_lineas_tela" CHECK ("receta_lineas"."papel" = 'avio' or ("receta_lineas"."modo" = 'por_talla' and "receta_lineas"."unidad_receta" = 'm')),
	CONSTRAINT "receta_lineas_cantidad" CHECK (("receta_lineas"."cantidad" is not null) = ("receta_lineas"."modo" = 'igual')),
	CONSTRAINT "receta_lineas_cantidad_positiva" CHECK ("receta_lineas"."cantidad" >= 0),
	CONSTRAINT "receta_lineas_conversion" CHECK ("receta_lineas"."receta_por_unidad_inventario" > 0)
);
--> statement-breakpoint
CREATE TABLE "receta_medidas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receta_version_id" uuid NOT NULL,
	"medida" text NOT NULL,
	"orden" integer NOT NULL,
	"talla_id" uuid NOT NULL,
	"valor_cm" numeric(12, 3) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "receta_medidas_medida" CHECK (char_length("receta_medidas"."medida") >= 3)
);
--> statement-breakpoint
CREATE TABLE "receta_versiones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receta_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"motivo" text NOT NULL,
	"copiada_de_version_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "receta_versiones_de_su_receta" UNIQUE("id","receta_id"),
	CONSTRAINT "receta_versiones_numero" CHECK ("receta_versiones"."numero" >= 1),
	CONSTRAINT "receta_versiones_motivo" CHECK (char_length("receta_versiones"."motivo") between 5 and 200)
);
--> statement-breakpoint
CREATE TABLE "recetas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producto_id" uuid NOT NULL,
	"estado" text DEFAULT 'sin_receta' NOT NULL,
	"version_vigente_id" uuid,
	"verificada_en" timestamp with time zone,
	"verificada_lote_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "recetas_estado" CHECK ("recetas"."estado" in ('sin_receta', 'sin_verificar', 'verificada')),
	CONSTRAINT "recetas_vigente" CHECK (("recetas"."version_vigente_id" is null) = ("recetas"."estado" = 'sin_receta')),
	CONSTRAINT "recetas_verificada" CHECK (("recetas"."verificada_en" is not null) = ("recetas"."estado" = 'verificada'))
);
--> statement-breakpoint
ALTER TABLE "receta_linea_tallas" ADD CONSTRAINT "receta_linea_tallas_receta_linea_id_receta_lineas_id_fk" FOREIGN KEY ("receta_linea_id") REFERENCES "public"."receta_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_linea_tallas" ADD CONSTRAINT "receta_linea_tallas_talla_id_tallas_id_fk" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_linea_tallas" ADD CONSTRAINT "receta_linea_tallas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_lineas" ADD CONSTRAINT "receta_lineas_receta_version_id_receta_versiones_id_fk" FOREIGN KEY ("receta_version_id") REFERENCES "public"."receta_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_lineas" ADD CONSTRAINT "receta_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_lineas" ADD CONSTRAINT "receta_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_medidas" ADD CONSTRAINT "receta_medidas_receta_version_id_receta_versiones_id_fk" FOREIGN KEY ("receta_version_id") REFERENCES "public"."receta_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_medidas" ADD CONSTRAINT "receta_medidas_talla_id_tallas_id_fk" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_medidas" ADD CONSTRAINT "receta_medidas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_versiones" ADD CONSTRAINT "receta_versiones_receta_id_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_versiones" ADD CONSTRAINT "receta_versiones_copiada_de_version_id_receta_versiones_id_fk" FOREIGN KEY ("copiada_de_version_id") REFERENCES "public"."receta_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_versiones" ADD CONSTRAINT "receta_versiones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_version_vigente" FOREIGN KEY ("version_vigente_id","id") REFERENCES "public"."receta_versiones"("id","receta_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receta_linea_tallas_talla" ON "receta_linea_tallas" USING btree ("receta_linea_id","talla_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receta_lineas_tela_principal" ON "receta_lineas" USING btree ("receta_version_id") WHERE "receta_lineas"."papel" = 'tela_principal';--> statement-breakpoint
CREATE UNIQUE INDEX "receta_lineas_material" ON "receta_lineas" USING btree ("receta_version_id","material_id");--> statement-breakpoint
CREATE INDEX "receta_lineas_material_usado" ON "receta_lineas" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receta_medidas_talla" ON "receta_medidas" USING btree ("receta_version_id",lower("medida"),"talla_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receta_versiones_numero" ON "receta_versiones" USING btree ("receta_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "recetas_producto" ON "recetas" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "recetas_estado" ON "recetas" USING btree ("estado");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; las versiones y lo que cuelga de ellas
-- solo crecen.
SELECT poner_disparador_comun('recetas', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('receta_versiones', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('receta_lineas', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('receta_linea_tallas', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('receta_medidas', baja_a_aparatos => false);--> statement-breakpoint
SELECT marcar_solo_crece('receta_versiones');--> statement-breakpoint
SELECT marcar_solo_crece('receta_lineas');--> statement-breakpoint
SELECT marcar_solo_crece('receta_linea_tallas');--> statement-breakpoint
SELECT marcar_solo_crece('receta_medidas');--> statement-breakpoint
-- Los productos que ya existían en una sección que lleva receta nacen con la suya, en «Sin receta» (docs/modulos/
-- patronaje/recetas.md, regla 1). Los servicios no llevan receta.
INSERT INTO recetas (id, producto_id)
SELECT uuidv7(), p.id FROM productos p JOIN secciones s ON s.id = p.seccion_id
WHERE s.lleva_receta AND NOT p.es_servicio
ON CONFLICT DO NOTHING;
