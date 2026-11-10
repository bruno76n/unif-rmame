CREATE TABLE "bitacora" (
	"id" uuid NOT NULL,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"es_alerta" boolean DEFAULT false NOT NULL,
	"usuario_id" uuid,
	"persona_id" uuid,
	"dispositivo_id" uuid,
	"sesion_id" uuid,
	"comando_id" uuid,
	"correo_intento" text,
	"departamento_id" uuid,
	"modulo" text NOT NULL,
	"origen" text NOT NULL,
	"accion" text NOT NULL,
	"descripcion" text NOT NULL,
	"descripcion_recortada" text,
	"entidad" text,
	"entidad_id" uuid,
	"entidad_folio" text,
	"antes" jsonb,
	"despues" jsonb,
	"sensible_sueldos" boolean DEFAULT false NOT NULL,
	"misma_persona" boolean DEFAULT false NOT NULL,
	"confirmado_con_google_en" timestamp with time zone,
	"ip" "inet",
	CONSTRAINT "bitacora_id_ocurrido_en_pk" PRIMARY KEY("id","ocurrido_en"),
	CONSTRAINT "bitacora_tipo" CHECK ("bitacora"."tipo" in ('cambio', 'acceso', 'consulta_sensible')),
	CONSTRAINT "bitacora_modulo" CHECK (modulo in ('admin', 'personal', 'direccion', 'catalogo', 'patronaje', 'compras', 'ventas', 'produccion', 'calidad', 'mantenimiento', 'inventario', 'contaduria', 'linea', 'sistema')),
	CONSTRAINT "bitacora_origen" CHECK ("bitacora"."origen" in ('fabrica', 'tienda', 'tablet', 'panel_linea', 'servidor_linea', 'sistema'))
) PARTITION BY RANGE ("ocurrido_en");
--> statement-breakpoint
CREATE INDEX "bitacora_ocurrido" ON "bitacora" USING btree ("ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitacora_entidad" ON "bitacora" USING btree ("entidad","entidad_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitacora_usuario" ON "bitacora" USING btree ("usuario_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitacora_persona" ON "bitacora" USING btree ("persona_id","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitacora_tipo" ON "bitacora" USING btree ("tipo","ocurrido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitacora_alertas" ON "bitacora" USING btree ("ocurrido_en" DESC NULLS LAST) WHERE "bitacora"."es_alerta";--> statement-breakpoint
-- Escrito a mano (docs/modulos/admin/bitacora.md): el buscador de la bitácora, por trigramas sobre la
-- descripción sin acentos.
CREATE INDEX "bitacora_descripcion_trigramas" ON "bitacora" USING gin (sin_acentos("descripcion") gin_trgm_ops);
--> statement-breakpoint
-- Partida por mes, como `eventos` (ver 0003): dos meses adelante y la de respaldo.
SELECT asegurar_particiones('public.bitacora', 2);
--> statement-breakpoint
-- La bitácora solo crece: la app no la cambia ni la borra.
SELECT marcar_solo_crece('bitacora');
