CREATE TABLE "material_proveedores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"material_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"ultimo_precio_centavos" bigint NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "material_proveedores_precio" CHECK ("material_proveedores"."ultimo_precio_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "materiales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"tipo" text NOT NULL,
	"unidad" text NOT NULL,
	"presentacion" text,
	"unidad_receta" text,
	"factor_receta" numeric(12, 3),
	"unidad_tablet" text,
	"factor_tablet" numeric(12, 3),
	"color" text,
	"minimo" numeric(12, 3) DEFAULT '0' NOT NULL,
	"multiplo_compra" numeric(12, 3) DEFAULT '1' NOT NULL,
	"dias_cubre" integer NOT NULL,
	"consumo_diario_inicial" numeric(12, 3),
	"proveedor_habitual_id" uuid NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "materiales_nombre" CHECK (char_length("materiales"."nombre") between 3 and 80),
	CONSTRAINT "materiales_tipo" CHECK ("materiales"."tipo" in ('tela', 'avio', 'consumible')),
	CONSTRAINT "materiales_tela_en_metros" CHECK ("materiales"."tipo" <> 'tela' or "materiales"."unidad" = 'm'),
	CONSTRAINT "materiales_presentacion" CHECK (char_length("materiales"."presentacion") <= 60),
	CONSTRAINT "materiales_unidad_receta" CHECK ("materiales"."unidad_receta" in ('m', 'cm', 'pza')),
	CONSTRAINT "materiales_factor_receta" CHECK (("materiales"."unidad_receta" is null) = ("materiales"."factor_receta" is null)),
	CONSTRAINT "materiales_factor_receta_positivo" CHECK ("materiales"."factor_receta" > 0),
	CONSTRAINT "materiales_tablet_consumible" CHECK ("materiales"."unidad_tablet" is null or "materiales"."tipo" = 'consumible'),
	CONSTRAINT "materiales_factor_tablet" CHECK (("materiales"."unidad_tablet" is null) = ("materiales"."factor_tablet" is null)),
	CONSTRAINT "materiales_factor_tablet_positivo" CHECK ("materiales"."factor_tablet" > 0),
	CONSTRAINT "materiales_color" CHECK ("materiales"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "materiales_minimo" CHECK ("materiales"."minimo" >= 0),
	CONSTRAINT "materiales_multiplo_compra" CHECK ("materiales"."multiplo_compra" > 0),
	CONSTRAINT "materiales_dias_cubre" CHECK ("materiales"."dias_cubre" > 0),
	CONSTRAINT "materiales_consumo" CHECK ("materiales"."consumo_diario_inicial" >= 0)
);
--> statement-breakpoint
CREATE TABLE "precios_compra" (
	"id" uuid PRIMARY KEY NOT NULL,
	"material_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"precio_centavos" bigint NOT NULL,
	"origen" text NOT NULL,
	"orden_compra_id" uuid,
	"orden_compra_linea_id" uuid,
	"precio_anterior_centavos" bigint,
	"cambio_porcentaje" numeric(6, 3),
	"fecha" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "precios_compra_precio" CHECK ("precios_compra"."precio_centavos" > 0),
	CONSTRAINT "precios_compra_origen" CHECK ("precios_compra"."origen" in ('alta', 'proveedor_agregado', 'orden', 'nota')),
	CONSTRAINT "precios_compra_orden" CHECK (("precios_compra"."origen" in ('orden', 'nota')) = ("precios_compra"."orden_compra_id" is not null and "precios_compra"."orden_compra_linea_id" is not null)),
	CONSTRAINT "precios_compra_cambio" CHECK (("precios_compra"."precio_anterior_centavos" is null) = ("precios_compra"."cambio_porcentaje" is null))
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tercero_id" uuid NOT NULL,
	"ciudad" text NOT NULL,
	"telefono" text NOT NULL,
	"dias_credito" integer NOT NULL,
	"dias_dice_tardar" integer NOT NULL,
	"surte" text,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "proveedores_ciudad" CHECK (char_length("proveedores"."ciudad") between 2 and 60),
	CONSTRAINT "proveedores_telefono" CHECK ("proveedores"."telefono" ~ '^[0-9]{10}$'),
	CONSTRAINT "proveedores_dias_credito" CHECK ("proveedores"."dias_credito" >= 0),
	CONSTRAINT "proveedores_dias_dice_tardar" CHECK ("proveedores"."dias_dice_tardar" > 0),
	CONSTRAINT "proveedores_surte" CHECK (char_length("proveedores"."surte") <= 120)
);
--> statement-breakpoint
CREATE TABLE "terceros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nombre_busqueda" text NOT NULL,
	"clase" text,
	"es_cliente" boolean DEFAULT false NOT NULL,
	"es_proveedor" boolean DEFAULT false NOT NULL,
	"es_acreedor" boolean DEFAULT false NOT NULL,
	"rfc" text,
	"telefono" text,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "terceros_nombre" CHECK (char_length("terceros"."nombre") between 3 and 120),
	CONSTRAINT "terceros_clase" CHECK ("terceros"."clase" in ('persona', 'empresa', 'banco')),
	CONSTRAINT "terceros_un_rol" CHECK ("terceros"."es_cliente" or "terceros"."es_proveedor" or "terceros"."es_acreedor"),
	CONSTRAINT "terceros_rfc" CHECK ("terceros"."rfc" ~ '^[A-ZÑ&0-9]{12,13}$')
);
--> statement-breakpoint
ALTER TABLE "material_proveedores" ADD CONSTRAINT "material_proveedores_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_proveedores" ADD CONSTRAINT "material_proveedores_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_proveedores" ADD CONSTRAINT "material_proveedores_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_proveedores" ADD CONSTRAINT "material_proveedores_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_proveedor_habitual_id_proveedores_id_fk" FOREIGN KEY ("proveedor_habitual_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_compra" ADD CONSTRAINT "precios_compra_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_compra" ADD CONSTRAINT "precios_compra_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_compra" ADD CONSTRAINT "precios_compra_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terceros" ADD CONSTRAINT "terceros_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "material_proveedores_par" ON "material_proveedores" USING btree ("material_id","proveedor_id");--> statement-breakpoint
CREATE INDEX "material_proveedores_proveedor" ON "material_proveedores" USING btree ("proveedor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materiales_nombre" ON "materiales" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX "materiales_tipo" ON "materiales" USING btree ("tipo") WHERE "materiales"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "materiales_proveedor_habitual" ON "materiales" USING btree ("proveedor_habitual_id");--> statement-breakpoint
CREATE INDEX "precios_compra_material" ON "precios_compra" USING btree ("material_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "precios_compra_par" ON "precios_compra" USING btree ("material_id","proveedor_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "proveedores_tercero" ON "proveedores" USING btree ("tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terceros_nombre_busqueda" ON "terceros" USING btree ("nombre_busqueda");--> statement-breakpoint
CREATE INDEX "terceros_rfc" ON "terceros" USING btree ("rfc");--> statement-breakpoint
ALTER TABLE "existencias_material" ADD CONSTRAINT "existencias_material_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los materiales bajan a la tablet (los
-- consumibles) con su `xid_escritura`; el historial de precios solo crece.
SELECT poner_disparador_comun('terceros', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('proveedores', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('materiales', baja_a_aparatos => true);--> statement-breakpoint
SELECT poner_disparador_comun('material_proveedores', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('precios_compra', baja_a_aparatos => false);--> statement-breakpoint
SELECT marcar_solo_crece('precios_compra');
