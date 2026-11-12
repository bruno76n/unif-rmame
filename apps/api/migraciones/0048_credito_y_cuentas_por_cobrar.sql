CREATE TABLE "credito_clientes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"limite_centavos" bigint DEFAULT 0 NOT NULL,
	"dias_credito" integer NOT NULL,
	"semaforo" text DEFAULT 'al_corriente' NOT NULL,
	"semaforo_cambiado_en" timestamp with time zone,
	"semaforo_cambiado_por" uuid,
	"limite_cambiado_en" timestamp with time zone,
	"limite_cambiado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "credito_clientes_limite" CHECK ("credito_clientes"."limite_centavos" >= 0 and "credito_clientes"."limite_centavos" % 100 = 0),
	CONSTRAINT "credito_clientes_dias" CHECK ("credito_clientes"."dias_credito" > 0),
	CONSTRAINT "credito_clientes_semaforo" CHECK ("credito_clientes"."semaforo" in ('al_corriente', 'cerca_del_limite', 'detenido'))
);
--> statement-breakpoint
CREATE TABLE "cuentas_por_cobrar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nota_entrega_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tercero_id" uuid NOT NULL,
	"fecha_entrega" date NOT NULL,
	"dias_credito" integer NOT NULL,
	"vence" date NOT NULL,
	"total_nota_centavos" bigint NOT NULL,
	"anticipo_aplicado_centavos" bigint DEFAULT 0 NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"saldo_centavos" bigint NOT NULL,
	"estado" text NOT NULL,
	"pagada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cuentas_por_cobrar_dias" CHECK ("cuentas_por_cobrar"."dias_credito" >= 0),
	CONSTRAINT "cuentas_por_cobrar_vence" CHECK ("cuentas_por_cobrar"."vence" = "cuentas_por_cobrar"."fecha_entrega" + "cuentas_por_cobrar"."dias_credito"),
	CONSTRAINT "cuentas_por_cobrar_importe" CHECK ("cuentas_por_cobrar"."anticipo_aplicado_centavos" >= 0 and "cuentas_por_cobrar"."importe_centavos" >= 0
				and "cuentas_por_cobrar"."importe_centavos" = "cuentas_por_cobrar"."total_nota_centavos" - "cuentas_por_cobrar"."anticipo_aplicado_centavos"),
	CONSTRAINT "cuentas_por_cobrar_saldo" CHECK ("cuentas_por_cobrar"."saldo_centavos" between 0 and "cuentas_por_cobrar"."importe_centavos"),
	CONSTRAINT "cuentas_por_cobrar_estado" CHECK ("cuentas_por_cobrar"."estado" in ('sin_pagar', 'pagada_en_parte', 'pagada')),
	CONSTRAINT "cuentas_por_cobrar_pagada" CHECK (("cuentas_por_cobrar"."estado" = 'pagada') = ("cuentas_por_cobrar"."saldo_centavos" = 0)
				and ("cuentas_por_cobrar"."estado" = 'pagada') = ("cuentas_por_cobrar"."pagada_en" is not null)
				and ("cuentas_por_cobrar"."estado" <> 'sin_pagar' or "cuentas_por_cobrar"."saldo_centavos" = "cuentas_por_cobrar"."importe_centavos")
				and ("cuentas_por_cobrar"."estado" <> 'pagada_en_parte' or "cuentas_por_cobrar"."saldo_centavos" < "cuentas_por_cobrar"."importe_centavos"))
);
--> statement-breakpoint
ALTER TABLE "credito_clientes" ADD CONSTRAINT "credito_clientes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credito_clientes" ADD CONSTRAINT "credito_clientes_semaforo_cambiado_por_usuarios_id_fk" FOREIGN KEY ("semaforo_cambiado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credito_clientes" ADD CONSTRAINT "credito_clientes_limite_cambiado_por_usuarios_id_fk" FOREIGN KEY ("limite_cambiado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credito_clientes" ADD CONSTRAINT "credito_clientes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credito_clientes_cliente" ON "credito_clientes" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "credito_clientes_tercero" ON "credito_clientes" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "credito_clientes_semaforo" ON "credito_clientes" USING btree ("semaforo") WHERE "credito_clientes"."semaforo" <> 'al_corriente';--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_por_cobrar_nota" ON "cuentas_por_cobrar" USING btree ("nota_entrega_id");--> statement-breakpoint
CREATE INDEX "cuentas_por_cobrar_cliente" ON "cuentas_por_cobrar" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "cuentas_por_cobrar_tercero" ON "cuentas_por_cobrar" USING btree ("tercero_id");--> statement-breakpoint
CREATE INDEX "cuentas_por_cobrar_vence" ON "cuentas_por_cobrar" USING btree ("vence") WHERE "cuentas_por_cobrar"."estado" <> 'pagada';--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Ni el crédito ni las cuentas por cobrar bajan
-- a un aparato.
SELECT poner_disparador_comun('credito_clientes', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('cuentas_por_cobrar', baja_a_aparatos => false);
