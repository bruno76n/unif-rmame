CREATE TABLE "precios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lista_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"variante_id" uuid,
	"precio_centavos" bigint NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"fin_motivo" text,
	"origen" text NOT NULL,
	"confirmado_con_google_en" timestamp with time zone,
	"dispositivo_id" uuid,
	"usuario_panel_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "precios_precio" CHECK ("precios"."precio_centavos" > 0 and "precios"."precio_centavos" % 100 = 0),
	CONSTRAINT "precios_fin" CHECK (("precios"."vigente_hasta" is null) = ("precios"."fin_motivo" is null)),
	CONSTRAINT "precios_fin_motivo" CHECK ("precios"."fin_motivo" is null or "precios"."fin_motivo" in ('reemplazado', 'quitado')),
	CONSTRAINT "precios_origen" CHECK ("precios"."origen" in ('alta_producto', 'ficha', 'cambio_en_bloque', 'tienda_en_linea', 'panel_uniformame', 'migracion')),
	CONSTRAINT "precios_bloque" CHECK ("precios"."origen" <> 'cambio_en_bloque' or "precios"."confirmado_con_google_en" is not null),
	CONSTRAINT "precios_panel" CHECK ("precios"."origen" <> 'panel_uniformame' or "precios"."usuario_panel_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"seccion_id" uuid NOT NULL,
	"escuela_id" uuid,
	"tipo_prenda_id" uuid,
	"flujo_id" uuid,
	"categoria_mayoreo_id" uuid NOT NULL,
	"es_servicio" boolean DEFAULT false NOT NULL,
	"canal_mostrador" boolean NOT NULL,
	"canal_en_linea" boolean NOT NULL,
	"canal_externos" boolean NOT NULL,
	"recargo_pedido_especial_centavos" bigint NOT NULL,
	"foto_archivo_id" uuid,
	"producto_base_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "productos_nombre" CHECK (char_length("productos"."nombre") between 4 and 80),
	CONSTRAINT "productos_en_linea" CHECK (not "productos"."canal_en_linea" or ("productos"."escuela_id" is null and not "productos"."es_servicio")),
	CONSTRAINT "productos_canal" CHECK ("productos"."baja_en" is not null or "productos"."canal_mostrador" or "productos"."canal_en_linea" or "productos"."canal_externos"),
	CONSTRAINT "productos_recargo" CHECK ("productos"."recargo_pedido_especial_centavos" >= 0 and "productos"."recargo_pedido_especial_centavos" % 100 = 0)
);
--> statement-breakpoint
CREATE TABLE "variantes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"producto_id" uuid NOT NULL,
	"talla_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"codigo_migrado_de_tienda" boolean DEFAULT false NOT NULL,
	"es_pedido_especial" boolean DEFAULT false NOT NULL,
	"estado_etiqueta" text NOT NULL,
	"etiqueta_impresa_en" timestamp with time zone,
	"etiqueta_impresa_por" uuid,
	"reimprimir_desde" timestamp with time zone,
	"descontinuada_en" timestamp with time zone,
	"descontinuada_por" uuid,
	"motivo_descontinuada" text,
	"reactivada_en" timestamp with time zone,
	"reactivada_por" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "variantes_codigo" CHECK ("variantes"."codigo" ~ '^[0-9]{6}$'),
	CONSTRAINT "variantes_codigo_migrado" CHECK (("variantes"."codigo_migrado_de_tienda" and "variantes"."codigo"::int between 500001 and 599999) or (not "variantes"."codigo_migrado_de_tienda" and "variantes"."codigo"::int between 100001 and 499999)),
	CONSTRAINT "variantes_estado_etiqueta" CHECK ("variantes"."estado_etiqueta" in ('por_imprimir', 'impresa', 'por_reimprimir', 'al_fabricar')),
	CONSTRAINT "variantes_al_fabricar" CHECK (("variantes"."estado_etiqueta" = 'al_fabricar') = "variantes"."es_pedido_especial"),
	CONSTRAINT "variantes_impresa" CHECK ("variantes"."estado_etiqueta" not in ('impresa', 'por_reimprimir') or "variantes"."etiqueta_impresa_en" is not null),
	CONSTRAINT "variantes_reimprimir" CHECK (("variantes"."estado_etiqueta" = 'por_reimprimir') = ("variantes"."reimprimir_desde" is not null)),
	CONSTRAINT "variantes_descontinuada" CHECK (("variantes"."descontinuada_en" is null) = ("variantes"."motivo_descontinuada" is null)),
	CONSTRAINT "variantes_baja" CHECK (("variantes"."baja_en" is null) = ("variantes"."motivo_baja" is null))
);
--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_lista_id_listas_precios_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."listas_precios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "public"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_escuela_id_escuelas_id_fk" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_tipo_prenda_id_tipos_prenda_id_fk" FOREIGN KEY ("tipo_prenda_id") REFERENCES "public"."tipos_prenda"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_mayoreo_id_categorias_mayoreo_id_fk" FOREIGN KEY ("categoria_mayoreo_id") REFERENCES "public"."categorias_mayoreo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_foto_archivo_id_archivos_id_fk" FOREIGN KEY ("foto_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_producto_base_id_productos_id_fk" FOREIGN KEY ("producto_base_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_talla_id_tallas_id_fk" FOREIGN KEY ("talla_id") REFERENCES "public"."tallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_etiqueta_impresa_por_usuarios_id_fk" FOREIGN KEY ("etiqueta_impresa_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_descontinuada_por_usuarios_id_fk" FOREIGN KEY ("descontinuada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_reactivada_por_usuarios_id_fk" FOREIGN KEY ("reactivada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "precios_vigente" ON "precios" USING btree ("lista_id","producto_id",coalesce("variante_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "precios"."vigente_hasta" is null;--> statement-breakpoint
CREATE INDEX "precios_historial" ON "precios" USING btree ("producto_id","lista_id","vigente_desde" desc);--> statement-breakpoint
CREATE INDEX "precios_version" ON "precios" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_nombre_escuela" ON "productos" USING btree (lower("nombre"),coalesce("escuela_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "productos_seccion" ON "productos" USING btree ("seccion_id") WHERE "productos"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "productos_escuela" ON "productos" USING btree ("escuela_id");--> statement-breakpoint
CREATE INDEX "productos_version" ON "productos" USING btree ("version");--> statement-breakpoint
CREATE INDEX "productos_xid_escritura" ON "productos" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "variantes_codigo" ON "variantes" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "variantes_id_producto" ON "variantes" USING btree ("id","producto_id");--> statement-breakpoint
-- Después del único de `variantes` (`id`, `producto_id`), que la llave compuesta necesita.
ALTER TABLE "precios" ADD CONSTRAINT "precios_variante_del_producto" FOREIGN KEY ("variante_id","producto_id") REFERENCES "public"."variantes"("id","producto_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "variantes_producto_talla" ON "variantes" USING btree ("producto_id","talla_id") WHERE "variantes"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "variantes_producto" ON "variantes" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "variantes_por_etiquetar" ON "variantes" USING btree ("producto_id") WHERE "variantes"."estado_etiqueta" in ('por_imprimir', 'por_reimprimir') and "variantes"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "variantes_version" ON "variantes" USING btree ("version");--> statement-breakpoint
CREATE INDEX "variantes_xid_escritura" ON "variantes" USING btree ("xid_escritura");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los productos y las variantes bajan a la tablet.
SELECT poner_disparador_comun('productos', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('variantes', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('precios', baja_a_aparatos => false);
--> statement-breakpoint
-- Escrito a mano (docs/modulos/catalogo/precios.md): un precio no se cambia, se cierra y se crea otro. La app
-- solo puede llenar su fin, y un precio cerrado ya no cambia.
REVOKE UPDATE ON precios FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (vigente_hasta, fin_motivo, actualizado_en) ON precios TO uniformame_app;
--> statement-breakpoint
CREATE FUNCTION solo_cerrar_precio() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
BEGIN
	IF OLD.vigente_hasta IS NOT NULL THEN
		RAISE EXCEPTION 'un precio cerrado no cambia' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER solo_cerrar_precio BEFORE UPDATE ON precios FOR EACH ROW EXECUTE FUNCTION solo_cerrar_precio();
