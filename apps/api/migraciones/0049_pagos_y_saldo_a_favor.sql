CREATE TABLE "aplicaciones_pago" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pago_id" uuid,
	"compensacion_id" uuid,
	"nota_credito_id" uuid,
	"saldo_favor_movimiento_id" uuid,
	"cuenta_por_cobrar_id" uuid,
	"cuenta_por_pagar_id" uuid,
	"monto_centavos" bigint NOT NULL,
	"fecha" date NOT NULL,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "aplicaciones_pago_origen" CHECK (num_nonnulls("aplicaciones_pago"."pago_id", "aplicaciones_pago"."compensacion_id", "aplicaciones_pago"."nota_credito_id", "aplicaciones_pago"."saldo_favor_movimiento_id") = 1),
	CONSTRAINT "aplicaciones_pago_destino" CHECK (num_nonnulls("aplicaciones_pago"."cuenta_por_cobrar_id", "aplicaciones_pago"."cuenta_por_pagar_id") = 1),
	CONSTRAINT "aplicaciones_pago_monto" CHECK ("aplicaciones_pago"."monto_centavos" > 0),
	CONSTRAINT "aplicaciones_pago_estado" CHECK ("aplicaciones_pago"."estado" in ('vigente', 'cancelada')),
	CONSTRAINT "aplicaciones_pago_cancelada" CHECK (("aplicaciones_pago"."estado" = 'cancelada') = ("aplicaciones_pago"."cancelado_en" is not null and "aplicaciones_pago"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"direccion" text NOT NULL,
	"concepto" text NOT NULL,
	"fecha" date NOT NULL,
	"tercero_id" uuid NOT NULL,
	"cliente_id" uuid,
	"nota_entrega_id" uuid,
	"pedido_id" uuid,
	"monto_centavos" bigint NOT NULL,
	"medio" text NOT NULL,
	"cuenta_fabrica_id" uuid,
	"tercero_deposito_id" uuid,
	"referencia" text,
	"confirmado_con_google_en" timestamp with time zone,
	"estado" text DEFAULT 'registrado' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pagos_direccion" CHECK ("pagos"."direccion" in ('recibido', 'emitido')),
	CONSTRAINT "pagos_concepto" CHECK (("pagos"."direccion" = 'recibido' and "pagos"."concepto" in ('nota', 'pedido'))
				or ("pagos"."direccion" = 'emitido' and "pagos"."concepto" in ('cuenta_por_pagar', 'devolucion_saldo_favor'))),
	CONSTRAINT "pagos_cliente" CHECK (("pagos"."cliente_id" is not null) = ("pagos"."direccion" = 'recibido' or "pagos"."concepto" = 'devolucion_saldo_favor')),
	CONSTRAINT "pagos_documento" CHECK (("pagos"."nota_entrega_id" is not null) = ("pagos"."concepto" = 'nota')
				and ("pagos"."pedido_id" is not null) = ("pagos"."concepto" = 'pedido')),
	CONSTRAINT "pagos_monto" CHECK ("pagos"."monto_centavos" > 0 and "pagos"."monto_centavos" % 100 = 0),
	CONSTRAINT "pagos_medio" CHECK ("pagos"."medio" in ('efectivo', 'cuenta_fabrica', 'cuenta_tercero')
				and ("pagos"."medio" <> 'cuenta_tercero' or "pagos"."direccion" = 'recibido')),
	CONSTRAINT "pagos_cuenta_fabrica" CHECK (("pagos"."cuenta_fabrica_id" is not null) = ("pagos"."medio" = 'cuenta_fabrica')),
	CONSTRAINT "pagos_tercero_deposito" CHECK (("pagos"."tercero_deposito_id" is not null) = ("pagos"."medio" = 'cuenta_tercero')
				and "pagos"."tercero_deposito_id" is distinct from "pagos"."tercero_id"),
	CONSTRAINT "pagos_referencia" CHECK (char_length("pagos"."referencia") between 3 and 30
				and ("pagos"."referencia" is not null or ("pagos"."medio" = 'efectivo' and "pagos"."direccion" = 'recibido'))),
	CONSTRAINT "pagos_confirmado" CHECK (("pagos"."confirmado_con_google_en" is not null) = ("pagos"."direccion" = 'emitido')),
	CONSTRAINT "pagos_estado" CHECK ("pagos"."estado" in ('registrado', 'cancelado')),
	CONSTRAINT "pagos_cancelado" CHECK (("pagos"."estado" = 'cancelado') = ("pagos"."cancelado_en" is not null and "pagos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
CREATE TABLE "saldo_favor_movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"origen" text,
	"monto_centavos" bigint NOT NULL,
	"fecha" date NOT NULL,
	"pedido_id" uuid,
	"nota_credito_id" uuid,
	"cuenta_por_cobrar_id" uuid,
	"pago_id" uuid,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "saldo_favor_movimientos_tipo" CHECK ("saldo_favor_movimientos"."tipo" in ('entra', 'aplicado_nota', 'aplicado_pedido', 'devuelto')),
	CONSTRAINT "saldo_favor_movimientos_origen" CHECK (("saldo_favor_movimientos"."origen" is not null) = ("saldo_favor_movimientos"."tipo" = 'entra')
				and ("saldo_favor_movimientos"."origen" is null or "saldo_favor_movimientos"."origen" in ('anticipo_pedido', 'nota_credito'))),
	CONSTRAINT "saldo_favor_movimientos_documento" CHECK ((coalesce("saldo_favor_movimientos"."origen", '') <> 'anticipo_pedido' or "saldo_favor_movimientos"."pedido_id" is not null)
				and (coalesce("saldo_favor_movimientos"."origen", '') = 'nota_credito') = ("saldo_favor_movimientos"."nota_credito_id" is not null)
				and ("saldo_favor_movimientos"."tipo" = 'aplicado_nota') = ("saldo_favor_movimientos"."cuenta_por_cobrar_id" is not null)
				and ("saldo_favor_movimientos"."tipo" <> 'aplicado_pedido' or "saldo_favor_movimientos"."pedido_id" is not null)
				and ("saldo_favor_movimientos"."tipo" = 'devuelto') = ("saldo_favor_movimientos"."pago_id" is not null)),
	CONSTRAINT "saldo_favor_movimientos_monto" CHECK ("saldo_favor_movimientos"."monto_centavos" > 0),
	CONSTRAINT "saldo_favor_movimientos_estado" CHECK ("saldo_favor_movimientos"."estado" in ('vigente', 'cancelado')),
	CONSTRAINT "saldo_favor_movimientos_cancelado" CHECK (("saldo_favor_movimientos"."estado" = 'cancelado') = ("saldo_favor_movimientos"."cancelado_en" is not null and "saldo_favor_movimientos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_saldo_favor_movimiento_id_saldo_favor_movimientos_id_fk" FOREIGN KEY ("saldo_favor_movimiento_id") REFERENCES "public"."saldo_favor_movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_cuenta_por_cobrar_id_cuentas_por_cobrar_id_fk" FOREIGN KEY ("cuenta_por_cobrar_id") REFERENCES "public"."cuentas_por_cobrar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_fabrica_id_lista_valores_id_fk" FOREIGN KEY ("cuenta_fabrica_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tercero_deposito_id_terceros_id_fk" FOREIGN KEY ("tercero_deposito_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_cuenta_por_cobrar_id_cuentas_por_cobrar_id_fk" FOREIGN KEY ("cuenta_por_cobrar_id") REFERENCES "public"."cuentas_por_cobrar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_pago" ON "aplicaciones_pago" USING btree ("pago_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_cuenta_por_cobrar" ON "aplicaciones_pago" USING btree ("cuenta_por_cobrar_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_cuenta_por_pagar" ON "aplicaciones_pago" USING btree ("cuenta_por_pagar_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_pago_compensacion" ON "aplicaciones_pago" USING btree ("compensacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aplicaciones_pago_nota_credito" ON "aplicaciones_pago" USING btree ("nota_credito_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_folio" ON "pagos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "pagos_cliente" ON "pagos" USING btree ("cliente_id","fecha");--> statement-breakpoint
CREATE INDEX "pagos_tercero" ON "pagos" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "pagos_tercero_deposito" ON "pagos" USING btree ("tercero_deposito_id");--> statement-breakpoint
CREATE INDEX "pagos_nota" ON "pagos" USING btree ("nota_entrega_id");--> statement-breakpoint
CREATE INDEX "pagos_pedido" ON "pagos" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pagos_referencia" ON "pagos" USING btree ("referencia","monto_centavos");--> statement-breakpoint
CREATE INDEX "saldo_favor_movimientos_cliente" ON "saldo_favor_movimientos" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "saldo_favor_movimientos_pago" ON "saldo_favor_movimientos" USING btree ("pago_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saldo_favor_movimientos_nota_credito" ON "saldo_favor_movimientos" USING btree ("nota_credito_id") WHERE "saldo_favor_movimientos"."tipo" = 'entra';--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Nada de esto baja a un aparato.
SELECT poner_disparador_comun('pagos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('aplicaciones_pago', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('saldo_favor_movimientos', baja_a_aparatos => false);
