CREATE TABLE "avisos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"enlace" text,
	"entidad" text,
	"entidad_id" uuid,
	"evento_id" uuid,
	"leido_en" timestamp with time zone,
	"por_correo" boolean NOT NULL,
	"correo_enviado_en" timestamp with time zone,
	"correo_intentos" smallint DEFAULT 0 NOT NULL,
	"correo_error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "avisos_tipo" CHECK (tipo in ('autorizacion_pedida', 'autorizacion_decidida', 'alerta_seguridad', 'dispositivo_sin_sincronizar', 'alerta_direccion', 'restauracion_por_probar', 'respaldo_fallido', 'pin_bloqueado', 'trabajo_fallido'))
);
--> statement-breakpoint
CREATE INDEX "avisos_sin_leer" ON "avisos" USING btree ("usuario_id","creado_en" DESC NULLS LAST) WHERE "avisos"."leido_en" is null;--> statement-breakpoint
CREATE INDEX "avisos_correo_pendiente" ON "avisos" USING btree ("creado_en") WHERE "avisos"."por_correo" and "avisos"."correo_enviado_en" is null;--> statement-breakpoint
-- Escrito a mano (docs/modulos/admin/avisos.md): de un aviso, la app solo marca que se leyó y cómo va su
-- correo; lo demás no cambia.
REVOKE UPDATE ON avisos FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (leido_en, correo_enviado_en, correo_intentos, correo_error, actualizado_en) ON avisos TO uniformame_app;
