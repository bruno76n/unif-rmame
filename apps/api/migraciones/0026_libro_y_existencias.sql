CREATE TABLE "existencias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas" integer DEFAULT 0 NOT NULL,
	"ultimo_movimiento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "existencias_material" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"rollo_id" uuid,
	"cantidad" numeric(12, 3) DEFAULT '0' NOT NULL,
	"ultimo_movimiento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "existencias_material_lugar" UNIQUE NULLS NOT DISTINCT("ubicacion_id","material_id","rollo_id")
);
--> statement-breakpoint
CREATE TABLE "movimiento_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"renglon" smallint NOT NULL,
	"origen_ubicacion_id" uuid,
	"destino_ubicacion_id" uuid,
	"variante_id" uuid,
	"material_id" uuid,
	"rollo_id" uuid,
	"lote_id" uuid,
	"piezas" integer,
	"cantidad" numeric(12, 3),
	"traspaso_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "movimiento_lineas_un_lado" CHECK ("movimiento_lineas"."origen_ubicacion_id" is not null or "movimiento_lineas"."destino_ubicacion_id" is not null),
	CONSTRAINT "movimiento_lineas_lados_distintos" CHECK ("movimiento_lineas"."origen_ubicacion_id" is distinct from "movimiento_lineas"."destino_ubicacion_id"),
	CONSTRAINT "movimiento_lineas_forma" CHECK (("movimiento_lineas"."variante_id" is not null and "movimiento_lineas"."piezas" > 0 and "movimiento_lineas"."material_id" is null and "movimiento_lineas"."cantidad" is null and "movimiento_lineas"."rollo_id" is null)
				or ("movimiento_lineas"."material_id" is not null and "movimiento_lineas"."cantidad" > 0 and "movimiento_lineas"."variante_id" is null and "movimiento_lineas"."piezas" is null))
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"fecha" date NOT NULL,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"documento_tipo" text NOT NULL,
	"documento_id" uuid NOT NULL,
	"documento_folio" text,
	"revierte_movimiento_id" uuid,
	"clave_idempotencia" uuid NOT NULL,
	"comando_id" uuid,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "movimientos_tipo" CHECK ("movimientos"."tipo" in ('carga_inicial', 'venta_tienda', 'devolucion_mostrador', 'merma_tienda', 'salida_tienda', 'surtido_bodega', 'recepcion_aduana', 'piezas_cortadas', 'merma_produccion', 'recepcion_taller', 'recepcion_reproceso', 'despacho', 'recepcion_despacho', 'entrega_cliente_externo', 'entrega_tienda_sin_caja', 'salida_linea', 'devolucion_cliente_externo', 'devolucion_linea', 'merma_calidad', 'recepcion_proveedor', 'devolucion_proveedor', 'entrega_corte', 'consumo_corte', 'merma_corte', 'regreso_rollo', 'regreso_retazo', 'consumo_avios', 'consumible_tomado', 'ajuste', 'aclaracion_recepcion', 'reversion')),
	CONSTRAINT "movimientos_documento_tipo" CHECK ("movimientos"."documento_tipo" in ('carga_inicial', 'conteo', 'venta_tienda', 'devolucion_mostrador', 'merma_tienda', 'salida_tienda', 'traspaso', 'recepcion', 'despacho', 'nota_entrega', 'pedido_linea', 'corte', 'registro_operacion', 'toma_consumible', 'entrega_corte', 'ajuste', 'diferencia', 'reproceso')),
	CONSTRAINT "movimientos_reversion" CHECK (("movimientos"."tipo" = 'reversion') = ("movimientos"."revierte_movimiento_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_ultimo_movimiento_id_movimientos_id_fk" FOREIGN KEY ("ultimo_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias_material" ADD CONSTRAINT "existencias_material_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias_material" ADD CONSTRAINT "existencias_material_ultimo_movimiento_id_movimientos_id_fk" FOREIGN KEY ("ultimo_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias_material" ADD CONSTRAINT "existencias_material_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_origen_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("origen_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_destino_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("destino_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_revierte_movimiento_id_movimientos_id_fk" FOREIGN KEY ("revierte_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_comando_id_comandos_recibidos_id_fk" FOREIGN KEY ("comando_id") REFERENCES "public"."comandos_recibidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "existencias_ubicacion_variante" ON "existencias" USING btree ("ubicacion_id","variante_id");--> statement-breakpoint
CREATE INDEX "existencias_variante" ON "existencias" USING btree ("variante_id");--> statement-breakpoint
CREATE INDEX "existencias_version" ON "existencias" USING btree ("version");--> statement-breakpoint
CREATE INDEX "existencias_material_rollo" ON "existencias_material" USING btree ("rollo_id");--> statement-breakpoint
CREATE INDEX "existencias_material_version" ON "existencias_material" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_lineas_renglon" ON "movimiento_lineas" USING btree ("movimiento_id","renglon");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_origen" ON "movimiento_lineas" USING btree ("origen_ubicacion_id","variante_id");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_destino" ON "movimiento_lineas" USING btree ("destino_ubicacion_id","variante_id");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_material" ON "movimiento_lineas" USING btree ("material_id","rollo_id");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_lote" ON "movimiento_lineas" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "movimiento_lineas_traspaso" ON "movimiento_lineas" USING btree ("traspaso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_clave" ON "movimientos" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "movimientos_documento" ON "movimientos" USING btree ("documento_tipo","documento_id");--> statement-breakpoint
CREATE INDEX "movimientos_tipo_fecha" ON "movimientos" USING btree ("tipo","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_ocurrido" ON "movimientos" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE UNIQUE INDEX "movimientos_revierte" ON "movimientos" USING btree ("revierte_movimiento_id") WHERE "movimientos"."revierte_movimiento_id" is not null;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; nada de esto baja a un aparato.
SELECT poner_disparador_comun('movimientos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('movimiento_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('existencias', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('existencias_material', baja_a_aparatos => false);
--> statement-breakpoint
-- Escrito a mano (docs/modulos/inventario/libro-de-movimientos.md, regla 4): el libro solo crece. La app no
-- puede cambiarlo, y ninguna tabla de negocio le da DELETE.
SELECT marcar_solo_crece('movimientos');
--> statement-breakpoint
SELECT marcar_solo_crece('movimiento_lineas');
