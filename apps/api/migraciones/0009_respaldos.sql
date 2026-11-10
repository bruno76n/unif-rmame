CREATE TABLE "respaldos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hecho_en" timestamp with time zone NOT NULL,
	"estado" text NOT NULL,
	"tamano_bytes" bigint,
	"cifrado" boolean NOT NULL,
	"destino" text NOT NULL,
	"sha256" text,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "respaldos_estado" CHECK ("respaldos"."estado" in ('correcto', 'fallido'))
);
--> statement-breakpoint
CREATE TABLE "restauraciones_probadas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"probada_en" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"respaldo_id" uuid,
	"punto_restaurado_en" timestamp with time zone,
	"ambiente" text DEFAULT 'pruebas' NOT NULL,
	"conteos_cuadraron" boolean NOT NULL,
	"conteos" jsonb,
	"evidencia_archivo_id" uuid NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "restauraciones_probadas_tipo" CHECK ("restauraciones_probadas"."tipo" in ('semanal_externo', 'punto_en_el_tiempo')),
	CONSTRAINT "restauraciones_probadas_ambiente" CHECK ("restauraciones_probadas"."ambiente" in ('pruebas')),
	CONSTRAINT "restauraciones_probadas_de_su_tipo" CHECK (("restauraciones_probadas"."tipo" = 'semanal_externo' and "restauraciones_probadas"."respaldo_id" is not null)
			or ("restauraciones_probadas"."tipo" = 'punto_en_el_tiempo' and "restauraciones_probadas"."punto_restaurado_en" is not null)),
	CONSTRAINT "restauraciones_probadas_quien" CHECK ("restauraciones_probadas"."creado_por" is not null)
);
--> statement-breakpoint
ALTER TABLE "restauraciones_probadas" ADD CONSTRAINT "restauraciones_probadas_respaldo_id_respaldos_id_fk" FOREIGN KEY ("respaldo_id") REFERENCES "public"."respaldos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restauraciones_probadas" ADD CONSTRAINT "restauraciones_probadas_evidencia_archivo_id_archivos_id_fk" FOREIGN KEY ("evidencia_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "respaldos_hecho" ON "respaldos" USING btree ("hecho_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "restauraciones_probadas_probada" ON "restauraciones_probadas" USING btree ("probada_en" DESC NULLS LAST);--> statement-breakpoint
-- Escrito a mano (docs/modulos/admin/respaldos.md): `respaldos` solo crece; `restauraciones_probadas`
-- lleva el disparador de las columnas comunes.
SELECT marcar_solo_crece('respaldos');
--> statement-breakpoint
SELECT poner_disparador_comun('restauraciones_probadas', baja_a_aparatos => false);
