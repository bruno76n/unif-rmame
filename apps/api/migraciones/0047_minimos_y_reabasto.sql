CREATE TABLE "minimos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"nivel" text NOT NULL,
	"piezas" integer NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "minimos_nivel" CHECK ("minimos"."nivel" in ('mayor_venta', 'demas')),
	CONSTRAINT "minimos_piezas" CHECK ("minimos"."piezas" > 0)
);
--> statement-breakpoint
CREATE TABLE "sugerencias_reabasto" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variante_id" uuid NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"piezas" integer NOT NULL,
	"estado" text DEFAULT 'por_decidir' NOT NULL,
	"orden_produccion_id" uuid,
	"lote_id" uuid,
	"decidida_en" timestamp with time zone,
	"decidida_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "sugerencias_reabasto_piezas" CHECK ("sugerencias_reabasto"."piezas" > 0),
	CONSTRAINT "sugerencias_reabasto_estado" CHECK ("sugerencias_reabasto"."estado" in ('por_decidir', 'levantada')),
	CONSTRAINT "sugerencias_reabasto_levantada" CHECK (("sugerencias_reabasto"."estado" = 'levantada') = ("sugerencias_reabasto"."orden_produccion_id" is not null and "sugerencias_reabasto"."lote_id" is not null
				and "sugerencias_reabasto"."decidida_en" is not null and "sugerencias_reabasto"."decidida_por" is not null))
);
--> statement-breakpoint
ALTER TABLE "minimos" ADD CONSTRAINT "minimos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minimos" ADD CONSTRAINT "minimos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minimos" ADD CONSTRAINT "minimos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_orden_produccion_id_ordenes_produccion_id_fk" FOREIGN KEY ("orden_produccion_id") REFERENCES "public"."ordenes_produccion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_decidida_por_usuarios_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sugerencias_reabasto" ADD CONSTRAINT "sugerencias_reabasto_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "minimos_vigente" ON "minimos" USING btree ("ubicacion_id","nivel") WHERE "minimos"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "sugerencias_reabasto_por_decidir" ON "sugerencias_reabasto" USING btree ("ubicacion_id","estado") WHERE "sugerencias_reabasto"."estado" = 'por_decidir';--> statement-breakpoint
CREATE INDEX "sugerencias_reabasto_variante" ON "sugerencias_reabasto" USING btree ("variante_id");--> statement-breakpoint
CREATE INDEX "sugerencias_reabasto_lote" ON "sugerencias_reabasto" USING btree ("lote_id");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los mínimos de cada tienda bajan a su caja
-- con el POS.
SELECT poner_disparador_comun('minimos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('sugerencias_reabasto', baja_a_aparatos => false);
