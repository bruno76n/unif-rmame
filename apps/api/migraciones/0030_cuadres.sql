CREATE TABLE "cuadres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"iniciado_en" timestamp with time zone NOT NULL,
	"terminado_en" timestamp with time zone,
	"estado" text NOT NULL,
	"renglones_revisados" integer DEFAULT 0 NOT NULL,
	"proyecciones_corregidas" integer DEFAULT 0 NOT NULL,
	"diferencias_creadas" integer DEFAULT 0 NOT NULL,
	"excepciones_creadas" integer DEFAULT 0 NOT NULL,
	"error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cuadres_estado" CHECK ("cuadres"."estado" in ('corriendo', 'cuadro', 'con_residuo', 'fallo')),
	CONSTRAINT "cuadres_terminado" CHECK (("cuadres"."estado" = 'corriendo') = ("cuadres"."terminado_en" is null))
);
--> statement-breakpoint
ALTER TABLE "cuadres" ADD CONSTRAINT "cuadres_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuadres_fecha" ON "cuadres" USING btree ("fecha");--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes.
SELECT poner_disparador_comun('cuadres', baja_a_aparatos => false);
--> statement-breakpoint
-- Escrito a mano (docs/modulos/inventario/existencias-y-cuadre.md, «El aviso `cuadre_fallido`»): Inventario suma
-- su tipo de aviso al CHECK de `avisos.tipo`, con la lista completa (decisión 454).
ALTER TABLE "avisos" DROP CONSTRAINT "avisos_tipo";--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_tipo" CHECK (tipo in ('autorizacion_pedida', 'autorizacion_decidida', 'alerta_seguridad', 'dispositivo_sin_sincronizar', 'alerta_direccion', 'restauracion_por_probar', 'respaldo_fallido', 'pin_bloqueado', 'trabajo_fallido', 'codigos_por_acabarse', 'cuadre_fallido'));
