CREATE TABLE "despachos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"destino_ubicacion_id" uuid,
	"destino_externo" text,
	"cliente_id" uuid,
	"nota_entrega_id" uuid,
	"estado" text NOT NULL,
	"despachado_en" timestamp with time zone NOT NULL,
	"despachado_por" uuid NOT NULL,
	"recordatorios" integer DEFAULT 0 NOT NULL,
	"ultimo_recordatorio_en" timestamp with time zone,
	"recibido_en" timestamp with time zone,
	"recepcion_id" uuid,
	"recibio_nombre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "despachos_estado" CHECK ("despachos"."estado" in ('en_transito', 'recibido', 'con_diferencia')),
	CONSTRAINT "despachos_destino_externo" CHECK ("despachos"."destino_externo" in ('cliente_externo')),
	CONSTRAINT "despachos_un_destino" CHECK (("despachos"."destino_ubicacion_id" is null) <> ("despachos"."destino_externo" is null)),
	CONSTRAINT "despachos_recibido" CHECK (("despachos"."estado" = 'en_transito') = ("despachos"."recibido_en" is null)),
	CONSTRAINT "despachos_recibio_nombre" CHECK ("despachos"."recibio_nombre" is null or char_length("despachos"."recibio_nombre") >= 3)
);
--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_destino_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("destino_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_despachado_por_usuarios_id_fk" FOREIGN KEY ("despachado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "despachos_folio" ON "despachos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "despachos_destino_estado" ON "despachos" USING btree ("destino_ubicacion_id","estado");--> statement-breakpoint
CREATE INDEX "despachos_en_transito" ON "despachos" USING btree ("estado") WHERE "despachos"."estado" = 'en_transito';--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_despacho_id_despachos_id_fk" FOREIGN KEY ("despacho_id") REFERENCES "public"."despachos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_despacho_id_despachos_id_fk" FOREIGN KEY ("despacho_id") REFERENCES "public"."despachos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes.
SELECT poner_disparador_comun('despachos', baja_a_aparatos => false);
