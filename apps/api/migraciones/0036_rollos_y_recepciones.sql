CREATE TABLE "partidas_tela" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"codigo_proveedor" text NOT NULL,
	"material_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"primera_recepcion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "partidas_tela_codigo" CHECK (char_length("partidas_tela"."codigo_proveedor") between 1 and 20),
	CONSTRAINT "partidas_tela_mayusculas" CHECK ("partidas_tela"."codigo_proveedor" = upper("partidas_tela"."codigo_proveedor"))
);
--> statement-breakpoint
CREATE TABLE "recepcion_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recepcion_id" uuid NOT NULL,
	"renglon" smallint NOT NULL,
	"traspaso_linea_id" uuid,
	"orden_compra_linea_id" uuid,
	"variante_id" uuid,
	"material_id" uuid,
	"rollo_id" uuid,
	"partida_tela_id" uuid,
	"lote_id" uuid,
	"piezas_esperadas" integer,
	"piezas_contadas" integer,
	"diferencia_piezas" integer GENERATED ALWAYS AS (piezas_contadas - piezas_esperadas) STORED,
	"cantidad_esperada" numeric(12, 3),
	"cantidad_contada" numeric(12, 3),
	"diferencia_cantidad" numeric(12, 3) GENERATED ALWAYS AS (cantidad_contada - cantidad_esperada) STORED,
	"con_defecto" boolean DEFAULT false NOT NULL,
	"defecto_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "recepcion_lineas_forma" CHECK (("recepcion_lineas"."variante_id" is not null and "recepcion_lineas"."material_id" is null and "recepcion_lineas"."piezas_contadas" is not null
					and "recepcion_lineas"."cantidad_contada" is null)
				or ("recepcion_lineas"."material_id" is not null and "recepcion_lineas"."variante_id" is null and "recepcion_lineas"."cantidad_contada" is not null
					and "recepcion_lineas"."piezas_contadas" is null)),
	CONSTRAINT "recepcion_lineas_no_negativas" CHECK (coalesce("recepcion_lineas"."piezas_contadas", 0) >= 0 and coalesce("recepcion_lineas"."piezas_esperadas", 0) >= 0
				and coalesce("recepcion_lineas"."cantidad_contada", 0) >= 0 and coalesce("recepcion_lineas"."cantidad_esperada", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "recepciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"modo" text NOT NULL,
	"orden_compra_id" uuid,
	"traspaso_id" uuid,
	"despacho_id" uuid,
	"lote_id" uuid,
	"revision_id" uuid,
	"reproceso_id" uuid,
	"recibido_en" timestamp with time zone NOT NULL,
	"recibido_por" uuid,
	"hubo_diferencia" boolean NOT NULL,
	"movimiento_id" uuid,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "recepciones_tipo" CHECK ("recepciones"."tipo" in ('aduana_de_proveedor', 'aduana_de_camino', 'aduana_devolucion', 'aduana_del_taller', 'destino_despacho', 'entrega_cliente', 'bodega_regreso_corte')),
	CONSTRAINT "recepciones_modo" CHECK ("recepciones"."modo" in ('completo', 'con_diferencias', 'ciego')),
	CONSTRAINT "recepciones_documento" CHECK (("recepciones"."tipo" <> 'aduana_de_proveedor' or "recepciones"."orden_compra_id" is not null)
				and ("recepciones"."tipo" not in ('aduana_de_camino', 'aduana_devolucion') or "recepciones"."traspaso_id" is not null)
				and ("recepciones"."tipo" not in ('destino_despacho', 'entrega_cliente') or "recepciones"."despacho_id" is not null)
				and ("recepciones"."tipo" not in ('aduana_del_taller', 'bodega_regreso_corte') or "recepciones"."lote_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "rollos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"material_id" uuid NOT NULL,
	"partida_tela_id" uuid,
	"proveedor_id" uuid,
	"orden_compra_id" uuid,
	"orden_compra_linea_id" uuid,
	"recepcion_id" uuid,
	"metros_iniciales" numeric(12, 3) NOT NULL,
	"costo_metro_centavos" bigint,
	"estado" text NOT NULL,
	"es_retazo" boolean DEFAULT false NOT NULL,
	"es_carga_inicial" boolean DEFAULT false NOT NULL,
	"etiqueta_impresa_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "rollos_metros" CHECK ("rollos"."metros_iniciales" > 0),
	CONSTRAINT "rollos_costo" CHECK ("rollos"."costo_metro_centavos" > 0),
	CONSTRAINT "rollos_estado" CHECK ("rollos"."estado" in ('disponible', 'entregado', 'por_recibir', 'agotado', 'devuelto')),
	CONSTRAINT "rollos_partida" CHECK ("rollos"."partida_tela_id" is not null or "rollos"."es_carga_inicial"),
	CONSTRAINT "rollos_de_proveedor" CHECK ("rollos"."es_carga_inicial" or ("rollos"."orden_compra_linea_id" is not null and "rollos"."recepcion_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "partidas_tela" ADD CONSTRAINT "partidas_tela_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas_tela" ADD CONSTRAINT "partidas_tela_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas_tela" ADD CONSTRAINT "partidas_tela_primera_recepcion_id_recepciones_id_fk" FOREIGN KEY ("primera_recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas_tela" ADD CONSTRAINT "partidas_tela_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_traspaso_linea_id_traspaso_lineas_id_fk" FOREIGN KEY ("traspaso_linea_id") REFERENCES "public"."traspaso_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_orden_compra_linea_id_orden_compra_lineas_id_fk" FOREIGN KEY ("orden_compra_linea_id") REFERENCES "public"."orden_compra_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_partida_tela_id_partidas_tela_id_fk" FOREIGN KEY ("partida_tela_id") REFERENCES "public"."partidas_tela"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepcion_lineas" ADD CONSTRAINT "recepcion_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_recibido_por_usuarios_id_fk" FOREIGN KEY ("recibido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_partida_tela_id_partidas_tela_id_fk" FOREIGN KEY ("partida_tela_id") REFERENCES "public"."partidas_tela"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_orden_compra_id_ordenes_compra_id_fk" FOREIGN KEY ("orden_compra_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_orden_compra_linea_id_orden_compra_lineas_id_fk" FOREIGN KEY ("orden_compra_linea_id") REFERENCES "public"."orden_compra_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollos" ADD CONSTRAINT "rollos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partidas_tela_folio" ON "partidas_tela" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "partidas_tela_codigo" ON "partidas_tela" USING btree ("proveedor_id","material_id","codigo_proveedor");--> statement-breakpoint
CREATE UNIQUE INDEX "recepcion_lineas_renglon" ON "recepcion_lineas" USING btree ("recepcion_id","renglon");--> statement-breakpoint
CREATE INDEX "recepcion_lineas_orden_linea" ON "recepcion_lineas" USING btree ("orden_compra_linea_id");--> statement-breakpoint
CREATE INDEX "recepciones_orden" ON "recepciones" USING btree ("orden_compra_id");--> statement-breakpoint
CREATE INDEX "recepciones_traspaso" ON "recepciones" USING btree ("traspaso_id");--> statement-breakpoint
CREATE INDEX "recepciones_despacho" ON "recepciones" USING btree ("despacho_id");--> statement-breakpoint
CREATE INDEX "recepciones_lote" ON "recepciones" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "recepciones_tipo" ON "recepciones" USING btree ("tipo","recibido_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "rollos_folio" ON "rollos" USING btree ("folio");--> statement-breakpoint
CREATE INDEX "rollos_material_estado" ON "rollos" USING btree ("material_id","estado");--> statement-breakpoint
CREATE INDEX "rollos_orden_linea" ON "rollos" USING btree ("orden_compra_linea_id");--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_recepcion_id_recepciones_id_fk" FOREIGN KEY ("recepcion_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "existencias_material" ADD CONSTRAINT "existencias_material_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_rollo_id_rollos_id_fk" FOREIGN KEY ("rollo_id") REFERENCES "public"."rollos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_recepcion_aduana_id_recepciones_id_fk" FOREIGN KEY ("recepcion_aduana_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_recepcion_destino_id_recepciones_id_fk" FOREIGN KEY ("recepcion_destino_id") REFERENCES "public"."recepciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; los renglones de una recepción solo crecen.
SELECT poner_disparador_comun('partidas_tela', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('rollos', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('recepciones', baja_a_aparatos => false);--> statement-breakpoint
SELECT poner_disparador_comun('recepcion_lineas', baja_a_aparatos => false);--> statement-breakpoint
SELECT marcar_solo_crece('recepcion_lineas');
