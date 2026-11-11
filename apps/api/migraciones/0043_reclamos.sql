CREATE TABLE "reclamos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"fecha" date NOT NULL,
	"origen" text DEFAULT 'cliente_externo' NOT NULL,
	"cliente_id" uuid,
	"ubicacion_id" uuid,
	"salida_tienda_id" uuid,
	"nota_entrega_id" uuid,
	"variante_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"defecto_id" uuid NOT NULL,
	"flujo_operacion_id" uuid NOT NULL,
	"persona_id" uuid,
	"piezas" integer NOT NULL,
	"que_dice_cliente" text NOT NULL,
	"estado" text DEFAULT 'por_resolver' NOT NULL,
	"resuelto_en" timestamp with time zone,
	"resuelto_por" uuid,
	"resolucion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "reclamos_origen" CHECK ("reclamos"."origen" in ('cliente_externo', 'tienda')),
	CONSTRAINT "reclamos_cliente" CHECK (("reclamos"."origen" = 'cliente_externo') = ("reclamos"."cliente_id" is not null)),
	CONSTRAINT "reclamos_tienda" CHECK (("reclamos"."origen" = 'tienda') = ("reclamos"."ubicacion_id" is not null)),
	CONSTRAINT "reclamos_piezas" CHECK ("reclamos"."piezas" > 0),
	CONSTRAINT "reclamos_estado" CHECK ("reclamos"."estado" in ('por_resolver', 'resuelto')),
	CONSTRAINT "reclamos_resuelto" CHECK (("reclamos"."estado" = 'resuelto') = ("reclamos"."resuelto_en" is not null and "reclamos"."resuelto_por" is not null)),
	CONSTRAINT "reclamos_resolucion" CHECK ("reclamos"."resolucion" is null or char_length("reclamos"."resolucion") <= 200)
);
--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_flujo_operacion_id_flujo_operaciones_id_fk" FOREIGN KEY ("flujo_operacion_id") REFERENCES "public"."flujo_operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reclamos_folio" ON "reclamos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "reclamos_estado" ON "reclamos" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "reclamos_lote" ON "reclamos" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "reclamos_variante" ON "reclamos" USING btree ("variante_id");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los reclamos no bajan a un aparato.
SELECT poner_disparador_comun('reclamos', baja_a_aparatos => false);
