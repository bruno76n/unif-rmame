CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tercero_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"escuela_id" uuid,
	"municipio" text NOT NULL,
	"direccion_entrega" text NOT NULL,
	"contacto" text,
	"telefono" text NOT NULL,
	"correo" text,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "clientes_tipo" CHECK ("clientes"."tipo" in ('escuela', 'mayorista', 'empresa_otro')),
	CONSTRAINT "clientes_escuela" CHECK (("clientes"."escuela_id" is not null) = ("clientes"."tipo" = 'escuela')),
	CONSTRAINT "clientes_municipio" CHECK (char_length("clientes"."municipio") between 3 and 60),
	CONSTRAINT "clientes_direccion" CHECK (char_length("clientes"."direccion_entrega") between 8 and 200),
	CONSTRAINT "clientes_contacto" CHECK (char_length("clientes"."contacto") <= 60),
	CONSTRAINT "clientes_telefono" CHECK ("clientes"."telefono" ~ '^[0-9]{10}$'),
	CONSTRAINT "clientes_baja" CHECK (("clientes"."baja_en" is null) = ("clientes"."motivo_baja" is null))
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_escuela_id_escuelas_id_fk" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_tercero" ON "clientes" USING btree ("tercero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_escuela" ON "clientes" USING btree ("escuela_id") WHERE "clientes"."escuela_id" is not null;--> statement-breakpoint
CREATE INDEX "clientes_tipo" ON "clientes" USING btree ("tipo") WHERE "clientes"."baja_en" is null;--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credito_clientes" ADD CONSTRAINT "credito_clientes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Los clientes no bajan a un aparato (con el
-- POS bajará el mayorista de tienda).
SELECT poner_disparador_comun('clientes', baja_a_aparatos => false);
