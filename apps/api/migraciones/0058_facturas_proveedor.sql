CREATE TABLE "cuentas_por_pagar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"factura_proveedor_id" uuid,
	"deuda_mensualidad_id" uuid,
	"fecha" date NOT NULL,
	"vence" date NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"saldo_centavos" bigint NOT NULL,
	"estado" text NOT NULL,
	"pagada_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cuentas_por_pagar_tipo" CHECK ("cuentas_por_pagar"."tipo" in ('proveedor', 'acreedor')),
	CONSTRAINT "cuentas_por_pagar_documento" CHECK (("cuentas_por_pagar"."factura_proveedor_id" is not null) = ("cuentas_por_pagar"."tipo" = 'proveedor')
				and ("cuentas_por_pagar"."deuda_mensualidad_id" is not null) = ("cuentas_por_pagar"."tipo" = 'acreedor')),
	CONSTRAINT "cuentas_por_pagar_importe" CHECK ("cuentas_por_pagar"."importe_centavos" > 0),
	CONSTRAINT "cuentas_por_pagar_saldo" CHECK ("cuentas_por_pagar"."saldo_centavos" between 0 and "cuentas_por_pagar"."importe_centavos"),
	CONSTRAINT "cuentas_por_pagar_estado" CHECK ("cuentas_por_pagar"."estado" in ('detenida', 'por_pagar', 'pagada_en_parte', 'pagada', 'cancelada')),
	CONSTRAINT "cuentas_por_pagar_pagada" CHECK (("cuentas_por_pagar"."estado" = 'pagada') = ("cuentas_por_pagar"."saldo_centavos" = 0)
				and ("cuentas_por_pagar"."estado" = 'pagada') = ("cuentas_por_pagar"."pagada_en" is not null)
				and ("cuentas_por_pagar"."estado" not in ('detenida', 'por_pagar', 'cancelada')
					or "cuentas_por_pagar"."saldo_centavos" = "cuentas_por_pagar"."importe_centavos")
				and ("cuentas_por_pagar"."estado" <> 'pagada_en_parte' or "cuentas_por_pagar"."saldo_centavos" < "cuentas_por_pagar"."importe_centavos")),
	CONSTRAINT "cuentas_por_pagar_cancelada" CHECK (("cuentas_por_pagar"."estado" = 'cancelada') = ("cuentas_por_pagar"."cancelado_en" is not null and "cuentas_por_pagar"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
CREATE TABLE "factura_proveedor_ordenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"factura_proveedor_id" uuid NOT NULL,
	"orden_compra_id" uuid NOT NULL,
	"importe_facturado_centavos" bigint NOT NULL,
	"valor_recibido_centavos" bigint NOT NULL,
	"sin_recepcion" boolean NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "factura_proveedor_ordenes_importes" CHECK ("factura_proveedor_ordenes"."importe_facturado_centavos" > 0 and "factura_proveedor_ordenes"."valor_recibido_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "facturas_proveedor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"folio_proveedor" text NOT NULL,
	"uuid_cfdi" text,
	"proveedor_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"fecha_captura" date NOT NULL,
	"fecha_factura" date,
	"subtotal_centavos" bigint NOT NULL,
	"iva_centavos" bigint NOT NULL,
	"total_facturado_centavos" bigint NOT NULL,
	"valor_recibido_centavos" bigint NOT NULL,
	"estado" text NOT NULL,
	"motivo_detencion" text,
	"responsable_detencion" text,
	"autorizacion_id" uuid,
	"monto_autorizado_centavos" bigint,
	"diferencia_por_aclarar_centavos" bigint,
	"nota_credito_proveedor" text,
	"diferencia_aclarada_en" timestamp with time zone,
	"diferencia_aclarada_por" uuid,
	"diferencia_aclarada_archivo_id" uuid,
	"archivo_xml_id" uuid,
	"archivo_pdf_id" uuid,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "facturas_proveedor_folio_proveedor" CHECK (char_length("facturas_proveedor"."folio_proveedor") between 3 and 12 and "facturas_proveedor"."folio_proveedor" = upper("facturas_proveedor"."folio_proveedor")),
	CONSTRAINT "facturas_proveedor_importes" CHECK ("facturas_proveedor"."subtotal_centavos" > 0 and "facturas_proveedor"."iva_centavos" >= 0
				and "facturas_proveedor"."subtotal_centavos" + "facturas_proveedor"."iva_centavos" = "facturas_proveedor"."total_facturado_centavos"
				and "facturas_proveedor"."valor_recibido_centavos" >= 0),
	CONSTRAINT "facturas_proveedor_fecha" CHECK ("facturas_proveedor"."fecha_factura" <= "facturas_proveedor"."fecha_captura"),
	CONSTRAINT "facturas_proveedor_estado" CHECK ("facturas_proveedor"."estado" in ('detenida', 'esperando_autorizacion', 'conciliada', 'autorizada', 'cancelada')),
	CONSTRAINT "facturas_proveedor_detenida" CHECK ("facturas_proveedor"."responsable_detencion" in ('aduana', 'contaduria')
				and ("facturas_proveedor"."estado" not in ('detenida', 'esperando_autorizacion')
					or ("facturas_proveedor"."motivo_detencion" is not null and "facturas_proveedor"."responsable_detencion" is not null))
				and ("facturas_proveedor"."estado" <> 'esperando_autorizacion' or "facturas_proveedor"."autorizacion_id" is not null)),
	CONSTRAINT "facturas_proveedor_autorizada" CHECK (("facturas_proveedor"."estado" <> 'autorizada'
					or ("facturas_proveedor"."monto_autorizado_centavos" is not null and "facturas_proveedor"."diferencia_por_aclarar_centavos" is not null))
				and "facturas_proveedor"."monto_autorizado_centavos" between 1 and "facturas_proveedor"."total_facturado_centavos"
				and "facturas_proveedor"."diferencia_por_aclarar_centavos" = "facturas_proveedor"."total_facturado_centavos" - "facturas_proveedor"."monto_autorizado_centavos"),
	CONSTRAINT "facturas_proveedor_aclarada" CHECK (("facturas_proveedor"."nota_credito_proveedor" is null) = ("facturas_proveedor"."diferencia_aclarada_en" is null)
				and ("facturas_proveedor"."nota_credito_proveedor" is null or "facturas_proveedor"."estado" = 'autorizada')),
	CONSTRAINT "facturas_proveedor_cancelada" CHECK (("facturas_proveedor"."estado" = 'cancelada') = ("facturas_proveedor"."cancelado_en" is not null and "facturas_proveedor"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_monto";--> statement-breakpoint
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_factura_proveedor_id_facturas_proveedor_id_fk" FOREIGN KEY ("factura_proveedor_id") REFERENCES "public"."facturas_proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_proveedor_ordenes" ADD CONSTRAINT "factura_proveedor_ordenes_factura_proveedor_id_facturas_proveedor_id_fk" FOREIGN KEY ("factura_proveedor_id") REFERENCES "public"."facturas_proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_proveedor_ordenes" ADD CONSTRAINT "factura_proveedor_ordenes_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_proveedor_ordenes" ADD CONSTRAINT "factura_proveedor_ordenes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_diferencia_aclarada_por_usuarios_id_fk" FOREIGN KEY ("diferencia_aclarada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_diferencia_aclarada_archivo_id_archivos_id_fk" FOREIGN KEY ("diferencia_aclarada_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_archivo_xml_id_archivos_id_fk" FOREIGN KEY ("archivo_xml_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_archivo_pdf_id_archivos_id_fk" FOREIGN KEY ("archivo_pdf_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_proveedor" ADD CONSTRAINT "facturas_proveedor_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_por_pagar_factura" ON "cuentas_por_pagar" USING btree ("factura_proveedor_id") WHERE "cuentas_por_pagar"."factura_proveedor_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_por_pagar_mensualidad" ON "cuentas_por_pagar" USING btree ("deuda_mensualidad_id") WHERE "cuentas_por_pagar"."deuda_mensualidad_id" is not null;--> statement-breakpoint
CREATE INDEX "cuentas_por_pagar_tercero" ON "cuentas_por_pagar" USING btree ("tercero_id","estado");--> statement-breakpoint
CREATE INDEX "cuentas_por_pagar_vence" ON "cuentas_por_pagar" USING btree ("vence") WHERE "cuentas_por_pagar"."estado" not in ('pagada', 'cancelada');--> statement-breakpoint
CREATE UNIQUE INDEX "factura_proveedor_ordenes_orden" ON "factura_proveedor_ordenes" USING btree ("factura_proveedor_id","orden_compra_id");--> statement-breakpoint
CREATE INDEX "factura_proveedor_ordenes_orden_compra" ON "factura_proveedor_ordenes" USING btree ("orden_compra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_proveedor_folio" ON "facturas_proveedor" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_proveedor_folio_proveedor" ON "facturas_proveedor" USING btree ("proveedor_id","folio_proveedor") WHERE "facturas_proveedor"."estado" <> 'cancelada';--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_proveedor_uuid_cfdi" ON "facturas_proveedor" USING btree ("uuid_cfdi") WHERE "facturas_proveedor"."uuid_cfdi" is not null;--> statement-breakpoint
CREATE INDEX "facturas_proveedor_estado" ON "facturas_proveedor" USING btree ("estado");--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_cuenta_por_pagar_id_cuentas_por_pagar_id_fk" FOREIGN KEY ("cuenta_por_pagar_id") REFERENCES "public"."cuentas_por_pagar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_factura_proveedor_id_facturas_proveedor_id_fk" FOREIGN KEY ("factura_proveedor_id") REFERENCES "public"."facturas_proveedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto" CHECK ("pagos"."monto_centavos" > 0
				and ("pagos"."monto_centavos" % 100 = 0
					or "pagos"."concepto" in ('nota', 'cuenta_por_pagar', 'devolucion_saldo_favor')));--> statement-breakpoint
SELECT poner_disparador_comun('facturas_proveedor', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('factura_proveedor_ordenes', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('cuentas_por_pagar', baja_a_aparatos => false);
