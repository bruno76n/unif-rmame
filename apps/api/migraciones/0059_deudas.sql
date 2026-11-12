CREATE TABLE "compensaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tercero_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"descripcion" text DEFAULT 'Su compra se descontó de lo que le debemos' NOT NULL,
	"estado" text DEFAULT 'registrada' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "compensaciones_monto" CHECK ("compensaciones"."monto_centavos" > 0 and "compensaciones"."monto_centavos" % 100 = 0),
	CONSTRAINT "compensaciones_estado" CHECK ("compensaciones"."estado" in ('registrada', 'cancelada')),
	CONSTRAINT "compensaciones_cancelada" CHECK (("compensaciones"."estado" = 'cancelada') = ("compensaciones"."cancelado_en" is not null and "compensaciones"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
CREATE TABLE "deuda_mensualidades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deuda_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"vence" date NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "deuda_mensualidades_numero" CHECK ("deuda_mensualidades"."numero" >= 1),
	CONSTRAINT "deuda_mensualidades_importe" CHECK ("deuda_mensualidades"."importe_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "deudas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"tercero_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"monto_total_centavos" bigint NOT NULL,
	"numero_mensualidades" integer NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"saldada_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "deudas_descripcion" CHECK (char_length("deudas"."descripcion") >= 5),
	CONSTRAINT "deudas_monto" CHECK ("deudas"."monto_total_centavos" > 0 and "deudas"."numero_mensualidades" >= 1),
	CONSTRAINT "deudas_estado" CHECK ("deudas"."estado" in ('abierta', 'saldada', 'cancelada')),
	CONSTRAINT "deudas_saldada" CHECK (("deudas"."estado" = 'saldada') = ("deudas"."saldada_en" is not null)),
	CONSTRAINT "deudas_cancelada" CHECK (("deudas"."estado" = 'cancelada') = ("deudas"."cancelado_en" is not null and "deudas"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "compensaciones" ADD CONSTRAINT "compensaciones_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensaciones" ADD CONSTRAINT "compensaciones_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensaciones" ADD CONSTRAINT "compensaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deuda_mensualidades" ADD CONSTRAINT "deuda_mensualidades_deuda_id_deudas_id_fk" FOREIGN KEY ("deuda_id") REFERENCES "public"."deudas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deuda_mensualidades" ADD CONSTRAINT "deuda_mensualidades_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_tercero_id_terceros_id_fk" FOREIGN KEY ("tercero_id") REFERENCES "public"."terceros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compensaciones_tercero" ON "compensaciones" USING btree ("tercero_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "deuda_mensualidades_numero" ON "deuda_mensualidades" USING btree ("deuda_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "deudas_folio" ON "deudas" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "deudas_tercero" ON "deudas" USING btree ("tercero_id","estado");--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_compensacion_id_compensaciones_id_fk" FOREIGN KEY ("compensacion_id") REFERENCES "public"."compensaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_pagar" ADD CONSTRAINT "cuentas_por_pagar_deuda_mensualidad_id_deuda_mensualidades_id_fk" FOREIGN KEY ("deuda_mensualidad_id") REFERENCES "public"."deuda_mensualidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT poner_disparador_comun('compensaciones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('deudas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('deuda_mensualidades', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('deuda_mensualidades');
