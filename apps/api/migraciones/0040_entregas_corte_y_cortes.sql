CREATE TABLE "apartados_rollo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rollo_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"fecha_corte" date NOT NULL,
	"estado" text NOT NULL,
	"entrega_corte_id" uuid,
	"corte_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "apartados_rollo_estado" CHECK ("apartados_rollo"."estado" in ('sugerido', 'entregado', 'usado', 'liberado')),
	CONSTRAINT "apartados_rollo_entregado" CHECK ("apartados_rollo"."estado" not in ('entregado', 'usado') or "apartados_rollo"."entrega_corte_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "entregas_corte" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lote_id" uuid NOT NULL,
	"receta_version_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"entregada_en" timestamp with time zone NOT NULL,
	"entregada_por" uuid NOT NULL,
	"recibio_persona_id" uuid,
	"movimiento_id" uuid NOT NULL,
	"corte_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "entregas_corte_estado" CHECK ("entregas_corte"."estado" in ('entregada', 'cerrada', 'devuelta')),
	CONSTRAINT "entregas_corte_cerrada" CHECK (("entregas_corte"."estado" = 'cerrada') = ("entregas_corte"."corte_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "retazos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"rollo_id" uuid NOT NULL,
	"corte_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"metros" numeric(12, 3) NOT NULL,
	"estado" text NOT NULL,
	"recepcion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "retazos_metros" CHECK ("retazos"."metros" > 0),
	CONSTRAINT "retazos_estado" CHECK ("retazos"."estado" in ('por_recibir', 'recibido')),
	CONSTRAINT "retazos_recibido" CHECK (("retazos"."estado" = 'recibido') = ("retazos"."recepcion_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "bultos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"lote_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"piezas" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "bultos_piezas" CHECK ("bultos"."piezas" > 0),
	CONSTRAINT "bultos_numero_positivo" CHECK ("bultos"."numero" > 0)
);
--> statement-breakpoint
CREATE TABLE "corte_rollos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corte_tela_id" uuid NOT NULL,
	"rollo_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"es_ultimo" boolean NOT NULL,
	"apartado_rollo_id" uuid,
	"metros_al_cortar" numeric(12, 3) NOT NULL,
	"metros_usados" numeric(12, 3) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "corte_rollos_al_cortar" CHECK ("corte_rollos"."metros_al_cortar" > 0),
	CONSTRAINT "corte_rollos_usados" CHECK ("corte_rollos"."metros_usados" > 0 and "corte_rollos"."metros_usados" <= "corte_rollos"."metros_al_cortar")
);
--> statement-breakpoint
CREATE TABLE "corte_telas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"corte_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"metros_receta" numeric(12, 3) NOT NULL,
	"metros_quedaron" numeric(12, 3) NOT NULL,
	"quedaron_cambiado" boolean NOT NULL,
	"destino_sobrante" text NOT NULL,
	"retazo_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "corte_telas_papel" CHECK ("corte_telas"."papel" in ('tela_principal', 'combinacion', 'forro')),
	CONSTRAINT "corte_telas_receta" CHECK ("corte_telas"."metros_receta" > 0),
	CONSTRAINT "corte_telas_quedaron" CHECK ("corte_telas"."metros_quedaron" >= 0),
	CONSTRAINT "corte_telas_destino" CHECK ("corte_telas"."destino_sobrante" in ('ninguno', 'rollo', 'retazo', 'merma')),
	CONSTRAINT "corte_telas_retazo" CHECK (("corte_telas"."destino_sobrante" = 'retazo') = ("corte_telas"."retazo_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cortes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lote_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"cerrado_en" timestamp with time zone NOT NULL,
	"corto_persona_id" uuid NOT NULL,
	"verifico_receta" boolean NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cortes_quien" CHECK ("cortes"."creado_por" is not null)
);
--> statement-breakpoint
ALTER TABLE "apartados_rollo" ADD CONSTRAINT "apartados_rollo_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartados_rollo" ADD CONSTRAINT "apartados_rollo_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartados_rollo" ADD CONSTRAINT "apartados_rollo_entrega_corte_id_entregas_corte_id_fk" FOREIGN KEY ("entrega_corte_id") REFERENCES "public"."entregas_corte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartados_rollo" ADD CONSTRAINT "apartados_rollo_corte_id_cortes_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apartados_rollo" ADD CONSTRAINT "apartados_rollo_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_receta_version_id_receta_versiones_id_fk" FOREIGN KEY ("receta_version_id") REFERENCES "public"."receta_versiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_entregada_por_usuarios_id_fk" FOREIGN KEY ("entregada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_recibio_persona_id_personas_id_fk" FOREIGN KEY ("recibio_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_corte_id_cortes_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_corte" ADD CONSTRAINT "entregas_corte_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retazos" ADD CONSTRAINT "retazos_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retazos" ADD CONSTRAINT "retazos_corte_id_cortes_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retazos" ADD CONSTRAINT "retazos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retazos" ADD CONSTRAINT "retazos_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retazos" ADD CONSTRAINT "retazos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bultos" ADD CONSTRAINT "bultos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_rollos" ADD CONSTRAINT "corte_rollos_corte_tela_id_corte_telas_id_fk" FOREIGN KEY ("corte_tela_id") REFERENCES "public"."corte_telas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_rollos" ADD CONSTRAINT "corte_rollos_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_rollos" ADD CONSTRAINT "corte_rollos_apartado_rollo_id_apartados_rollo_id_fk" FOREIGN KEY ("apartado_rollo_id") REFERENCES "public"."apartados_rollo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_rollos" ADD CONSTRAINT "corte_rollos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_telas" ADD CONSTRAINT "corte_telas_corte_id_cortes_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_telas" ADD CONSTRAINT "corte_telas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_telas" ADD CONSTRAINT "corte_telas_retazo_id_retazos_id_fk" FOREIGN KEY ("retazo_id") REFERENCES "public"."retazos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corte_telas" ADD CONSTRAINT "corte_telas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_corto_persona_id_personas_id_fk" FOREIGN KEY ("corto_persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apartados_rollo_vivo" ON "apartados_rollo" USING btree ("rollo_id") WHERE "apartados_rollo"."estado" in ('sugerido', 'entregado');--> statement-breakpoint
CREATE INDEX "apartados_rollo_lote" ON "apartados_rollo" USING btree ("lote_id","estado");--> statement-breakpoint
CREATE INDEX "entregas_corte_lote" ON "entregas_corte" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "entregas_corte_estado" ON "entregas_corte" USING btree ("estado");--> statement-breakpoint
CREATE UNIQUE INDEX "retazos_folio" ON "retazos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "retazos_rollo" ON "retazos" USING btree ("rollo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bultos_folio" ON "bultos" USING btree (upper("folio"));--> statement-breakpoint
CREATE UNIQUE INDEX "bultos_numero" ON "bultos" USING btree ("lote_id","numero");--> statement-breakpoint
CREATE INDEX "bultos_lote_variante" ON "bultos" USING btree ("lote_id","variante_id");--> statement-breakpoint
CREATE INDEX "bultos_xid_escritura" ON "bultos" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "corte_rollos_rollo" ON "corte_rollos" USING btree ("rollo_id","corte_tela_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corte_rollos_orden" ON "corte_rollos" USING btree ("corte_tela_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "corte_rollos_ultimo" ON "corte_rollos" USING btree ("corte_tela_id") WHERE "corte_rollos"."es_ultimo";--> statement-breakpoint
CREATE INDEX "corte_rollos_de_rollo" ON "corte_rollos" USING btree ("rollo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corte_telas_material" ON "corte_telas" USING btree ("corte_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corte_telas_principal" ON "corte_telas" USING btree ("corte_id") WHERE "corte_telas"."papel" = 'tela_principal';--> statement-breakpoint
CREATE UNIQUE INDEX "cortes_lote" ON "cortes" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "cortes_fecha" ON "cortes" USING btree ("fecha");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los bultos bajan a la tablet.
SELECT poner_disparador_comun('retazos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('entregas_corte', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('apartados_rollo', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('cortes', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('corte_telas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('corte_rollos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('bultos', baja_a_aparatos => true);
--> statement-breakpoint
-- El corte nunca cambia: sus telas y sus rollos solo crecen.
SELECT marcar_solo_crece('cortes');
--> statement-breakpoint
SELECT marcar_solo_crece('corte_telas');
--> statement-breakpoint
SELECT marcar_solo_crece('corte_rollos');
