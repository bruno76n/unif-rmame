CREATE TABLE "documentos_contador" (
	"id" uuid PRIMARY KEY NOT NULL,
	"archivo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text DEFAULT 'documento' NOT NULL,
	"mes" date,
	"paquete_contador_id" uuid,
	"llego_en" date DEFAULT (now() at time zone 'America/Mexico_City')::date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "documentos_contador_tipo" CHECK ("documentos_contador"."tipo" in ('declaracion', 'acuse', 'facturas', 'documento')),
	CONSTRAINT "documentos_contador_mes" CHECK ("documentos_contador"."mes" is null or extract(day from "documentos_contador"."mes") = 1)
);
--> statement-breakpoint
CREATE TABLE "paquete_contador_renglones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"paquete_contador_id" uuid NOT NULL,
	"concepto" text NOT NULL,
	"categoria_id" uuid,
	"de_meses_anteriores" boolean DEFAULT false NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"documentos" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "paquete_contador_renglones_unico" UNIQUE NULLS NOT DISTINCT("paquete_contador_id","concepto","categoria_id","de_meses_anteriores"),
	CONSTRAINT "paquete_contador_renglones_concepto" CHECK ("paquete_contador_renglones"."concepto" in ('cobranza_clientes', 'anticipos_recibidos', 'anticipos_aplicados', 'ventas_tiendas', 'anticipos_tiendas', 'ventas_en_linea', 'comisiones_pasarela', 'reembolsos_en_linea', 'devoluciones_saldo_favor', 'pagos_proveedores_acreedores', 'nomina', 'gasto')),
	CONSTRAINT "paquete_contador_renglones_gasto" CHECK (("paquete_contador_renglones"."categoria_id" is not null) = ("paquete_contador_renglones"."concepto" = 'gasto')
				and (not "paquete_contador_renglones"."de_meses_anteriores" or "paquete_contador_renglones"."concepto" = 'gasto')),
	CONSTRAINT "paquete_contador_renglones_montos" CHECK ("paquete_contador_renglones"."monto_centavos" >= 0 and "paquete_contador_renglones"."documentos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "paquetes_contador" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mes" date NOT NULL,
	"fecha_limite" date NOT NULL,
	"estado" text DEFAULT 'por_enviar' NOT NULL,
	"enviado_en" timestamp with time zone,
	"enviado_por" uuid,
	"archivo_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "paquetes_contador_estado" CHECK ("paquetes_contador"."estado" in ('por_enviar', 'enviado')),
	CONSTRAINT "paquetes_contador_primer_dia" CHECK (extract(day from "paquetes_contador"."mes") = 1 and "paquetes_contador"."fecha_limite" > "paquetes_contador"."mes"),
	CONSTRAINT "paquetes_contador_enviado" CHECK (("paquetes_contador"."estado" = 'enviado') = ("paquetes_contador"."enviado_en" is not null and "paquetes_contador"."enviado_por" is not null))
);
--> statement-breakpoint
ALTER TABLE "documentos_contador" ADD CONSTRAINT "documentos_contador_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_contador" ADD CONSTRAINT "documentos_contador_paquete_contador_id_paquetes_contador_id_fk" FOREIGN KEY ("paquete_contador_id") REFERENCES "public"."paquetes_contador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_contador" ADD CONSTRAINT "documentos_contador_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_contador_renglones" ADD CONSTRAINT "paquete_contador_renglones_paquete_contador_id_paquetes_contador_id_fk" FOREIGN KEY ("paquete_contador_id") REFERENCES "public"."paquetes_contador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_contador_renglones" ADD CONSTRAINT "paquete_contador_renglones_categoria_id_lista_valores_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_contador_renglones" ADD CONSTRAINT "paquete_contador_renglones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes_contador" ADD CONSTRAINT "paquetes_contador_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes_contador" ADD CONSTRAINT "paquetes_contador_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes_contador" ADD CONSTRAINT "paquetes_contador_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_contador_archivo" ON "documentos_contador" USING btree ("archivo_id");--> statement-breakpoint
CREATE INDEX "documentos_contador_mes" ON "documentos_contador" USING btree ("mes");--> statement-breakpoint
CREATE INDEX "documentos_contador_paquete" ON "documentos_contador" USING btree ("paquete_contador_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paquetes_contador_mes" ON "paquetes_contador" USING btree ("mes");--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_paquete_contador_id_paquetes_contador_id_fk" FOREIGN KEY ("paquete_contador_id") REFERENCES "public"."paquetes_contador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT poner_disparador_comun('paquetes_contador', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('paquete_contador_renglones', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('paquete_contador_renglones');
--> statement-breakpoint
SELECT poner_disparador_comun('documentos_contador', baja_a_aparatos => false);
--> statement-breakpoint
-- `contaduria` suma su tipo de aviso al CHECK de `avisos.tipo`, con la lista completa (decisión 454).
ALTER TABLE "avisos" DROP CONSTRAINT "avisos_tipo";
--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_tipo" CHECK (tipo in ('autorizacion_pedida', 'autorizacion_decidida', 'alerta_seguridad', 'dispositivo_sin_sincronizar', 'alerta_direccion', 'restauracion_por_probar', 'respaldo_fallido', 'pin_bloqueado', 'trabajo_fallido', 'codigos_por_acabarse', 'cuadre_fallido', 'lote_atorado', 'saldos_no_cuadran'));
