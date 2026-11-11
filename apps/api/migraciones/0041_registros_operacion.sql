CREATE TABLE "registros_operacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"origen" text DEFAULT 'tablet' NOT NULL,
	"corte_id" uuid,
	"bulto_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"flujo_operacion_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"piezas_buenas" integer NOT NULL,
	"piezas_danadas" integer NOT NULL,
	"tarifa_centavos" bigint,
	"tarifa_operacion_id" uuid,
	"tarifa_puesta_en" timestamp with time zone,
	"clave_idempotencia" uuid NOT NULL,
	"hecho_en" timestamp with time zone NOT NULL,
	"fecha" date NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"sin_internet" boolean NOT NULL,
	"excepcion_id" uuid,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "registros_operacion_origen" CHECK ("registros_operacion"."origen" in ('tablet', 'corte')),
	CONSTRAINT "registros_operacion_corte" CHECK (("registros_operacion"."origen" = 'corte') = ("registros_operacion"."corte_id" is not null)),
	CONSTRAINT "registros_operacion_tablet" CHECK ("registros_operacion"."origen" <> 'tablet' or "registros_operacion"."dispositivo_id" is not null),
	CONSTRAINT "registros_operacion_piezas" CHECK ("registros_operacion"."piezas_buenas" >= 0 and "registros_operacion"."piezas_danadas" >= 0 and "registros_operacion"."piezas_buenas" + "registros_operacion"."piezas_danadas" > 0),
	CONSTRAINT "registros_operacion_estado" CHECK ("registros_operacion"."estado" in ('vigente', 'cancelado')),
	CONSTRAINT "registros_operacion_cancelado" CHECK (("registros_operacion"."estado" = 'cancelado') = ("registros_operacion"."cancelado_en" is not null))
);
--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_corte_id_cortes_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_bulto_id_bultos_id_fk" FOREIGN KEY ("bulto_id") REFERENCES "public"."bultos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_flujo_operacion_id_flujo_operaciones_id_fk" FOREIGN KEY ("flujo_operacion_id") REFERENCES "public"."flujo_operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_tarifa_operacion_id_tarifas_operacion_id_fk" FOREIGN KEY ("tarifa_operacion_id") REFERENCES "public"."tarifas_operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_excepcion_id_excepciones_id_fk" FOREIGN KEY ("excepcion_id") REFERENCES "public"."excepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_operacion" ADD CONSTRAINT "registros_operacion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registros_operacion_clave" ON "registros_operacion" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "registros_operacion_lote" ON "registros_operacion" USING btree ("lote_id","flujo_operacion_id") WHERE "registros_operacion"."estado" = 'vigente';--> statement-breakpoint
CREATE INDEX "registros_operacion_bulto" ON "registros_operacion" USING btree ("bulto_id","flujo_operacion_id");--> statement-breakpoint
CREATE INDEX "registros_operacion_persona" ON "registros_operacion" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "registros_operacion_fecha" ON "registros_operacion" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "registros_operacion_sin_tarifa" ON "registros_operacion" USING btree ("flujo_operacion_id") WHERE "registros_operacion"."tarifa_centavos" is null and "registros_operacion"."estado" = 'vigente';--> statement-breakpoint
CREATE INDEX "registros_operacion_xid_escritura" ON "registros_operacion" USING btree ("xid_escritura");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los registros bajan a la tablet.
SELECT poner_disparador_comun('registros_operacion', baja_a_aparatos => true);
