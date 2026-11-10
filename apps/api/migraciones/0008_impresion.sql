CREATE TABLE "impresoras" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"modelo" text NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trabajos_impresion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"impresora_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ids" uuid[] NOT NULL,
	"copias" smallint NOT NULL,
	"estado" text NOT NULL,
	"mandado_en" timestamp with time zone,
	"terminado_en" timestamp with time zone,
	"error" text,
	"pedido_por" uuid,
	"sesion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "trabajos_impresion_estado" CHECK ("trabajos_impresion"."estado" in ('por_imprimir', 'mandado', 'impreso', 'fallo')),
	CONSTRAINT "trabajos_impresion_error" CHECK ("trabajos_impresion"."estado" <> 'fallo' or "trabajos_impresion"."error" is not null),
	CONSTRAINT "trabajos_impresion_copias" CHECK ("trabajos_impresion"."copias" >= 1)
);
--> statement-breakpoint
ALTER TABLE "impresoras" ADD CONSTRAINT "impresoras_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_impresion" ADD CONSTRAINT "trabajos_impresion_impresora_id_impresoras_id_fk" FOREIGN KEY ("impresora_id") REFERENCES "public"."impresoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trabajos_impresion_por_imprimir" ON "trabajos_impresion" USING btree ("impresora_id","creado_en") WHERE "trabajos_impresion"."estado" = 'por_imprimir';--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): el disparador de las columnas comunes.
SELECT poner_disparador_comun('impresoras', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('trabajos_impresion', baja_a_aparatos => false);
