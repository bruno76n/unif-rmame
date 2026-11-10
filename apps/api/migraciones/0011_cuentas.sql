CREATE TABLE "departamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"nombre" text NOT NULL,
	"grupo" text,
	"orden" integer NOT NULL,
	"asignable_en_alta" boolean NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "departamentos_clave_valida" CHECK (clave in ('direccion', 'compras', 'catalogo', 'patronaje', 'ventas', 'linea', 'produccion', 'puerta_taller', 'calidad', 'mantenimiento', 'aduana', 'bodega', 'contaduria', 'personal', 'admin')),
	CONSTRAINT "departamentos_grupo" CHECK ("departamentos"."grupo" in ('operacion', 'taller', 'almacen', 'administracion'))
);
--> statement-breakpoint
CREATE UNLOGGED TABLE "intentos_recientes" (
	"clave" text PRIMARY KEY NOT NULL,
	"ventana_inicio" timestamp with time zone NOT NULL,
	"intentos" integer NOT NULL,
	"bloqueado_hasta" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permisos_finos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"permiso" text NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "permisos_finos_permiso" CHECK ("permisos_finos"."permiso" in ('ven_sueldos_y_tarifas', 'imprime_guias'))
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ultima_actividad_en" timestamp with time zone NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"ip" "inet",
	"ciudad_aproximada" text,
	"agente" text,
	"aparato" text,
	"huella_aparato" text,
	"es_aparato_nuevo" boolean DEFAULT false NOT NULL,
	"dispositivo_id" uuid,
	"google_confirmado_en" timestamp with time zone,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	"motivo_cierre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "sesiones_motivo" CHECK ("sesiones"."motivo_cierre" in ('salio', 'inactividad', 'duracion_maxima', 'cerrada_por_otra_cuenta', 'acceso_quitado')),
	CONSTRAINT "sesiones_cerrada_con_motivo" CHECK (("sesiones"."cerrada_en" is null) = ("sesiones"."motivo_cierre" is null))
);
--> statement-breakpoint
CREATE TABLE "usuario_departamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"departamento_id" uuid NOT NULL,
	"ubicacion_id" uuid,
	"confirmado_con_google_en" timestamp with time zone,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid,
	"correo" text NOT NULL,
	"google_sub" text,
	"estado" text NOT NULL,
	"es_duena" boolean DEFAULT false NOT NULL,
	"es_soporte" boolean DEFAULT false NOT NULL,
	"nombre" text,
	"autorizacion_id" uuid,
	"activada_en" timestamp with time zone,
	"activada_por" uuid,
	"confirmado_con_google_en" timestamp with time zone,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"baja_confirmado_con_google_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usuarios_estado" CHECK ("usuarios"."estado" in ('solicitada', 'activa', 'rechazada', 'sin_acceso')),
	CONSTRAINT "usuarios_persona" CHECK ("usuarios"."persona_id" is not null or "usuarios"."es_soporte"),
	CONSTRAINT "usuarios_baja_confirmada" CHECK ("usuarios"."baja_en" is null or "usuarios"."baja_confirmado_con_google_en" is not null)
);
--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permisos_finos" ADD CONSTRAINT "permisos_finos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permisos_finos" ADD CONSTRAINT "permisos_finos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permisos_finos" ADD CONSTRAINT "permisos_finos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_departamentos" ADD CONSTRAINT "usuario_departamentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_departamentos" ADD CONSTRAINT "usuario_departamentos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_departamentos" ADD CONSTRAINT "usuario_departamentos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_departamentos" ADD CONSTRAINT "usuario_departamentos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_departamentos" ADD CONSTRAINT "usuario_departamentos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_activada_por_usuarios_id_fk" FOREIGN KEY ("activada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departamentos_clave" ON "departamentos" USING btree ("clave");--> statement-breakpoint
CREATE UNIQUE INDEX "permisos_finos_vigente" ON "permisos_finos" USING btree ("usuario_id","permiso") WHERE "permisos_finos"."baja_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token" ON "sesiones" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sesiones_abiertas" ON "sesiones" USING btree ("usuario_id") WHERE "sesiones"."cerrada_en" is null;--> statement-breakpoint
CREATE INDEX "sesiones_aparato" ON "sesiones" USING btree ("usuario_id","huella_aparato");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_departamentos_vigente" ON "usuario_departamentos" USING btree ("usuario_id","departamento_id") WHERE "usuario_departamentos"."baja_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_persona_viva" ON "usuarios" USING btree ("persona_id") WHERE "usuarios"."estado" in ('solicitada', 'activa');--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_correo_vivo" ON "usuarios" USING btree ("correo") WHERE "usuarios"."estado" in ('solicitada', 'activa');--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_google_sub" ON "usuarios" USING btree ("google_sub") WHERE "usuarios"."estado" = 'activa';--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_una_duena" ON "usuarios" USING btree ("es_duena") WHERE "usuarios"."es_duena";--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitacora" ADD CONSTRAINT "bitacora_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_descartado_por_usuarios_id_fk" FOREIGN KEY ("descartado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_retenido_aplicado_por_usuarios_id_fk" FOREIGN KEY ("retenido_aplicado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contadores_folio" ADD CONSTRAINT "contadores_folio_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impresoras" ADD CONSTRAINT "impresoras_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impresoras" ADD CONSTRAINT "impresoras_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_valores" ADD CONSTRAINT "lista_valores_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_valores" ADD CONSTRAINT "lista_valores_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas" ADD CONSTRAINT "listas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros" ADD CONSTRAINT "parametros_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_historial" ADD CONSTRAINT "parametros_historial_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restauraciones_probadas" ADD CONSTRAINT "restauraciones_probadas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_impresion" ADD CONSTRAINT "trabajos_impresion_pedido_por_usuarios_id_fk" FOREIGN KEY ("pedido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_impresion" ADD CONSTRAINT "trabajos_impresion_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trabajos_impresion" ADD CONSTRAINT "trabajos_impresion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/modulos/admin/permisos.md, cuentas.md y acceso-con-google.md).
-- `intentos_recientes` es UNLOGGED (arriba): si se pierde al reiniciar la base, no pasa nada.
-- Las columnas comunes en las tablas de negocio; `sesiones` e `intentos_recientes` son técnicas.
SELECT poner_disparador_comun('departamentos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('usuarios', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('usuario_departamentos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('permisos_finos', baja_a_aparatos => false);
--> statement-breakpoint
-- Los departamentos son fijos: los siembra la migración y la app solo los lee.
REVOKE INSERT, UPDATE ON departamentos FROM uniformame_app;
--> statement-breakpoint
-- `es_duena` y `es_soporte` solo cambian con la siembra de la puesta en marcha: la app no los pone ni los
-- cambia.
CREATE FUNCTION cuidar_duena_y_soporte() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
BEGIN
	IF current_user = 'uniformame_app' AND (
		(TG_OP = 'INSERT' AND (NEW.es_duena OR NEW.es_soporte))
		OR (TG_OP = 'UPDATE' AND (NEW.es_duena IS DISTINCT FROM OLD.es_duena OR NEW.es_soporte IS DISTINCT FROM OLD.es_soporte))
	) THEN
		RAISE EXCEPTION 'es_duena y es_soporte solo cambian con la siembra' USING ERRCODE = 'insufficient_privilege';
	END IF;
	RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER cuidar_duena_y_soporte BEFORE INSERT OR UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION cuidar_duena_y_soporte();
--> statement-breakpoint
-- De una sesión, la app solo escribe su actividad, su confirmación con Google y su cierre: el hash del
-- token, la cuenta y el aparato no cambian.
REVOKE UPDATE ON sesiones FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (ultima_actividad_en, google_confirmado_en, cerrada_en, cerrada_por, motivo_cierre, actualizado_en) ON sesiones TO uniformame_app;
--> statement-breakpoint
-- Los intentos se depuran cuando pasa su ventana.
GRANT DELETE ON intentos_recientes TO uniformame_app;
