CREATE TABLE "orden_compra_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orden_compra_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"precio_orden_centavos" bigint NOT NULL,
	"precio_nota_centavos" bigint,
	"precio_nota_en" timestamp with time zone,
	"precio_nota_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "orden_compra_lineas_cantidad" CHECK ("orden_compra_lineas"."cantidad" > 0),
	CONSTRAINT "orden_compra_lineas_precio" CHECK ("orden_compra_lineas"."precio_orden_centavos" > 0),
	CONSTRAINT "orden_compra_lineas_precio_nota" CHECK ("orden_compra_lineas"."precio_nota_centavos" > 0),
	CONSTRAINT "orden_compra_lineas_nota" CHECK (("orden_compra_lineas"."precio_nota_centavos" is null) = ("orden_compra_lineas"."precio_nota_en" is null))
);
--> statement-breakpoint
CREATE TABLE "ordenes_compra" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"fecha" date NOT NULL,
	"fecha_prometida" date,
	"enviada_en" timestamp with time zone,
	"enviada_por" uuid,
	"dias_credito" integer,
	"pdf_archivo_id" uuid,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	"motivo_cierre" text,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ordenes_compra_estado" CHECK ("ordenes_compra"."estado" in ('borrador', 'enviada', 'recibida_en_parte', 'recibida', 'cerrada', 'cerrada_con_faltante', 'cancelada')),
	CONSTRAINT "ordenes_compra_enviada" CHECK ("ordenes_compra"."enviada_en" is null or ("ordenes_compra"."fecha_prometida" is not null and "ordenes_compra"."dias_credito" is not null)),
	CONSTRAINT "ordenes_compra_cerrada_con_faltante" CHECK ("ordenes_compra"."estado" <> 'cerrada_con_faltante' or ("ordenes_compra"."cerrada_en" is not null and "ordenes_compra"."motivo_cierre" is not null)),
	CONSTRAINT "ordenes_compra_cerrada" CHECK ("ordenes_compra"."estado" <> 'cerrada' or "ordenes_compra"."cerrada_en" is not null),
	CONSTRAINT "ordenes_compra_cancelada" CHECK (("ordenes_compra"."estado" = 'cancelada') = ("ordenes_compra"."cancelado_en" is not null and "ordenes_compra"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "orden_compra_lineas" ADD CONSTRAINT "orden_compra_lineas_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_compra_lineas" ADD CONSTRAINT "orden_compra_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_compra_lineas" ADD CONSTRAINT "orden_compra_lineas_precio_nota_por_usuarios_id_fk" FOREIGN KEY ("precio_nota_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_compra_lineas" ADD CONSTRAINT "orden_compra_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_enviada_por_usuarios_id_fk" FOREIGN KEY ("enviada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_pdf_archivo_id_archivos_id_fk" FOREIGN KEY ("pdf_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orden_compra_lineas_material" ON "orden_compra_lineas" USING btree ("orden_compra_id","material_id");--> statement-breakpoint
CREATE INDEX "orden_compra_lineas_material_pedido" ON "orden_compra_lineas" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_compra_folio" ON "ordenes_compra" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_compra_un_borrador" ON "ordenes_compra" USING btree ("proveedor_id") WHERE "ordenes_compra"."estado" = 'borrador';--> statement-breakpoint
CREATE INDEX "ordenes_compra_estado" ON "ordenes_compra" USING btree ("estado","fecha_prometida");--> statement-breakpoint
CREATE INDEX "ordenes_compra_proveedor" ON "ordenes_compra" USING btree ("proveedor_id","enviada_en" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "precios_compra" ADD CONSTRAINT "precios_compra_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_compra" ADD CONSTRAINT "precios_compra_orden_compra_linea_id_orden_compra_lineas_id_fk" FOREIGN KEY ("orden_compra_linea_id") REFERENCES "public"."orden_compra_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_orden_compra_linea_id_orden_compra_lineas_id_fk" FOREIGN KEY ("orden_compra_linea_id") REFERENCES "public"."orden_compra_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes.
SELECT poner_disparador_comun('ordenes_compra', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('orden_compra_lineas', baja_a_aparatos => false);
