CREATE TABLE "alertas_direccion_vistas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"regla" text NOT NULL,
	"entidad_id" uuid,
	"titulo" text NOT NULL,
	"color" text NOT NULL,
	"primera_vez_en" timestamp with time zone NOT NULL,
	"ultima_vez_en" timestamp with time zone NOT NULL,
	"desaparecio_en" timestamp with time zone,
	"avisada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "alertas_direccion_vistas_color" CHECK ("alertas_direccion_vistas"."color" in ('rojo', 'ambar'))
);
--> statement-breakpoint
ALTER TABLE "alertas_direccion_vistas" ADD CONSTRAINT "alertas_direccion_vistas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_direccion_vistas_clave" ON "alertas_direccion_vistas" USING btree ("clave") WHERE "alertas_direccion_vistas"."desaparecio_en" is null;--> statement-breakpoint
SELECT poner_disparador_comun('alertas_direccion_vistas', baja_a_aparatos => false);
