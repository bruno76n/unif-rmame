CREATE TABLE "pines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"pin_hash" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"intentos_fallidos" smallint DEFAULT 0 NOT NULL,
	"bloqueado_en" timestamp with time zone,
	"desbloqueado_en" timestamp with time zone,
	"desbloqueado_por" uuid,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "pines_estado" CHECK ("pines"."estado" in ('activo', 'bloqueado', 'anulado')),
	CONSTRAINT "pines_anulacion" CHECK (("pines"."estado" = 'anulado') = ("pines"."anulado_en" is not null and "pines"."motivo_anulacion" is not null)),
	CONSTRAINT "pines_motivo" CHECK ("pines"."motivo_anulacion" is null or "pines"."motivo_anulacion" in ('restablecido', 'baja_persona', 'cuenta_google', 'cambio_area'))
);
--> statement-breakpoint
ALTER TABLE "pines" ADD CONSTRAINT "pines_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pines" ADD CONSTRAINT "pines_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pines" ADD CONSTRAINT "pines_desbloqueado_por_usuarios_id_fk" FOREIGN KEY ("desbloqueado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pines" ADD CONSTRAINT "pines_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pines" ADD CONSTRAINT "pines_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pines_uno_vivo" ON "pines" USING btree ("persona_id","ubicacion_id") WHERE "pines"."estado" in ('activo', 'bloqueado');--> statement-breakpoint
CREATE INDEX "pines_xid_escritura" ON "pines" USING btree ("xid_escritura");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes y, como baja a la tablet, `xid_escritura`.
SELECT poner_disparador_comun('pines', baja_a_aparatos => true);
