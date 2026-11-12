CREATE TABLE "fallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"maquina_id" uuid NOT NULL,
	"motivo_falla_id" uuid NOT NULL,
	"nota" text,
	"origen" text NOT NULL,
	"reporto_persona_id" uuid,
	"persona_asignada_id" uuid,
	"dispositivo_id" uuid,
	"clave_idempotencia" uuid,
	"hecho_en" timestamp with time zone NOT NULL,
	"fecha" date NOT NULL,
	"sin_internet" boolean DEFAULT false NOT NULL,
	"detuvo_maquina" boolean NOT NULL,
	"parada_desde" timestamp with time zone,
	"estado" text DEFAULT 'reportada' NOT NULL,
	"tecnico_id" uuid,
	"mandada_a_reparacion_en" timestamp with time zone,
	"mandada_por" uuid,
	"nota_seguimiento" text,
	"resuelta_en" timestamp with time zone,
	"resuelta_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "fallas_origen" CHECK ("fallas"."origen" in ('tablet', 'mantenimiento')),
	CONSTRAINT "fallas_tablet" CHECK ("fallas"."origen" <> 'tablet' or ("fallas"."reporto_persona_id" is not null and "fallas"."dispositivo_id" is not null
				and "fallas"."clave_idempotencia" is not null)),
	CONSTRAINT "fallas_estado" CHECK ("fallas"."estado" in ('reportada', 'en_reparacion', 'resuelta')),
	CONSTRAINT "fallas_parada" CHECK (not "fallas"."detuvo_maquina" or "fallas"."parada_desde" is not null),
	CONSTRAINT "fallas_en_reparacion" CHECK ("fallas"."estado" <> 'en_reparacion' or "fallas"."tecnico_id" is not null),
	CONSTRAINT "fallas_resuelta" CHECK (("fallas"."estado" = 'resuelta') = ("fallas"."resuelta_en" is not null and "fallas"."resuelta_por" is not null)),
	CONSTRAINT "fallas_nota" CHECK ("fallas"."nota" is null or char_length("fallas"."nota") <= 200),
	CONSTRAINT "fallas_nota_seguimiento" CHECK ("fallas"."nota_seguimiento" is null or char_length("fallas"."nota_seguimiento") <= 200)
);
--> statement-breakpoint
CREATE TABLE "maquinas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo_maquina_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"marca" text,
	"modelo" text,
	"serie" text,
	"persona_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "maquinas_nombre_largo" CHECK (char_length("maquinas"."nombre") between 1 and 40),
	CONSTRAINT "maquinas_motivo_baja" CHECK ("maquinas"."baja_en" is null or char_length("maquinas"."motivo_baja") >= 5)
);
--> statement-breakpoint
CREATE TABLE "motivos_falla" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"detiene_maquina" boolean NOT NULL,
	"orden" smallint NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"maquina_id" uuid NOT NULL,
	"falla_id" uuid,
	"tecnico_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"que_se_hizo" text NOT NULL,
	"costo_centavos" bigint NOT NULL,
	"horas_paro" integer NOT NULL,
	"gasto_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "servicios_que_se_hizo" CHECK (char_length("servicios"."que_se_hizo") between 4 and 80),
	CONSTRAINT "servicios_costo" CHECK ("servicios"."costo_centavos" >= 0),
	CONSTRAINT "servicios_horas" CHECK ("servicios"."horas_paro" >= 0),
	CONSTRAINT "servicios_creado_por" CHECK ("servicios"."creado_por" is not null)
);
--> statement-breakpoint
CREATE TABLE "tecnicos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tercero_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "tecnicos_nombre_largo" CHECK (char_length("tecnicos"."nombre") between 2 and 60)
);
--> statement-breakpoint
CREATE TABLE "tipos_maquina" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"prefijo" text NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "tipos_maquina_prefijo_letras" CHECK ("tipos_maquina"."prefijo" ~ '^[A-Z]{1,6}$')
);
--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_maquina_id_maquinas_id_fk" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_motivo_falla_id_motivos_falla_id_fk" FOREIGN KEY ("motivo_falla_id") REFERENCES "public"."motivos_falla"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_reporto_persona_id_personas_id_fk" FOREIGN KEY ("reporto_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_persona_asignada_id_personas_id_fk" FOREIGN KEY ("persona_asignada_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_mandada_por_usuarios_id_fk" FOREIGN KEY ("mandada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fallas" ADD CONSTRAINT "fallas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_tipo_maquina_id_tipos_maquina_id_fk" FOREIGN KEY ("tipo_maquina_id") REFERENCES "public"."tipos_maquina"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_area_id_lista_valores_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos_falla" ADD CONSTRAINT "motivos_falla_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motivos_falla" ADD CONSTRAINT "motivos_falla_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_maquina_id_maquinas_id_fk" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_falla_id_fallas_id_fk" FOREIGN KEY ("falla_id") REFERENCES "public"."fallas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tecnicos" ADD CONSTRAINT "tecnicos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_maquina" ADD CONSTRAINT "tipos_maquina_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_maquina" ADD CONSTRAINT "tipos_maquina_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fallas_folio" ON "fallas" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "fallas_una_abierta" ON "fallas" USING btree ("maquina_id") WHERE "fallas"."estado" <> 'resuelta';--> statement-breakpoint
CREATE UNIQUE INDEX "fallas_clave" ON "fallas" USING btree ("clave_idempotencia") WHERE "fallas"."clave_idempotencia" is not null;--> statement-breakpoint
CREATE INDEX "fallas_estado" ON "fallas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "fallas_xid_escritura" ON "fallas" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "maquinas_folio" ON "maquinas" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "maquinas_nombre" ON "maquinas" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "maquinas_serie" ON "maquinas" USING btree ("serie") WHERE "maquinas"."serie" is not null and "maquinas"."serie" <> '';--> statement-breakpoint
CREATE INDEX "maquinas_persona" ON "maquinas" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "maquinas_xid_escritura" ON "maquinas" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "motivos_falla_nombre" ON "motivos_falla" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "motivos_falla_xid_escritura" ON "motivos_falla" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "servicios_folio" ON "servicios" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "servicios_falla" ON "servicios" USING btree ("falla_id") WHERE "servicios"."falla_id" is not null;--> statement-breakpoint
CREATE INDEX "servicios_maquina" ON "servicios" USING btree ("maquina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tecnicos_nombre" ON "tecnicos" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_maquina_nombre" ON "tipos_maquina" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_maquina_prefijo" ON "tipos_maquina" USING btree ("prefijo");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; las máquinas, los motivos y las fallas bajan
-- a la tablet del taller.
SELECT poner_disparador_comun('tipos_maquina', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('tecnicos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('maquinas', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('motivos_falla', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('fallas', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('servicios', baja_a_aparatos => false);
--> statement-breakpoint
-- El servicio es un documento cerrado: solo crece (su gasto se liga al nacer, en la fase 17).
SELECT marcar_solo_crece('servicios');
