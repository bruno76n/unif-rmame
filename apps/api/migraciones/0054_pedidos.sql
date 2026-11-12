CREATE TABLE "pedido_renglones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"desde_version" integer NOT NULL,
	"hasta_version" integer,
	"precio_sugerido_centavos" bigint,
	"origen_sugerido" text,
	"porcentaje_aplicado" numeric(6, 3),
	"precio_dado_centavos" bigint,
	"recargo_especial_centavos" bigint DEFAULT 0 NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"congelado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pedido_renglones_cantidad" CHECK ("pedido_renglones"."cantidad" >= 0),
	CONSTRAINT "pedido_renglones_versiones" CHECK ("pedido_renglones"."hasta_version" >= "pedido_renglones"."desde_version"),
	CONSTRAINT "pedido_renglones_precio" CHECK ("pedido_renglones"."precio_unitario_centavos" > 0 and "pedido_renglones"."recargo_especial_centavos" >= 0),
	CONSTRAINT "pedido_renglones_dado_o_sugerido" CHECK ("pedido_renglones"."precio_dado_centavos" is not null or "pedido_renglones"."precio_sugerido_centavos" is not null),
	CONSTRAINT "pedido_renglones_origen" CHECK ("pedido_renglones"."origen_sugerido" is null or "pedido_renglones"."origen_sugerido" in ('lista_cliente', 'porcentaje_cliente', 'mayoreo', 'mostrador'))
);
--> statement-breakpoint
CREATE TABLE "pedido_versiones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"origen" text NOT NULL,
	"fecha_entrega" date NOT NULL,
	"forma_pago" text NOT NULL,
	"dias_credito" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pedido_versiones_origen" CHECK ("pedido_versiones"."origen" in ('confirmacion', 'modificacion', 'pasar_a_bodega')),
	CONSTRAINT "pedido_versiones_forma_pago" CHECK ("pedido_versiones"."forma_pago" in ('contado', 'anticipo', 'credito'))
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"fecha_entrega" date NOT NULL,
	"forma_pago" text NOT NULL,
	"dias_credito" integer NOT NULL,
	"version_vigente" integer DEFAULT 1 NOT NULL,
	"confirmado_en" timestamp with time zone,
	"confirmado_por" uuid,
	"entregado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pedidos_estado" CHECK ("pedidos"."estado" in ('borrador', 'confirmado', 'entregado', 'cancelado')),
	CONSTRAINT "pedidos_forma_pago" CHECK ("pedidos"."forma_pago" in ('contado', 'anticipo', 'credito')),
	CONSTRAINT "pedidos_dias_credito" CHECK (("pedidos"."forma_pago" = 'credito') = ("pedidos"."dias_credito" > 0) and "pedidos"."dias_credito" >= 0),
	CONSTRAINT "pedidos_version" CHECK ("pedidos"."version_vigente" >= 1),
	CONSTRAINT "pedidos_confirmado" CHECK (("pedidos"."estado" not in ('confirmado', 'entregado') or "pedidos"."confirmado_en" is not null)
				and ("pedidos"."estado" <> 'borrador' or "pedidos"."confirmado_en" is null)),
	CONSTRAINT "pedidos_cancelado" CHECK (("pedidos"."estado" = 'cancelado') = ("pedidos"."cancelado_en" is not null and "pedidos"."motivo_cancelacion" is not null)),
	CONSTRAINT "pedidos_entregado" CHECK (("pedidos"."estado" = 'entregado') = ("pedidos"."entregado_en" is not null))
);
--> statement-breakpoint
ALTER TABLE "pedido_renglones" ADD CONSTRAINT "pedido_renglones_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_renglones" ADD CONSTRAINT "pedido_renglones_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_renglones" ADD CONSTRAINT "pedido_renglones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_versiones" ADD CONSTRAINT "pedido_versiones_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_versiones" ADD CONSTRAINT "pedido_versiones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_confirmado_por_usuarios_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_renglones_pedido" ON "pedido_renglones" USING btree ("pedido_id") WHERE "pedido_renglones"."hasta_version" is null;--> statement-breakpoint
CREATE INDEX "pedido_renglones_variante" ON "pedido_renglones" USING btree ("variante_id") WHERE "pedido_renglones"."hasta_version" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_versiones_numero" ON "pedido_versiones" USING btree ("pedido_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_folio" ON "pedidos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "pedidos_cliente" ON "pedidos" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "pedidos_entrega" ON "pedidos" USING btree ("estado","fecha_entrega") WHERE "pedidos"."estado" in ('borrador', 'confirmado');--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes_produccion" ADD CONSTRAINT "ordenes_produccion_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los pedidos no bajan a un aparato.
SELECT poner_disparador_comun('pedidos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('pedido_renglones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('pedido_versiones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('pedido_versiones');
