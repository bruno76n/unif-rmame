CREATE TABLE "autorizaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'por_autorizar' NOT NULL,
	"departamento_origen_id" uuid NOT NULL,
	"resumen" text NOT NULL,
	"detalle" text,
	"importe_centavos" bigint,
	"importe_facturado_centavos" bigint,
	"cantidad" numeric(12, 3),
	"unidad" text,
	"ajuste_id" uuid,
	"recepcion_id" uuid,
	"orden_compra_linea_id" uuid,
	"nota_entrega_id" uuid,
	"nota_credito_id" uuid,
	"factura_proveedor_id" uuid,
	"desarrollo_id" uuid,
	"usuario_solicitado_id" uuid,
	"decidida_en" timestamp with time zone,
	"decidida_por" uuid,
	"decidida_desde_id" uuid,
	"motivo_rechazo" text,
	"misma_persona" boolean GENERATED ALWAYS AS (decidida_por = creado_por) STORED,
	"confirmado_con_google_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "autorizaciones_tipo" CHECK (tipo in ('ajuste_inventario', 'recepcion_de_mas', 'nota_credito', 'pago_fuera_de_lo_normal', 'aprobar_desarrollo', 'alta_usuario')),
	CONSTRAINT "autorizaciones_estado" CHECK ("autorizaciones"."estado" in ('por_autorizar', 'autorizada', 'rechazada', 'cancelada')),
	CONSTRAINT "autorizaciones_ligas" CHECK ((tipo = 'ajuste_inventario' and ajuste_id is not null and recepcion_id is null and orden_compra_linea_id is null and nota_entrega_id is null and nota_credito_id is null and factura_proveedor_id is null and desarrollo_id is null and usuario_solicitado_id is null) or (tipo = 'recepcion_de_mas' and recepcion_id is not null and orden_compra_linea_id is not null and ajuste_id is null and nota_entrega_id is null and nota_credito_id is null and factura_proveedor_id is null and desarrollo_id is null and usuario_solicitado_id is null) or (tipo = 'nota_credito' and nota_entrega_id is not null and nota_credito_id is not null and ajuste_id is null and recepcion_id is null and orden_compra_linea_id is null and factura_proveedor_id is null and desarrollo_id is null and usuario_solicitado_id is null) or (tipo = 'pago_fuera_de_lo_normal' and factura_proveedor_id is not null and ajuste_id is null and recepcion_id is null and orden_compra_linea_id is null and nota_entrega_id is null and nota_credito_id is null and desarrollo_id is null and usuario_solicitado_id is null) or (tipo = 'aprobar_desarrollo' and desarrollo_id is not null and ajuste_id is null and recepcion_id is null and orden_compra_linea_id is null and nota_entrega_id is null and nota_credito_id is null and factura_proveedor_id is null and usuario_solicitado_id is null) or (tipo = 'alta_usuario' and usuario_solicitado_id is not null and ajuste_id is null and recepcion_id is null and orden_compra_linea_id is null and nota_entrega_id is null and nota_credito_id is null and factura_proveedor_id is null and desarrollo_id is null)),
	CONSTRAINT "autorizaciones_rechazo" CHECK ("autorizaciones"."estado" <> 'rechazada' or char_length("autorizaciones"."motivo_rechazo") between 5 and 90),
	CONSTRAINT "autorizaciones_decision" CHECK ("autorizaciones"."estado" not in ('autorizada', 'rechazada') or ("autorizaciones"."decidida_en" is not null and "autorizaciones"."decidida_por" is not null)),
	CONSTRAINT "autorizaciones_cancelacion" CHECK ("autorizaciones"."estado" <> 'cancelada' or "autorizaciones"."cancelado_en" is not null)
);
--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_departamento_origen_id_departamentos_id_fk" FOREIGN KEY ("departamento_origen_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_usuario_solicitado_id_usuarios_id_fk" FOREIGN KEY ("usuario_solicitado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_decidida_por_usuarios_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_decidida_desde_id_departamentos_id_fk" FOREIGN KEY ("decidida_desde_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_folio" ON "autorizaciones" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "autorizaciones_por_autorizar" ON "autorizaciones" USING btree ("estado","creado_en") WHERE "autorizaciones"."estado" = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_ajuste" ON "autorizaciones" USING btree ("ajuste_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_recepcion" ON "autorizaciones" USING btree ("recepcion_id","orden_compra_linea_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_nota_entrega" ON "autorizaciones" USING btree ("nota_entrega_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_nota_credito" ON "autorizaciones" USING btree ("nota_credito_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_factura_proveedor" ON "autorizaciones" USING btree ("factura_proveedor_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_desarrollo" ON "autorizaciones" USING btree ("desarrollo_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "autorizaciones_una_pendiente_usuario_solicitado" ON "autorizaciones" USING btree ("usuario_solicitado_id") WHERE estado = 'por_autorizar';--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes las pone el disparador.
SELECT poner_disparador_comun('autorizaciones', baja_a_aparatos => false);
