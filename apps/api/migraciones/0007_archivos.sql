CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proposito" text NOT NULL,
	"modulo" text NOT NULL,
	"entidad" text,
	"entidad_id" uuid,
	"nombre_original" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamano_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"almacen_clave" text NOT NULL,
	"subido_en" timestamp with time zone,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "archivos_proposito" CHECK (proposito in ('foto', 'comprobante', 'documento_contador', 'factura_proveedor', 'etiqueta', 'guia', 'pdf_documento', 'evidencia_restauracion'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "archivos_almacen_clave" ON "archivos" USING btree ("almacen_clave");--> statement-breakpoint
CREATE INDEX "archivos_entidad" ON "archivos" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "archivos_sha256" ON "archivos" USING btree ("sha256");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): el disparador de las columnas comunes.
SELECT poner_disparador_comun('archivos', baja_a_aparatos => false);
