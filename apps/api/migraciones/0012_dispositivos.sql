CREATE TABLE "codigos_registro" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo_hash" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"ubicacion_id" uuid,
	"vence_en" timestamp with time zone NOT NULL,
	"estado" text NOT NULL,
	"canjeado_en" timestamp with time zone,
	"canje_ip" "inet",
	"dispositivo_id" uuid,
	"cancelado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "codigos_registro_tipo" CHECK (tipo in ('computadora_tienda', 'tablet_taller', 'telefono_escanear', 'puente_impresion', 'credencial_servidor')),
	CONSTRAINT "codigos_registro_estado" CHECK ("codigos_registro"."estado" in ('vigente', 'canjeado', 'cancelado')),
	CONSTRAINT "codigos_registro_canjeado" CHECK ("codigos_registro"."estado" <> 'canjeado' or "codigos_registro"."dispositivo_id" is not null),
	CONSTRAINT "codigos_registro_quien" CHECK ("codigos_registro"."creado_por" is not null)
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"ubicacion_id" uuid,
	"prefijo_folio" text,
	"llave_id" text NOT NULL,
	"llave_hash" text NOT NULL,
	"llave_anterior_hash" text,
	"llave_anterior_vence_en" timestamp with time zone,
	"llave_rotada_en" timestamp with time zone,
	"codigo_registro_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"baja_confirmado_con_google_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "dispositivos_tipo" CHECK (tipo in ('computadora_tienda', 'tablet_taller', 'telefono_escanear', 'puente_impresion', 'credencial_servidor')),
	CONSTRAINT "dispositivos_ubicacion" CHECK ("dispositivos"."ubicacion_id" is not null or "dispositivos"."tipo" = 'credencial_servidor'),
	CONSTRAINT "dispositivos_baja" CHECK ("dispositivos"."baja_en" is null or ("dispositivos"."motivo_baja" is not null and char_length("dispositivos"."motivo_baja") between 5 and 60 and "dispositivos"."baja_confirmado_con_google_en" is not null)),
	CONSTRAINT "dispositivos_nombre" CHECK (char_length("dispositivos"."nombre") between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "dispositivos_sync" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"cursor_xid" "xid8",
	"esquema_sync" integer,
	"foto_pedida_en" timestamp with time zone,
	"ultima_sincronizacion_en" timestamp with time zone,
	"ultima_subida_en" timestamp with time zone,
	"ultima_bajada_en" timestamp with time zone,
	"ultimo_contacto_en" timestamp with time zone,
	"pendientes_por_subir" integer DEFAULT 0 NOT NULL,
	"desfase_reloj_seg" integer,
	"aviso_sin_sincronizar_en" timestamp with time zone,
	"version_app" text,
	"ip" "inet",
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "codigos_registro" ADD CONSTRAINT "codigos_registro_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_registro" ADD CONSTRAINT "codigos_registro_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_registro" ADD CONSTRAINT "codigos_registro_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_codigo_registro_id_codigos_registro_id_fk" FOREIGN KEY ("codigo_registro_id") REFERENCES "public"."codigos_registro"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos_sync" ADD CONSTRAINT "dispositivos_sync_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_registro_hash" ON "codigos_registro" USING btree ("codigo_hash") WHERE "codigos_registro"."estado" = 'vigente';--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_folio" ON "dispositivos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_llave_id" ON "dispositivos" USING btree ("llave_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_prefijo_vigente" ON "dispositivos" USING btree ("prefijo_folio") WHERE "dispositivos"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "dispositivos_xid_escritura" ON "dispositivos" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_sync_dispositivo" ON "dispositivos_sync" USING btree ("dispositivo_id");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impresoras" ADD CONSTRAINT "impresoras_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/modulos/admin/dispositivos.md). `dispositivos` baja al aparato (su propio renglón):
-- su disparador pone `xid_escritura`. `dispositivos_sync` es técnica.
SELECT poner_disparador_comun('dispositivos', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('codigos_registro', baja_a_aparatos => false);
--> statement-breakpoint
-- De un aparato, la app solo cambia su llave y su baja: el folio, el tipo, la ubicación, el prefijo y el
-- `llave_id` no cambian.
REVOKE UPDATE ON dispositivos FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (llave_hash, llave_anterior_hash, llave_anterior_vence_en, llave_rotada_en, baja_en, baja_por, motivo_baja, baja_confirmado_con_google_en, actualizado_en, version) ON dispositivos TO uniformame_app;
--> statement-breakpoint
-- De un código, la app solo cambia su estado y lo de su canje o su cancelación: su hash y su vencimiento no.
REVOKE UPDATE ON codigos_registro FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (estado, canjeado_en, canje_ip, dispositivo_id, cancelado_en, actualizado_en, version) ON codigos_registro TO uniformame_app;
