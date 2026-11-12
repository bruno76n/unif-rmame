CREATE TABLE "anticipos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"fecha" date NOT NULL,
	"pago_id" uuid,
	"saldo_favor_movimiento_id" uuid,
	"nota_entrega_id" uuid,
	"anticipo_aplicado_id" uuid,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "anticipos_tipo" CHECK ("anticipos"."tipo" in ('recibido', 'aplicado', 'regresado', 'a_favor')),
	CONSTRAINT "anticipos_monto" CHECK ("anticipos"."monto_centavos" > 0),
	CONSTRAINT "anticipos_origen" CHECK (num_nonnulls("anticipos"."pago_id", "anticipos"."saldo_favor_movimiento_id") = case when "anticipos"."tipo" = 'recibido' then 1 else 0 end),
	CONSTRAINT "anticipos_nota" CHECK (("anticipos"."nota_entrega_id" is not null) = ("anticipos"."tipo" in ('aplicado', 'regresado'))
				and ("anticipos"."anticipo_aplicado_id" is not null) = ("anticipos"."tipo" = 'regresado')),
	CONSTRAINT "anticipos_estado" CHECK ("anticipos"."estado" in ('vigente', 'cancelado')),
	CONSTRAINT "anticipos_cancelado" CHECK (("anticipos"."estado" = 'cancelado') = ("anticipos"."cancelado_en" is not null and "anticipos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_saldo_favor_movimiento_id_saldo_favor_movimientos_id_fk" FOREIGN KEY ("saldo_favor_movimiento_id") REFERENCES "public"."saldo_favor_movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_anticipo_aplicado_id_anticipos_id_fk" FOREIGN KEY ("anticipo_aplicado_id") REFERENCES "public"."anticipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anticipos_pedido" ON "anticipos" USING btree ("pedido_id","estado");--> statement-breakpoint
CREATE INDEX "anticipos_nota" ON "anticipos" USING btree ("nota_entrega_id");--> statement-breakpoint
CREATE INDEX "anticipos_pago" ON "anticipos" USING btree ("pago_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anticipos_aplicado" ON "anticipos" USING btree ("anticipo_aplicado_id");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los anticipos no bajan a un aparato.
SELECT poner_disparador_comun('anticipos', baja_a_aparatos => false);
