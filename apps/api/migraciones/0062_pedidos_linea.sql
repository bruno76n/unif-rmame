CREATE TABLE "pedido_linea_renglones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_linea_id" uuid NOT NULL,
	"renglon" smallint NOT NULL,
	"variante_id" uuid NOT NULL,
	"producto_nombre" text NOT NULL,
	"talla" text NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"paquete_numero" smallint,
	"descuento_paquete_centavos" bigint DEFAULT 0 NOT NULL,
	"descuento_centavos" bigint DEFAULT 0 NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pedido_linea_renglones_cantidad" CHECK ("pedido_linea_renglones"."cantidad" > 0),
	CONSTRAINT "pedido_linea_renglones_montos" CHECK ("pedido_linea_renglones"."precio_unitario_centavos" >= 0 and "pedido_linea_renglones"."descuento_paquete_centavos" >= 0 and "pedido_linea_renglones"."descuento_centavos" >= 0),
	CONSTRAINT "pedido_linea_renglones_importe" CHECK ("pedido_linea_renglones"."importe_centavos" = "pedido_linea_renglones"."cantidad" * "pedido_linea_renglones"."precio_unitario_centavos" - "pedido_linea_renglones"."descuento_paquete_centavos" - "pedido_linea_renglones"."descuento_centavos")
);
--> statement-breakpoint
CREATE TABLE "pedidos_linea" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"cliente_nombre" text NOT NULL,
	"cliente_correo" text NOT NULL,
	"cliente_telefono" text,
	"envio_destinatario" text NOT NULL,
	"envio_telefono" text,
	"envio_calle" text NOT NULL,
	"envio_numero_exterior" text NOT NULL,
	"envio_numero_interior" text,
	"envio_colonia" text NOT NULL,
	"envio_municipio" text NOT NULL,
	"envio_entidad_federativa" text NOT NULL,
	"envio_codigo_postal" text NOT NULL,
	"envio_referencias" text,
	"envio_metodo" text NOT NULL,
	"envio_paqueteria" text NOT NULL,
	"envio_costo_centavos" bigint NOT NULL,
	"cupon_codigo" text,
	"subtotal_centavos" bigint NOT NULL,
	"descuento_centavos" bigint NOT NULL,
	"descuento_envio_centavos" bigint NOT NULL,
	"total_centavos" bigint NOT NULL,
	"estado" text NOT NULL,
	"estado_en" timestamp with time zone NOT NULL,
	"promesa" text,
	"pago_estado" text NOT NULL,
	"pago_pasarela" text NOT NULL,
	"pago_referencia" text NOT NULL,
	"pago_metodo" text NOT NULL,
	"pago_monto_centavos" bigint NOT NULL,
	"pago_comision_centavos" bigint,
	"pagado_en" timestamp with time zone,
	"pago_vence_en" timestamp with time zone,
	"pago_respuesta" jsonb,
	"dispositivo_id" uuid NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pedidos_linea_estado" CHECK ("pedidos_linea"."estado" in ('esperando_pago', 'por_surtir', 'esperando_prendas', 'listo_para_empacar', 'cancelado', 'vencido')),
	CONSTRAINT "pedidos_linea_promesa" CHECK ("pedidos_linea"."promesa" is null or "pedidos_linea"."promesa" in ('sale_hoy', 'sale_manana')),
	CONSTRAINT "pedidos_linea_pago_estado" CHECK ("pedidos_linea"."pago_estado" in ('pagado', 'pendiente', 'vencido')),
	CONSTRAINT "pedidos_linea_montos" CHECK ("pedidos_linea"."envio_costo_centavos" >= 0 and "pedidos_linea"."subtotal_centavos" >= 0 and "pedidos_linea"."descuento_centavos" >= 0
				and "pedidos_linea"."descuento_envio_centavos" >= 0 and "pedidos_linea"."pago_monto_centavos" >= 0
				and ("pedidos_linea"."pago_comision_centavos" is null or "pedidos_linea"."pago_comision_centavos" >= 0)),
	CONSTRAINT "pedidos_linea_pagado" CHECK (("pedidos_linea"."pago_estado" <> 'pagado' or "pedidos_linea"."pagado_en" is not null)
				and ("pedidos_linea"."pago_estado" <> 'pendiente' or "pedidos_linea"."pago_vence_en" is not null)),
	CONSTRAINT "pedidos_linea_cancelado" CHECK (("pedidos_linea"."estado" = 'cancelado') = ("pedidos_linea"."cancelado_en" is not null and "pedidos_linea"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "pedido_linea_renglones" ADD CONSTRAINT "pedido_linea_renglones_pedido_linea_id_pedidos_linea_id_fk" FOREIGN KEY ("pedido_linea_id") REFERENCES "public"."pedidos_linea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_linea_renglones" ADD CONSTRAINT "pedido_linea_renglones_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_linea_renglones" ADD CONSTRAINT "pedido_linea_renglones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_linea" ADD CONSTRAINT "pedidos_linea_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_linea" ADD CONSTRAINT "pedidos_linea_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_linea" ADD CONSTRAINT "pedidos_linea_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_linea_renglones_renglon" ON "pedido_linea_renglones" USING btree ("pedido_linea_id","renglon");--> statement-breakpoint
CREATE INDEX "pedido_linea_renglones_variante" ON "pedido_linea_renglones" USING btree ("variante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_linea_folio" ON "pedidos_linea" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_linea_pago" ON "pedidos_linea" USING btree ("pago_pasarela","pago_referencia");--> statement-breakpoint
CREATE INDEX "pedidos_linea_estado" ON "pedidos_linea" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "pedidos_linea_correo" ON "pedidos_linea" USING btree ("cliente_correo");--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_pedido_linea_id_pedidos_linea_id_fk" FOREIGN KEY ("pedido_linea_id") REFERENCES "public"."pedidos_linea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_pedido_linea_renglon_id_pedido_linea_renglones_id_fk" FOREIGN KEY ("pedido_linea_renglon_id") REFERENCES "public"."pedido_linea_renglones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_pedido_linea_id_pedidos_linea_id_fk" FOREIGN KEY ("pedido_linea_id") REFERENCES "public"."pedidos_linea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT poner_disparador_comun('pedidos_linea', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('pedido_linea_renglones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('pedido_linea_renglones');
