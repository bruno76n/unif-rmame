CREATE TABLE "cambio_pedido_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cambio_pedido_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas_restadas" integer DEFAULT 0 NOT NULL,
	"piezas_a_bodega" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cambio_pedido_lineas_piezas" CHECK ("cambio_pedido_lineas"."piezas_restadas" >= 0 and "cambio_pedido_lineas"."piezas_a_bodega" >= 0 and "cambio_pedido_lineas"."piezas_restadas" + "cambio_pedido_lineas"."piezas_a_bodega" > 0)
);
--> statement-breakpoint
CREATE TABLE "cambios_pedido" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"pedido_version_id" uuid NOT NULL,
	"estado" text DEFAULT 'por_aplicar' NOT NULL,
	"aplicado_en" timestamp with time zone,
	"aplicado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cambios_pedido_estado" CHECK ("cambios_pedido"."estado" in ('por_aplicar', 'aplicado', 'reemplazado')),
	CONSTRAINT "cambios_pedido_aplicado" CHECK (("cambios_pedido"."estado" = 'aplicado') = ("cambios_pedido"."aplicado_en" is not null))
);
--> statement-breakpoint
ALTER TABLE "cambio_pedido_lineas" ADD CONSTRAINT "cambio_pedido_lineas_cambio_pedido_id_cambios_pedido_id_fk" FOREIGN KEY ("cambio_pedido_id") REFERENCES "public"."cambios_pedido"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambio_pedido_lineas" ADD CONSTRAINT "cambio_pedido_lineas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambio_pedido_lineas" ADD CONSTRAINT "cambio_pedido_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambio_pedido_lineas" ADD CONSTRAINT "cambio_pedido_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_pedido" ADD CONSTRAINT "cambios_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_pedido" ADD CONSTRAINT "cambios_pedido_pedido_version_id_pedido_versiones_id_fk" FOREIGN KEY ("pedido_version_id") REFERENCES "public"."pedido_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_pedido" ADD CONSTRAINT "cambios_pedido_aplicado_por_usuarios_id_fk" FOREIGN KEY ("aplicado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_pedido" ADD CONSTRAINT "cambios_pedido_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cambio_pedido_lineas_unico" ON "cambio_pedido_lineas" USING btree ("cambio_pedido_id","lote_id","variante_id");--> statement-breakpoint
CREATE INDEX "cambio_pedido_lineas_lote" ON "cambio_pedido_lineas" USING btree ("lote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cambios_pedido_version" ON "cambios_pedido" USING btree ("pedido_version_id");--> statement-breakpoint
CREATE INDEX "cambios_pedido_pedido" ON "cambios_pedido" USING btree ("pedido_id","estado");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los cambios de pedido no bajan a la tablet.
SELECT poner_disparador_comun('cambios_pedido', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('cambio_pedido_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('cambio_pedido_lineas');
