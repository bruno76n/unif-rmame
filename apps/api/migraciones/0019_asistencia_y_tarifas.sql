CREATE TABLE "asistencia_dias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asistencia_semana_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"valor" text NOT NULL,
	"origen" text NOT NULL,
	"capturado_por" uuid,
	"valor_tienda" text,
	"cambiado_en_personal" boolean DEFAULT false NOT NULL,
	"entrada_en" timestamp with time zone,
	"salida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "asistencia_dias_valor" CHECK ("asistencia_dias"."valor" in ('completo', 'medio', 'falta')),
	CONSTRAINT "asistencia_dias_origen" CHECK ("asistencia_dias"."origen" in ('personal', 'tienda')),
	CONSTRAINT "asistencia_dias_valor_tienda" CHECK ("asistencia_dias"."valor_tienda" is null or "asistencia_dias"."valor_tienda" in ('completo', 'medio', 'falta'))
);
--> statement-breakpoint
CREATE TABLE "asistencia_semanas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	"reabierta_en" timestamp with time zone,
	"reabierta_por" uuid,
	"motivo_reapertura" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "asistencia_semanas_estado" CHECK ("asistencia_semanas"."estado" in ('abierta', 'cerrada')),
	CONSTRAINT "asistencia_semanas_fechas" CHECK ("asistencia_semanas"."fecha_fin" >= "asistencia_semanas"."fecha_inicio"),
	CONSTRAINT "asistencia_semanas_cierre" CHECK (("asistencia_semanas"."estado" = 'cerrada') = ("asistencia_semanas"."cerrada_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "tarifas_operacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flujo_operacion_id" uuid NOT NULL,
	"tarifa_centavos" bigint NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "tarifas_operacion_tarifa" CHECK ("tarifas_operacion"."tarifa_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "asistencia_dias" ADD CONSTRAINT "asistencia_dias_asistencia_semana_id_asistencia_semanas_id_fk" FOREIGN KEY ("asistencia_semana_id") REFERENCES "public"."asistencia_semanas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_dias" ADD CONSTRAINT "asistencia_dias_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_dias" ADD CONSTRAINT "asistencia_dias_capturado_por_usuarios_id_fk" FOREIGN KEY ("capturado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_dias" ADD CONSTRAINT "asistencia_dias_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_semanas" ADD CONSTRAINT "asistencia_semanas_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_semanas" ADD CONSTRAINT "asistencia_semanas_reabierta_por_usuarios_id_fk" FOREIGN KEY ("reabierta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_semanas" ADD CONSTRAINT "asistencia_semanas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifas_operacion" ADD CONSTRAINT "tarifas_operacion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asistencia_dias_persona_fecha" ON "asistencia_dias" USING btree ("persona_id","fecha");--> statement-breakpoint
CREATE INDEX "asistencia_dias_semana" ON "asistencia_dias" USING btree ("asistencia_semana_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asistencia_semanas_inicio" ON "asistencia_semanas" USING btree ("fecha_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "tarifas_operacion_vigente" ON "tarifas_operacion" USING btree ("flujo_operacion_id") WHERE "tarifas_operacion"."vigente_hasta" is null;--> statement-breakpoint
CREATE INDEX "tarifas_operacion_historia" ON "tarifas_operacion" USING btree ("flujo_operacion_id","vigente_desde");--> statement-breakpoint
CREATE INDEX "tarifas_operacion_xid_escritura" ON "tarifas_operacion" USING btree ("xid_escritura");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; las tarifas bajan a la tablet, así que llevan `xid_escritura`.
SELECT poner_disparador_comun('asistencia_semanas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('asistencia_dias', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('tarifas_operacion', baja_a_aparatos => true);
