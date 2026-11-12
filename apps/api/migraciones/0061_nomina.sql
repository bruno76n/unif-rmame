CREATE TABLE "descuentos_nomina" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"monto_semanal_centavos" bigint NOT NULL,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"terminado_en" timestamp with time zone,
	"terminado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "descuentos_nomina_monto" CHECK ("descuentos_nomina"."monto_semanal_centavos" > 0 and "descuentos_nomina"."monto_semanal_centavos" % 100 = 0),
	CONSTRAINT "descuentos_nomina_estado" CHECK ("descuentos_nomina"."estado" in ('vigente', 'terminado')),
	CONSTRAINT "descuentos_nomina_terminado" CHECK (("descuentos_nomina"."estado" = 'terminado') = ("descuentos_nomina"."terminado_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "nomina_linea_piezas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nomina_linea_id" uuid NOT NULL,
	"registro_operacion_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	"flujo_operacion_id" uuid NOT NULL,
	"piezas_buenas" integer NOT NULL,
	"piezas_danadas" integer NOT NULL,
	"piezas_pagadas" integer NOT NULL,
	"tarifa_centavos" bigint NOT NULL,
	"importe_centavos" bigint NOT NULL,
	"se_paga" boolean NOT NULL,
	"motivo_no_pago" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "nomina_linea_piezas_tipo" CHECK ("nomina_linea_piezas"."tipo" in ('pago', 'correccion')),
	CONSTRAINT "nomina_linea_piezas_importe" CHECK ("nomina_linea_piezas"."piezas_pagadas" >= 0 and "nomina_linea_piezas"."tarifa_centavos" >= 0
				and (("nomina_linea_piezas"."tipo" = 'pago' and "nomina_linea_piezas"."importe_centavos" >= 0)
					or ("nomina_linea_piezas"."tipo" = 'correccion' and "nomina_linea_piezas"."importe_centavos" <= 0))),
	CONSTRAINT "nomina_linea_piezas_no_pago" CHECK ("nomina_linea_piezas"."motivo_no_pago" in ('cobra_por_tiempo') and ("nomina_linea_piezas"."motivo_no_pago" is null) = "nomina_linea_piezas"."se_paga")
);
--> statement-breakpoint
CREATE TABLE "nomina_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nomina_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"area" text NOT NULL,
	"ubicacion_id" uuid,
	"puesto" text NOT NULL,
	"forma_pago" text NOT NULL,
	"baja_en" date,
	"dias" numeric(3, 1) DEFAULT '0' NOT NULL,
	"pago_dia_centavos" bigint,
	"importe_tiempo_centavos" bigint NOT NULL,
	"piezas" integer NOT NULL,
	"importe_piezas_centavos" bigint NOT NULL,
	"correcciones_centavos" bigint NOT NULL,
	"bruto_centavos" bigint NOT NULL,
	"descuento_nomina_id" uuid,
	"descuento_centavos" bigint NOT NULL,
	"descuento_motivo" text,
	"arrastre_centavos" bigint NOT NULL,
	"descontado_centavos" bigint NOT NULL,
	"no_alcanzo_centavos" bigint NOT NULL,
	"destino_no_alcanzo" text,
	"total_centavos" bigint NOT NULL,
	"medio_pago" text,
	"referencia_pago" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "nomina_lineas_forma_pago" CHECK ("nomina_lineas"."forma_pago" in ('tiempo', 'pieza', 'mixta')),
	CONSTRAINT "nomina_lineas_dias" CHECK ("nomina_lineas"."dias" >= 0),
	CONSTRAINT "nomina_lineas_correcciones" CHECK ("nomina_lineas"."correcciones_centavos" <= 0),
	CONSTRAINT "nomina_lineas_bruto" CHECK ("nomina_lineas"."bruto_centavos" = "nomina_lineas"."importe_tiempo_centavos" + "nomina_lineas"."importe_piezas_centavos" + "nomina_lineas"."correcciones_centavos"),
	CONSTRAINT "nomina_lineas_descuento" CHECK ("nomina_lineas"."descuento_centavos" >= 0 and "nomina_lineas"."arrastre_centavos" >= 0 and "nomina_lineas"."descontado_centavos" >= 0
				and "nomina_lineas"."no_alcanzo_centavos" >= 0
				and "nomina_lineas"."descontado_centavos" + "nomina_lineas"."no_alcanzo_centavos"
					= "nomina_lineas"."descuento_centavos" + "nomina_lineas"."arrastre_centavos" + greatest(0, -"nomina_lineas"."bruto_centavos")),
	CONSTRAINT "nomina_lineas_total" CHECK ("nomina_lineas"."total_centavos" >= 0
				and "nomina_lineas"."total_centavos" = greatest(0, "nomina_lineas"."bruto_centavos") - "nomina_lineas"."descontado_centavos"),
	CONSTRAINT "nomina_lineas_no_alcanzo" CHECK ("nomina_lineas"."destino_no_alcanzo" in ('perdonado', 'siguiente_semana')
				and ("nomina_lineas"."destino_no_alcanzo" is not null) = ("nomina_lineas"."no_alcanzo_centavos" > 0)),
	CONSTRAINT "nomina_lineas_medio" CHECK ("nomina_lineas"."medio_pago" in ('efectivo', 'transferencia') and char_length("nomina_lineas"."referencia_pago") between 3 and 30)
);
--> statement-breakpoint
CREATE TABLE "nominas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asistencia_semana_id" uuid NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"fecha_pago" date NOT NULL,
	"estado" text DEFAULT 'por_pagar' NOT NULL,
	"total_tiempo_centavos" bigint,
	"total_piezas_centavos" bigint,
	"total_correcciones_centavos" bigint,
	"total_descontado_centavos" bigint,
	"total_centavos" bigint,
	"personas" integer,
	"regla_piezas_danadas" boolean,
	"regla_descuento_mayor" text,
	"pagada_en" timestamp with time zone,
	"pagada_por" uuid,
	"confirmado_con_google_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "nominas_estado" CHECK ("nominas"."estado" in ('por_pagar', 'pagada')),
	CONSTRAINT "nominas_fechas" CHECK ("nominas"."fecha_inicio" <= "nominas"."fecha_fin" and "nominas"."fecha_fin" < "nominas"."fecha_pago"),
	CONSTRAINT "nominas_regla_descuento" CHECK ("nominas"."regla_descuento_mayor" in ('perdonar', 'siguiente_semana')),
	CONSTRAINT "nominas_pagada" CHECK (("nominas"."estado" = 'pagada') = ("nominas"."pagada_en" is not null)
				and ("nominas"."estado" <> 'pagada' or ("nominas"."total_tiempo_centavos" is not null
					and "nominas"."total_piezas_centavos" is not null and "nominas"."total_correcciones_centavos" is not null
					and "nominas"."total_descontado_centavos" is not null and "nominas"."total_centavos" >= 0
					and "nominas"."personas" is not null and "nominas"."regla_piezas_danadas" is not null
					and "nominas"."regla_descuento_mayor" is not null and "nominas"."pagada_por" is not null
					and "nominas"."confirmado_con_google_en" is not null)))
);
--> statement-breakpoint
ALTER TABLE "descuentos_nomina" ADD CONSTRAINT "descuentos_nomina_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descuentos_nomina" ADD CONSTRAINT "descuentos_nomina_terminado_por_usuarios_id_fk" FOREIGN KEY ("terminado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descuentos_nomina" ADD CONSTRAINT "descuentos_nomina_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_linea_piezas" ADD CONSTRAINT "nomina_linea_piezas_nomina_linea_id_nomina_lineas_id_fk" FOREIGN KEY ("nomina_linea_id") REFERENCES "public"."nomina_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_linea_piezas" ADD CONSTRAINT "nomina_linea_piezas_registro_operacion_id_registros_operacion_id_fk" FOREIGN KEY ("registro_operacion_id") REFERENCES "public"."registros_operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_linea_piezas" ADD CONSTRAINT "nomina_linea_piezas_flujo_operacion_id_flujo_operaciones_id_fk" FOREIGN KEY ("flujo_operacion_id") REFERENCES "public"."flujo_operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_linea_piezas" ADD CONSTRAINT "nomina_linea_piezas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_lineas" ADD CONSTRAINT "nomina_lineas_nomina_id_nominas_id_fk" FOREIGN KEY ("nomina_id") REFERENCES "public"."nominas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_lineas" ADD CONSTRAINT "nomina_lineas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_lineas" ADD CONSTRAINT "nomina_lineas_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_lineas" ADD CONSTRAINT "nomina_lineas_descuento_nomina_id_descuentos_nomina_id_fk" FOREIGN KEY ("descuento_nomina_id") REFERENCES "public"."descuentos_nomina"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_lineas" ADD CONSTRAINT "nomina_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_asistencia_semana_id_asistencia_semanas_id_fk" FOREIGN KEY ("asistencia_semana_id") REFERENCES "public"."asistencia_semanas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_pagada_por_usuarios_id_fk" FOREIGN KEY ("pagada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominas" ADD CONSTRAINT "nominas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "descuentos_nomina_vigente" ON "descuentos_nomina" USING btree ("persona_id") WHERE "descuentos_nomina"."estado" = 'vigente';--> statement-breakpoint
CREATE UNIQUE INDEX "nomina_linea_piezas_registro" ON "nomina_linea_piezas" USING btree ("registro_operacion_id","tipo");--> statement-breakpoint
CREATE INDEX "nomina_linea_piezas_linea" ON "nomina_linea_piezas" USING btree ("nomina_linea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nomina_lineas_persona" ON "nomina_lineas" USING btree ("nomina_id","persona_id");--> statement-breakpoint
CREATE INDEX "nomina_lineas_persona_id" ON "nomina_lineas" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nominas_semana" ON "nominas" USING btree ("asistencia_semana_id");--> statement-breakpoint
CREATE INDEX "nominas_estado" ON "nominas" USING btree ("estado","fecha_inicio");--> statement-breakpoint
SELECT poner_disparador_comun('nominas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('nomina_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('nomina_lineas');
--> statement-breakpoint
SELECT poner_disparador_comun('nomina_linea_piezas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('nomina_linea_piezas');
--> statement-breakpoint
SELECT poner_disparador_comun('descuentos_nomina', baja_a_aparatos => false);
