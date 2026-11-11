CREATE TABLE "desarrollo_eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"desarrollo_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"etapa_antes" text,
	"etapa_despues" text NOT NULL,
	"motivo" text,
	"autorizacion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "desarrollo_eventos_accion" CHECK ("desarrollo_eventos"."accion" in ('solicitud_registrada', 'muestra_empezada', 'muestra_entregada', 'cambios_pedidos', 'aprobado', 'alta_en_catalogo', 'cancelado')),
	CONSTRAINT "desarrollo_eventos_motivo" CHECK (("desarrollo_eventos"."motivo" is not null) = ("desarrollo_eventos"."accion" in ('cambios_pedidos', 'cancelado')))
);
--> statement-breakpoint
CREATE TABLE "desarrollos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"etapa" text DEFAULT 'solicitud' NOT NULL,
	"escuela_id" uuid,
	"prenda" text NOT NULL,
	"tela_material_id" uuid NOT NULL,
	"tallas" text NOT NULL,
	"descripcion" text,
	"muestra_talla" text,
	"muestra_empezada_en" timestamp with time zone,
	"muestra_entregada_en" timestamp with time zone,
	"motivo_cambios" text,
	"autorizacion_id" uuid,
	"aprobado_en" timestamp with time zone,
	"aprobado_por" uuid,
	"aprobado_por_tipo" text,
	"producto_id" uuid,
	"en_catalogo_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "desarrollos_etapa" CHECK ("desarrollos"."etapa" in ('solicitud', 'muestra', 'aprobacion', 'ficha_tecnica', 'en_catalogo', 'cancelado')),
	CONSTRAINT "desarrollos_prenda" CHECK (char_length("desarrollos"."prenda") between 4 and 60),
	CONSTRAINT "desarrollos_tallas" CHECK (char_length("desarrollos"."tallas") between 1 and 30),
	CONSTRAINT "desarrollos_descripcion" CHECK (char_length("desarrollos"."descripcion") <= 200),
	CONSTRAINT "desarrollos_muestra_talla" CHECK (char_length("desarrollos"."muestra_talla") <= 10),
	CONSTRAINT "desarrollos_aprobado_por_tipo" CHECK ("desarrollos"."aprobado_por_tipo" in ('cliente', 'direccion')),
	CONSTRAINT "desarrollos_aprueba_direccion" CHECK ("desarrollos"."aprobado_por_tipo" is null or ("desarrollos"."aprobado_por_tipo" = 'direccion') = ("desarrollos"."escuela_id" is null)),
	CONSTRAINT "desarrollos_en_catalogo" CHECK ("desarrollos"."etapa" <> 'en_catalogo' or "desarrollos"."producto_id" is not null),
	CONSTRAINT "desarrollos_cancelado" CHECK (("desarrollos"."etapa" = 'cancelado') = ("desarrollos"."cancelado_en" is not null and "desarrollos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "desarrollo_eventos" ADD CONSTRAINT "desarrollo_eventos_desarrollo_id_desarrollos_id_fk" FOREIGN KEY ("desarrollo_id") REFERENCES "public"."desarrollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollo_eventos" ADD CONSTRAINT "desarrollo_eventos_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollo_eventos" ADD CONSTRAINT "desarrollo_eventos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_escuela_id_escuelas_id_fk" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_tela_material_id_materiales_id_fk" FOREIGN KEY ("tela_material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desarrollos" ADD CONSTRAINT "desarrollos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desarrollo_eventos_desarrollo" ON "desarrollo_eventos" USING btree ("desarrollo_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "desarrollos_folio" ON "desarrollos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "desarrollos_producto" ON "desarrollos" USING btree ("producto_id") WHERE "desarrollos"."producto_id" is not null;--> statement-breakpoint
CREATE INDEX "desarrollos_en_proceso" ON "desarrollos" USING btree ("etapa") WHERE "desarrollos"."etapa" not in ('en_catalogo', 'cancelado');--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_desarrollo_id_desarrollos_id_fk" FOREIGN KEY ("desarrollo_id") REFERENCES "public"."desarrollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; el historial de un desarrollo solo crece.
SELECT poner_disparador_comun('desarrollos', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('desarrollo_eventos', baja_a_aparatos => false);--> statement-breakpoint
SELECT marcar_solo_crece('desarrollo_eventos');
