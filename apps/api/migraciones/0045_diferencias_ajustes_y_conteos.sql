CREATE TABLE "ajuste_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ajuste_id" uuid NOT NULL,
	"renglon" smallint NOT NULL,
	"variante_id" uuid,
	"material_id" uuid,
	"rollo_id" uuid,
	"conteo_linea_id" uuid,
	"diferencia_id" uuid,
	"traspaso_id" uuid,
	"lote_id" uuid,
	"piezas_sistema" integer,
	"piezas_contadas" integer,
	"piezas_diferencia" integer,
	"cantidad_diferencia" numeric(12, 3),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ajuste_lineas_forma" CHECK (("ajuste_lineas"."variante_id" is not null and "ajuste_lineas"."piezas_diferencia" is not null and "ajuste_lineas"."piezas_diferencia" <> 0
					and "ajuste_lineas"."material_id" is null and "ajuste_lineas"."cantidad_diferencia" is null)
				or ("ajuste_lineas"."material_id" is not null and "ajuste_lineas"."cantidad_diferencia" is not null
					and "ajuste_lineas"."cantidad_diferencia" <> 0 and "ajuste_lineas"."variante_id" is null and "ajuste_lineas"."piezas_diferencia" is null))
);
--> statement-breakpoint
CREATE TABLE "ajustes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"conteo_id" uuid,
	"diferencia_id" uuid,
	"motivo_id" uuid NOT NULL,
	"motivo_texto" text,
	"estado" text DEFAULT 'esperando_autorizacion' NOT NULL,
	"autorizacion_id" uuid,
	"decidido_en" timestamp with time zone,
	"decidido_por" uuid,
	"motivo_rechazo" text,
	"movimiento_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ajustes_estado" CHECK ("ajustes"."estado" in ('esperando_autorizacion', 'autorizado', 'rechazado')),
	CONSTRAINT "ajustes_origen" CHECK (("ajustes"."origen" = 'conteo' and "ajustes"."conteo_id" is not null)
				or ("ajustes"."origen" in ('diferencia_recepcion', 'diferencia_material') and "ajustes"."diferencia_id" is not null)),
	CONSTRAINT "ajustes_motivo_texto" CHECK ("ajustes"."motivo_texto" is null or char_length("ajustes"."motivo_texto") <= 200),
	CONSTRAINT "ajustes_decidido" CHECK (("ajustes"."estado" = 'esperando_autorizacion') = ("ajustes"."decidido_en" is null and "ajustes"."decidido_por" is null)),
	CONSTRAINT "ajustes_rechazado" CHECK (("ajustes"."estado" = 'rechazado') = ("ajustes"."motivo_rechazo" is not null)),
	CONSTRAINT "ajustes_autorizado" CHECK (("ajustes"."estado" = 'autorizado') = ("ajustes"."movimiento_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "conteo_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conteo_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas_sistema" integer NOT NULL,
	"piezas_sistema_aparato" integer,
	"piezas_contadas" integer NOT NULL,
	"diferencia" integer GENERATED ALWAYS AS (piezas_contadas - piezas_sistema) STORED NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conteo_lineas_contadas" CHECK ("conteo_lineas"."piezas_contadas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conteos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"tipo" text NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"alcance" text,
	"producto_id" uuid,
	"seccion_id" uuid,
	"diferencia_id" uuid,
	"estado" text DEFAULT 'contado' NOT NULL,
	"contado_en" timestamp with time zone,
	"contado_por" uuid,
	"donde_buscar" text,
	"por_que" text,
	"para_cuando" date,
	"pedido_en" timestamp with time zone,
	"pedido_por" uuid,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conteos_tipo" CHECK ("conteos"."tipo" in ('nuevo', 'diferencia', 'inicial', 'pedido_tienda', 'propio_tienda')),
	CONSTRAINT "conteos_estado" CHECK ("conteos"."estado" in ('pedido', 'contado', 'cancelado')),
	CONSTRAINT "conteos_alcance" CHECK (("conteos"."tipo" = 'inicial') = ("conteos"."alcance" is not null)),
	CONSTRAINT "conteos_producto" CHECK (("conteos"."alcance" = 'prenda') = ("conteos"."producto_id" is not null)),
	CONSTRAINT "conteos_seccion" CHECK (("conteos"."tipo" = 'nuevo' or "conteos"."alcance" = 'seccion') = ("conteos"."seccion_id" is not null)),
	CONSTRAINT "conteos_diferencia" CHECK (("conteos"."tipo" = 'diferencia') = ("conteos"."diferencia_id" is not null)),
	CONSTRAINT "conteos_contado" CHECK ("conteos"."estado" <> 'contado' or ("conteos"."contado_en" is not null and "conteos"."contado_por" is not null)),
	CONSTRAINT "conteos_pedido_tienda" CHECK ("conteos"."tipo" <> 'pedido_tienda' or ("conteos"."donde_buscar" is not null and "conteos"."por_que" is not null
				and "conteos"."para_cuando" is not null and "conteos"."pedido_en" is not null and "conteos"."pedido_por" is not null))
);
--> statement-breakpoint
CREATE TABLE "diferencias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"origen" text NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"variante_id" uuid,
	"piezas" integer,
	"material_id" uuid,
	"rollo_id" uuid,
	"cantidad" numeric(12, 3),
	"descripcion" text NOT NULL,
	"sistema_decia" integer,
	"a_cargo_ubicacion_id" uuid NOT NULL,
	"traspaso_id" uuid,
	"traspaso_linea_id" uuid,
	"recepcion_id" uuid,
	"lote_id" uuid,
	"entrega_corte_id" uuid,
	"movimiento_id" uuid,
	"cuadre_id" uuid,
	"venta_tienda_id" uuid,
	"estado" text NOT NULL,
	"conteo_id" uuid,
	"ajuste_id" uuid,
	"resolucion" text,
	"aclaracion" text,
	"aclarada_con_diferencia_id" uuid,
	"traspaso_nuevo_id" uuid,
	"motivo_resolucion" text,
	"resuelta_en" timestamp with time zone,
	"resuelta_por" uuid,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "diferencias_origen" CHECK ("diferencias"."origen" in ('recepcion', 'recepcion_taller', 'material_corte', 'cuadre', 'no_la_encontro', 'venta_sin_existencia', 'venta_pieza_reservada', 'conteo')),
	CONSTRAINT "diferencias_estado" CHECK ("diferencias"."estado" in ('por_contar', 'conteo_pedido', 'esperando_autorizacion', 'por_aclarar', 'resuelta')),
	CONSTRAINT "diferencias_forma" CHECK (("diferencias"."variante_id" is not null and "diferencias"."piezas" is not null and "diferencias"."piezas" <> 0
					and "diferencias"."material_id" is null and "diferencias"."cantidad" is null)
				or ("diferencias"."material_id" is not null and "diferencias"."cantidad" is not null and "diferencias"."cantidad" <> 0
					and "diferencias"."variante_id" is null and "diferencias"."piezas" is null)),
	CONSTRAINT "diferencias_resuelta" CHECK (("diferencias"."estado" = 'resuelta') = ("diferencias"."resolucion" is not null)),
	CONSTRAINT "diferencias_aclaracion" CHECK ("diferencias"."aclaracion" is null
				or ("diferencias"."aclaracion" in ('llego', 'no_salio', 'venia_en_otro', 'perdida')
					and "diferencias"."origen" in ('recepcion', 'recepcion_taller'))
				or ("diferencias"."aclaracion" in ('ajuste', 'aclarada') and "diferencias"."material_id" is not null
					and "diferencias"."origen" in ('material_corte', 'cuadre')))
);
--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_conteo_linea_id_conteo_lineas_id_fk" FOREIGN KEY ("conteo_linea_id") REFERENCES "public"."conteo_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_diferencia_id_diferencias_id_fk" FOREIGN KEY ("diferencia_id") REFERENCES "public"."diferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_lineas" ADD CONSTRAINT "ajuste_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_conteo_id_conteos_id_fk" FOREIGN KEY ("conteo_id") REFERENCES "public"."conteos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_diferencia_id_diferencias_id_fk" FOREIGN KEY ("diferencia_id") REFERENCES "public"."diferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_motivo_id_lista_valores_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."lista_valores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_decidido_por_usuarios_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteo_lineas" ADD CONSTRAINT "conteo_lineas_conteo_id_conteos_id_fk" FOREIGN KEY ("conteo_id") REFERENCES "public"."conteos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteo_lineas" ADD CONSTRAINT "conteo_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteo_lineas" ADD CONSTRAINT "conteo_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "public"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_diferencia_id_diferencias_id_fk" FOREIGN KEY ("diferencia_id") REFERENCES "public"."diferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_contado_por_usuarios_id_fk" FOREIGN KEY ("contado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_pedido_por_usuarios_id_fk" FOREIGN KEY ("pedido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conteos" ADD CONSTRAINT "conteos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_a_cargo_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("a_cargo_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_traspaso_linea_id_traspaso_lineas_id_fk" FOREIGN KEY ("traspaso_linea_id") REFERENCES "public"."traspaso_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_entrega_corte_id_entregas_corte_id_fk" FOREIGN KEY ("entrega_corte_id") REFERENCES "public"."entregas_corte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_conteo_id_conteos_id_fk" FOREIGN KEY ("conteo_id") REFERENCES "public"."conteos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_aclarada_con_diferencia_id_diferencias_id_fk" FOREIGN KEY ("aclarada_con_diferencia_id") REFERENCES "public"."diferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_traspaso_nuevo_id_traspasos_id_fk" FOREIGN KEY ("traspaso_nuevo_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diferencias" ADD CONSTRAINT "diferencias_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ajuste_lineas_renglon" ON "ajuste_lineas" USING btree ("ajuste_id","renglon");--> statement-breakpoint
CREATE INDEX "ajuste_lineas_diferencia" ON "ajuste_lineas" USING btree ("diferencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ajustes_folio" ON "ajustes" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "ajustes_esperando" ON "ajustes" USING btree ("estado") WHERE "ajustes"."estado" = 'esperando_autorizacion';--> statement-breakpoint
CREATE INDEX "ajustes_ubicacion" ON "ajustes" USING btree ("ubicacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conteo_lineas_variante_del_conteo" ON "conteo_lineas" USING btree ("conteo_id","variante_id");--> statement-breakpoint
CREATE INDEX "conteo_lineas_variante" ON "conteo_lineas" USING btree ("variante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conteos_folio" ON "conteos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "conteos_ubicacion" ON "conteos" USING btree ("ubicacion_id","contado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conteos_diferencia" ON "conteos" USING btree ("diferencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diferencias_folio" ON "diferencias" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "diferencias_abiertas" ON "diferencias" USING btree ("estado") WHERE "diferencias"."estado" <> 'resuelta';--> statement-breakpoint
CREATE INDEX "diferencias_prenda_abierta" ON "diferencias" USING btree ("ubicacion_id","variante_id") WHERE "diferencias"."estado" <> 'resuelta';--> statement-breakpoint
CREATE INDEX "diferencias_material_abierta" ON "diferencias" USING btree ("ubicacion_id","material_id") WHERE "diferencias"."estado" <> 'resuelta';--> statement-breakpoint
CREATE INDEX "diferencias_traspaso" ON "diferencias" USING btree ("traspaso_id");--> statement-breakpoint
CREATE INDEX "diferencias_lote" ON "diferencias" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "diferencias_recepcion" ON "diferencias" USING btree ("recepcion_id");--> statement-breakpoint
CREATE INDEX "diferencias_ajuste" ON "diferencias" USING btree ("ajuste_id");--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Las DF- y los conteos de las tiendas bajan
-- a su caja con el POS.
SELECT poner_disparador_comun('diferencias', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('ajustes', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('ajuste_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('conteos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('conteo_lineas', baja_a_aparatos => false);
--> statement-breakpoint
-- Lo que se vio al contar y lo que mueve un ajuste no cambian: solo crecen.
SELECT marcar_solo_crece('ajuste_lineas');
--> statement-breakpoint
SELECT marcar_solo_crece('conteo_lineas');
