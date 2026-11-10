CREATE TABLE "comandos_recibidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clave_idempotencia" uuid NOT NULL,
	"origen" text NOT NULL,
	"dispositivo_id" uuid,
	"usuario_id" uuid,
	"sesion_id" uuid,
	"persona_id" uuid,
	"tipo_comando" text NOT NULL,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"carga_hash" text NOT NULL,
	"carga" jsonb,
	"resultado" text NOT NULL,
	"motivo_apartado" text,
	"espera_entidad_id" uuid,
	"dispositivo_revocado" boolean DEFAULT false NOT NULL,
	"excepcion_id" uuid,
	"entidad" text,
	"entidad_id" uuid,
	"respuesta" jsonb,
	"reintentos" integer DEFAULT 0 NOT NULL,
	"ultimo_reintento_en" timestamp with time zone,
	"descartado_en" timestamp with time zone,
	"descartado_por" uuid,
	"motivo_descarte" text,
	"retenido_aplicado_en" timestamp with time zone,
	"retenido_aplicado_por" uuid,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "comandos_recibidos_origen" CHECK ("comandos_recibidos"."origen" in ('web', 'aparato', 'linea')),
	CONSTRAINT "comandos_recibidos_resultado" CHECK ("comandos_recibidos"."resultado" in ('aplicado', 'excepcion', 'apartado')),
	CONSTRAINT "comandos_recibidos_dispositivo_obligatorio" CHECK ("comandos_recibidos"."origen" = 'web' or "comandos_recibidos"."dispositivo_id" is not null),
	CONSTRAINT "comandos_recibidos_cuenta_obligatoria" CHECK ("comandos_recibidos"."origen" <> 'web' or ("comandos_recibidos"."usuario_id" is not null and "comandos_recibidos"."sesion_id" is not null)),
	CONSTRAINT "comandos_recibidos_motivo_apartado" CHECK ("comandos_recibidos"."resultado" <> 'apartado' or "comandos_recibidos"."motivo_apartado" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comandos_recibidos_clave_idempotencia" ON "comandos_recibidos" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "comandos_recibidos_dispositivo" ON "comandos_recibidos" USING btree ("dispositivo_id","recibido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comandos_recibidos_apartados" ON "comandos_recibidos" USING btree ("recibido_en") WHERE "comandos_recibidos"."resultado" = 'apartado' and "comandos_recibidos"."descartado_en" is null;--> statement-breakpoint
CREATE INDEX "comandos_recibidos_espera" ON "comandos_recibidos" USING btree ("espera_entidad_id") WHERE "comandos_recibidos"."espera_entidad_id" is not null;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md): lo que nunca cambia no lo cambia la app.
-- La app solo puede cambiar el resultado, la respuesta, el documento, la excepción y las columnas de
-- reintento, descarte y retenido.
REVOKE UPDATE ON comandos_recibidos FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (
	resultado, respuesta, entidad, entidad_id, excepcion_id,
	reintentos, ultimo_reintento_en,
	descartado_en, descartado_por, motivo_descarte,
	retenido_aplicado_en, retenido_aplicado_por,
	actualizado_en
) ON comandos_recibidos TO uniformame_app;
