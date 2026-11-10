CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"nombre" text NOT NULL,
	"area" text NOT NULL,
	"ubicacion_id" uuid,
	"rol_tienda" text,
	"puesto" text NOT NULL,
	"forma_pago" text NOT NULL,
	"pago_dia_centavos" bigint,
	"fecha_ingreso" date NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"reactivado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "personas_nombre" CHECK (char_length("personas"."nombre") between 5 and 40),
	CONSTRAINT "personas_area" CHECK ("personas"."area" in ('taller', 'oficina', 'aduana_bodega', 'tienda')),
	CONSTRAINT "personas_tienda" CHECK (("personas"."area" = 'tienda') = ("personas"."ubicacion_id" is not null and "personas"."rol_tienda" is not null) and ("personas"."area" = 'tienda' or ("personas"."ubicacion_id" is null and "personas"."rol_tienda" is null))),
	CONSTRAINT "personas_rol_tienda" CHECK ("personas"."rol_tienda" is null or "personas"."rol_tienda" in ('cajera', 'encargada')),
	CONSTRAINT "personas_puesto" CHECK (char_length("personas"."puesto") between 3 and 30),
	CONSTRAINT "personas_forma_pago" CHECK ("personas"."forma_pago" in ('tiempo', 'pieza', 'mixta')),
	CONSTRAINT "personas_pago_dia" CHECK (("personas"."forma_pago" = 'pieza' and "personas"."pago_dia_centavos" is null) or ("personas"."forma_pago" <> 'pieza' and "personas"."pago_dia_centavos" between 1 and 9999900)),
	CONSTRAINT "personas_baja" CHECK ("personas"."baja_en" is null or char_length("personas"."motivo_baja") between 5 and 80)
);
--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_reactivado_por_usuarios_id_fk" FOREIGN KEY ("reactivado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personas_folio" ON "personas" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "personas_area" ON "personas" USING btree ("area","ubicacion_id") WHERE "personas"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "personas_xid_escritura" ON "personas" USING btree ("xid_escritura");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_responsable_persona_id_personas_id_fk" FOREIGN KEY ("responsable_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes y, como baja a la tablet, `xid_escritura`.
SELECT poner_disparador_comun('personas', baja_a_aparatos => true);
