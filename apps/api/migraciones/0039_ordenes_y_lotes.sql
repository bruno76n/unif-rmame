CREATE TABLE "lote_tallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lote_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas_planeadas" integer NOT NULL,
	"piezas_cortadas" integer,
	"piezas_terminadas" integer DEFAULT 0 NOT NULL,
	"piezas_merma" integer DEFAULT 0 NOT NULL,
	"piezas_a_bodega" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "lote_tallas_planeadas" CHECK ("lote_tallas"."piezas_planeadas" >= 0),
	CONSTRAINT "lote_tallas_cortadas" CHECK ("lote_tallas"."piezas_cortadas" >= 0),
	CONSTRAINT "lote_tallas_a_bodega" CHECK ("lote_tallas"."piezas_a_bodega" >= 0 and "lote_tallas"."piezas_a_bodega" <= coalesce("lote_tallas"."piezas_cortadas", 0))
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"orden_produccion_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"flujo_id" uuid,
	"receta_version_id" uuid,
	"destino" text NOT NULL,
	"pedido_id" uuid,
	"ubicacion_destino_id" uuid,
	"paso_a_temporada_en" timestamp with time zone,
	"estado" text DEFAULT 'por_cortar' NOT NULL,
	"fecha_corte" date NOT NULL,
	"fecha_entrega" date NOT NULL,
	"cortado_en" timestamp with time zone,
	"terminado_en" timestamp with time zone,
	"revisado_en" timestamp with time zone,
	"en_aduana_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "lotes_estado" CHECK ("lotes"."estado" in ('por_cortar', 'en_proceso', 'terminado', 'revisado', 'en_aduana', 'cancelado')),
	CONSTRAINT "lotes_destino" CHECK ("lotes"."destino" in ('pedido', 'tienda', 'temporada')),
	CONSTRAINT "lotes_cortado" CHECK (("lotes"."estado" in ('por_cortar', 'cancelado')) = ("lotes"."flujo_id" is null and "lotes"."receta_version_id" is null)),
	CONSTRAINT "lotes_pedido" CHECK ("lotes"."destino" <> 'pedido' or "lotes"."pedido_id" is not null),
	CONSTRAINT "lotes_ubicacion" CHECK (("lotes"."destino" in ('tienda', 'temporada')) = ("lotes"."ubicacion_destino_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ordenes_produccion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"motivo" text NOT NULL,
	"pedido_id" uuid,
	"pedido_version_id" uuid,
	"ubicacion_destino_id" uuid,
	"pedido_especial_tienda_id" uuid,
	"referencia" text,
	"fecha" date NOT NULL,
	"fecha_entrega" date NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ordenes_produccion_motivo" CHECK ("ordenes_produccion"."motivo" in ('cliente_externo', 'temporada', 'reabasto', 'pedido_especial')),
	CONSTRAINT "ordenes_produccion_estado" CHECK ("ordenes_produccion"."estado" in ('abierta', 'cancelada')),
	CONSTRAINT "ordenes_produccion_pedido" CHECK (("ordenes_produccion"."motivo" = 'cliente_externo') = ("ordenes_produccion"."pedido_id" is not null)),
	CONSTRAINT "ordenes_produccion_destino" CHECK (("ordenes_produccion"."motivo" in ('temporada', 'reabasto', 'pedido_especial')) = ("ordenes_produccion"."ubicacion_destino_id" is not null)),
	CONSTRAINT "ordenes_produccion_especial" CHECK (("ordenes_produccion"."pedido_especial_tienda_id" is not null) <= ("ordenes_produccion"."motivo" = 'pedido_especial')),
	CONSTRAINT "ordenes_produccion_referencia" CHECK (char_length("ordenes_produccion"."referencia") <= 120),
	CONSTRAINT "ordenes_produccion_entrega" CHECK ("ordenes_produccion"."fecha_entrega" >= "ordenes_produccion"."fecha"),
	CONSTRAINT "ordenes_produccion_quien" CHECK ("ordenes_produccion"."creado_por" is not null)
);
--> statement-breakpoint
ALTER TABLE "lote_tallas" ADD CONSTRAINT "lote_tallas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_tallas" ADD CONSTRAINT "lote_tallas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lote_tallas" ADD CONSTRAINT "lote_tallas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_orden_produccion_id_ordenes_produccion_id_fk" FOREIGN KEY ("orden_produccion_id") REFERENCES "public"."ordenes_produccion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_flujo_id_flujos_id_fk" FOREIGN KEY ("flujo_id") REFERENCES "public"."flujos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_receta_version_id_receta_versiones_id_fk" FOREIGN KEY ("receta_version_id") REFERENCES "public"."receta_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_ubicacion_destino_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_destino_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_ubicacion_destino_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_destino_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lote_tallas_variante" ON "lote_tallas" USING btree ("lote_id","variante_id");--> statement-breakpoint
CREATE INDEX "lote_tallas_de_variante" ON "lote_tallas" USING btree ("variante_id");--> statement-breakpoint
CREATE INDEX "lote_tallas_xid_escritura" ON "lote_tallas" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "lotes_folio" ON "lotes" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "lotes_orden" ON "lotes" USING btree ("orden_produccion_id");--> statement-breakpoint
CREATE INDEX "lotes_estado_corte" ON "lotes" USING btree ("estado","fecha_corte");--> statement-breakpoint
CREATE INDEX "lotes_estado_entrega" ON "lotes" USING btree ("estado","fecha_entrega");--> statement-breakpoint
CREATE INDEX "lotes_pedido" ON "lotes" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "lotes_producto" ON "lotes" USING btree ("producto_id","estado");--> statement-breakpoint
CREATE INDEX "lotes_flujo" ON "lotes" USING btree ("flujo_id") WHERE "lotes"."estado" = 'en_proceso';--> statement-breakpoint
CREATE INDEX "lotes_xid_escritura" ON "lotes" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_produccion_folio" ON "ordenes_produccion" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_produccion_pedido_especial" ON "ordenes_produccion" USING btree ("pedido_especial_tienda_id");--> statement-breakpoint
CREATE INDEX "ordenes_produccion_pedido" ON "ordenes_produccion" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "ordenes_produccion_motivo" ON "ordenes_produccion" USING btree ("motivo","estado");--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recetas" ADD CONSTRAINT "recetas_verificada_lote_id_lotes_id_fk" FOREIGN KEY ("verificada_lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los lotes y sus tallas bajan a la tablet.
SELECT poner_disparador_comun('ordenes_produccion', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('lotes', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('lote_tallas', baja_a_aparatos => true);
--> statement-breakpoint
-- `produccion` suma su tipo de aviso al CHECK de `avisos.tipo`, con la lista completa (decisión 454).
ALTER TABLE "avisos" DROP CONSTRAINT "avisos_tipo";
--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_tipo" CHECK (tipo in ('autorizacion_pedida', 'autorizacion_decidida', 'alerta_seguridad', 'dispositivo_sin_sincronizar', 'alerta_direccion', 'restauracion_por_probar', 'respaldo_fallido', 'pin_bloqueado', 'trabajo_fallido', 'codigos_por_acabarse', 'cuadre_fallido', 'lote_atorado'));
