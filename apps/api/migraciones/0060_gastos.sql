CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"fecha" date NOT NULL,
	"categoria_id" uuid NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"area" text NOT NULL,
	"ubicacion_id" uuid,
	"medio" text,
	"cuenta_fabrica_id" uuid,
	"comprobante_archivo_id" uuid,
	"tipo_comprobante_id" uuid,
	"origen" text NOT NULL,
	"servicio_id" uuid,
	"maquina_id" uuid,
	"movimiento_caja_id" uuid,
	"motivo" text,
	"paquete_contador_id" uuid,
	"estado" text DEFAULT 'registrado' NOT NULL,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "gastos_monto" CHECK ("gastos"."monto_centavos" > 0 and ("gastos"."origen" <> 'manual' or "gastos"."monto_centavos" % 100 = 0)),
	CONSTRAINT "gastos_area" CHECK ("gastos"."area" in ('fabrica', 'ubicacion', 'en_linea')),
	CONSTRAINT "gastos_ubicacion" CHECK (("gastos"."ubicacion_id" is not null) = ("gastos"."area" = 'ubicacion')),
	CONSTRAINT "gastos_medio" CHECK ("gastos"."medio" in ('efectivo', 'cuenta_fabrica') and ("gastos"."medio" is null) = ("gastos"."origen" = 'mantenimiento')),
	CONSTRAINT "gastos_cuenta_fabrica" CHECK (("gastos"."cuenta_fabrica_id" is not null) = ("gastos"."medio" = 'cuenta_fabrica')),
	CONSTRAINT "gastos_origen" CHECK ("gastos"."origen" in ('manual', 'mantenimiento', 'tienda')),
	CONSTRAINT "gastos_servicio" CHECK (("gastos"."servicio_id" is not null and "gastos"."maquina_id" is not null) = ("gastos"."origen" = 'mantenimiento')),
	CONSTRAINT "gastos_estado" CHECK ("gastos"."estado" in ('registrado', 'cancelado')),
	CONSTRAINT "gastos_cancelado" CHECK (("gastos"."estado" = 'cancelado') = ("gastos"."cancelado_en" is not null and "gastos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_lista_valores_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_fabrica_id_lista_valores_id_fk" FOREIGN KEY ("cuenta_fabrica_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_comprobante_archivo_id_archivos_id_fk" FOREIGN KEY ("comprobante_archivo_id") REFERENCES "public"."archivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipo_comprobante_id_lista_valores_id_fk" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_maquina_id_maquinas_id_fk" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_folio" ON "gastos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_servicio" ON "gastos" USING btree ("servicio_id") WHERE "gastos"."servicio_id" is not null;--> statement-breakpoint
CREATE INDEX "gastos_fecha" ON "gastos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "gastos_categoria" ON "gastos" USING btree ("categoria_id");--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_gasto_id_gastos_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gastos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
SELECT poner_disparador_comun('gastos', baja_a_aparatos => false);
--> statement-breakpoint
-- El servicio solo crece, salvo la liga a su gasto: se escribe una vez, en la misma acción (decisión 709).
GRANT UPDATE (gasto_id) ON servicios TO uniformame_app;
