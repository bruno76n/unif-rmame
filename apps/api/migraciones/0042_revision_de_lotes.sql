CREATE TABLE "defecto_operaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"defecto_id" uuid NOT NULL,
	"operacion_id" uuid NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defectos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "defectos_nombre_largo" CHECK (char_length("defectos"."nombre") between 4 and 60)
);
--> statement-breakpoint
CREATE TABLE "rechazos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"defecto_id" uuid NOT NULL,
	"flujo_operacion_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "rechazos_piezas" CHECK ("rechazos"."piezas" > 0)
);
--> statement-breakpoint
CREATE TABLE "reprocesos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"rechazo_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"estado" text DEFAULT 'en_reproceso' NOT NULL,
	"aprobado_en" timestamp with time zone,
	"aprobado_por" uuid,
	"piezas_aprobadas" integer,
	"piezas_merma" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "reprocesos_estado" CHECK ("reprocesos"."estado" in ('en_reproceso', 'listo')),
	CONSTRAINT "reprocesos_aprobado" CHECK (("reprocesos"."estado" = 'listo') = ("reprocesos"."aprobado_en" is not null and "reprocesos"."aprobado_por" is not null
				and "reprocesos"."piezas_aprobadas" is not null and "reprocesos"."piezas_merma" is not null)),
	CONSTRAINT "reprocesos_piezas" CHECK (("reprocesos"."piezas_aprobadas" is null or "reprocesos"."piezas_aprobadas" >= 0)
				and ("reprocesos"."piezas_merma" is null or "reprocesos"."piezas_merma" >= 0))
);
--> statement-breakpoint
CREATE TABLE "revision_tallas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas_revisadas" integer NOT NULL,
	"piezas_aprobadas" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "revision_tallas_piezas" CHECK ("revision_tallas"."piezas_aprobadas" >= 0 and "revision_tallas"."piezas_aprobadas" <= "revision_tallas"."piezas_revisadas")
);
--> statement-breakpoint
CREATE TABLE "revisiones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lote_id" uuid NOT NULL,
	"revisado_por" uuid NOT NULL,
	"persona_id" uuid,
	"revisado_en" timestamp with time zone NOT NULL,
	"fecha" date NOT NULL,
	"piezas_revisadas" integer NOT NULL,
	"piezas_aprobadas" integer NOT NULL,
	"reviso_quien_coso" boolean NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "revisiones_piezas" CHECK ("revisiones"."piezas_aprobadas" >= 0 and "revisiones"."piezas_aprobadas" <= "revisiones"."piezas_revisadas")
);
--> statement-breakpoint
ALTER TABLE "defecto_operaciones" ADD CONSTRAINT "defecto_operaciones_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defecto_operaciones" ADD CONSTRAINT "defecto_operaciones_operacion_id_operaciones_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defecto_operaciones" ADD CONSTRAINT "defecto_operaciones_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defecto_operaciones" ADD CONSTRAINT "defecto_operaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defectos" ADD CONSTRAINT "defectos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defectos" ADD CONSTRAINT "defectos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_flujo_operacion_id_flujo_operaciones_id_fk" FOREIGN KEY ("flujo_operacion_id") REFERENCES "public"."flujo_operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rechazos" ADD CONSTRAINT "rechazos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reprocesos" ADD CONSTRAINT "reprocesos_rechazo_id_rechazos_id_fk" FOREIGN KEY ("rechazo_id") REFERENCES "public"."rechazos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reprocesos" ADD CONSTRAINT "reprocesos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reprocesos" ADD CONSTRAINT "reprocesos_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reprocesos" ADD CONSTRAINT "reprocesos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_tallas" ADD CONSTRAINT "revision_tallas_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_tallas" ADD CONSTRAINT "revision_tallas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_tallas" ADD CONSTRAINT "revision_tallas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "defecto_operaciones_vigente" ON "defecto_operaciones" USING btree ("defecto_id","operacion_id") WHERE "defecto_operaciones"."baja_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "defectos_nombre" ON "defectos" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "rechazos_renglon" ON "rechazos" USING btree ("revision_id","defecto_id","flujo_operacion_id","variante_id");--> statement-breakpoint
CREATE INDEX "rechazos_operacion" ON "rechazos" USING btree ("flujo_operacion_id");--> statement-breakpoint
CREATE INDEX "rechazos_persona" ON "rechazos" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reprocesos_folio" ON "reprocesos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "reprocesos_rechazo" ON "reprocesos" USING btree ("rechazo_id");--> statement-breakpoint
CREATE INDEX "reprocesos_lote_estado" ON "reprocesos" USING btree ("lote_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_tallas_variante" ON "revision_tallas" USING btree ("revision_id","variante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revisiones_lote" ON "revisiones" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "revisiones_fecha" ON "revisiones" USING btree ("fecha");--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_reproceso_id_reprocesos_id_fk" FOREIGN KEY ("reproceso_id") REFERENCES "public"."reprocesos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_reproceso_id_reprocesos_id_fk" FOREIGN KEY ("reproceso_id") REFERENCES "public"."reprocesos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; nada de Calidad baja a un aparato todavía.
SELECT poner_disparador_comun('defectos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('defecto_operaciones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('revisiones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('revision_tallas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('rechazos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('reprocesos', baja_a_aparatos => false);
--> statement-breakpoint
-- La revisión nace cerrada y no cambia: ella, sus tallas y sus rechazos solo crecen.
SELECT marcar_solo_crece('revisiones');
--> statement-breakpoint
SELECT marcar_solo_crece('revision_tallas');
--> statement-breakpoint
SELECT marcar_solo_crece('rechazos');
