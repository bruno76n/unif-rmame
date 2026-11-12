CREATE TABLE "revisiones_devolucion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"traspaso_id" uuid NOT NULL,
	"traspaso_linea_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"salida_tienda_id" uuid,
	"nota_credito_id" uuid,
	"variante_id" uuid NOT NULL,
	"lote_id" uuid,
	"piezas" integer NOT NULL,
	"decision" text NOT NULL,
	"defecto_id" uuid,
	"motivo" text,
	"revisado_por" uuid NOT NULL,
	"revisado_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "revisiones_devolucion_origen" CHECK ("revisiones_devolucion"."origen" in ('salida_tienda', 'nota_credito', 'devolucion_linea')),
	CONSTRAINT "revisiones_devolucion_decision" CHECK ("revisiones_devolucion"."decision" in ('sirve', 'merma')),
	CONSTRAINT "revisiones_devolucion_piezas" CHECK ("revisiones_devolucion"."piezas" > 0),
	CONSTRAINT "revisiones_devolucion_motivo" CHECK ("revisiones_devolucion"."decision" <> 'merma' or char_length(trim("revisiones_devolucion"."motivo")) > 0)
);
--> statement-breakpoint
CREATE TABLE "nota_credito_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nota_credito_id" uuid NOT NULL,
	"nota_entrega_linea_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "nota_credito_lineas_cantidad" CHECK ("nota_credito_lineas"."cantidad" > 0),
	CONSTRAINT "nota_credito_lineas_precio" CHECK ("nota_credito_lineas"."precio_unitario_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "nota_entrega_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nota_entrega_id" uuid NOT NULL,
	"pedido_renglon_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario_centavos" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "nota_entrega_lineas_cantidad" CHECK ("nota_entrega_lineas"."cantidad" > 0),
	CONSTRAINT "nota_entrega_lineas_precio" CHECK ("nota_entrega_lineas"."precio_unitario_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "notas_credito" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text,
	"nota_entrega_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"que_paso" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"autorizacion_id" uuid,
	"autorizada_en" timestamp with time zone,
	"rechazada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "notas_credito_estado" CHECK ("notas_credito"."estado" in ('por_autorizar', 'autorizada', 'rechazada')),
	CONSTRAINT "notas_credito_monto" CHECK ("notas_credito"."monto_centavos" > 0),
	CONSTRAINT "notas_credito_autorizada" CHECK (("notas_credito"."estado" = 'autorizada') = ("notas_credito"."folio" is not null and "notas_credito"."autorizada_en" is not null)),
	CONSTRAINT "notas_credito_rechazada" CHECK (("notas_credito"."estado" = 'rechazada') = ("notas_credito"."rechazada_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "notas_entrega" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"pedido_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"numero_en_pedido" integer NOT NULL,
	"estado" text NOT NULL,
	"subtotal_centavos" bigint NOT NULL,
	"anticipo_aplicado_centavos" bigint DEFAULT 0 NOT NULL,
	"despacho_id" uuid,
	"despachado_en" timestamp with time zone,
	"fecha_entrega" date,
	"entregada_en" timestamp with time zone,
	"recibio_nombre" text,
	"entregada_por" uuid,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "notas_entrega_estado" CHECK ("notas_entrega"."estado" in ('por_despachar', 'en_camino', 'entregada', 'cancelada')),
	CONSTRAINT "notas_entrega_numero" CHECK ("notas_entrega"."numero_en_pedido" >= 1),
	CONSTRAINT "notas_entrega_montos" CHECK ("notas_entrega"."subtotal_centavos" > 0 and "notas_entrega"."anticipo_aplicado_centavos" between 0 and "notas_entrega"."subtotal_centavos"),
	CONSTRAINT "notas_entrega_despachada" CHECK (("notas_entrega"."estado" in ('en_camino', 'entregada')) = ("notas_entrega"."despacho_id" is not null and "notas_entrega"."despachado_en" is not null)),
	CONSTRAINT "notas_entrega_entregada" CHECK (("notas_entrega"."estado" = 'entregada') = ("notas_entrega"."fecha_entrega" is not null and "notas_entrega"."entregada_en" is not null
				and "notas_entrega"."recibio_nombre" is not null and "notas_entrega"."entregada_por" is not null)),
	CONSTRAINT "notas_entrega_cancelada" CHECK (("notas_entrega"."estado" = 'cancelada') = ("notas_entrega"."cancelado_en" is not null and "notas_entrega"."cancelado_por" is not null
				and "notas_entrega"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "traspasos" DROP CONSTRAINT "traspasos_un_destino";--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_traspaso_linea_id_traspaso_lineas_id_fk" FOREIGN KEY ("traspaso_linea_id") REFERENCES "public"."traspaso_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_defecto_id_defectos_id_fk" FOREIGN KEY ("defecto_id") REFERENCES "public"."defectos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_devolucion" ADD CONSTRAINT "revisiones_devolucion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_credito_lineas" ADD CONSTRAINT "nota_credito_lineas_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_credito_lineas" ADD CONSTRAINT "nota_credito_lineas_nota_entrega_linea_id_nota_entrega_lineas_id_fk" FOREIGN KEY ("nota_entrega_linea_id") REFERENCES "public"."nota_entrega_lineas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_credito_lineas" ADD CONSTRAINT "nota_credito_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_credito_lineas" ADD CONSTRAINT "nota_credito_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_entrega_lineas" ADD CONSTRAINT "nota_entrega_lineas_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_entrega_lineas" ADD CONSTRAINT "nota_entrega_lineas_pedido_renglon_id_pedido_renglones_id_fk" FOREIGN KEY ("pedido_renglon_id") REFERENCES "public"."pedido_renglones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_entrega_lineas" ADD CONSTRAINT "nota_entrega_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_entrega_lineas" ADD CONSTRAINT "nota_entrega_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_autorizacion_id_autorizaciones_id_fk" FOREIGN KEY ("autorizacion_id") REFERENCES "public"."autorizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_despacho_id_despachos_id_fk" FOREIGN KEY ("despacho_id") REFERENCES "public"."despachos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_entregada_por_usuarios_id_fk" FOREIGN KEY ("entregada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrega" ADD CONSTRAINT "notas_entrega_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revisiones_devolucion_traspaso" ON "revisiones_devolucion" USING btree ("traspaso_id");--> statement-breakpoint
CREATE INDEX "revisiones_devolucion_linea" ON "revisiones_devolucion" USING btree ("traspaso_linea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nota_credito_lineas_renglon" ON "nota_credito_lineas" USING btree ("nota_credito_id","nota_entrega_linea_id");--> statement-breakpoint
CREATE INDEX "nota_credito_lineas_por_renglon" ON "nota_credito_lineas" USING btree ("nota_entrega_linea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nota_entrega_lineas_variante" ON "nota_entrega_lineas" USING btree ("nota_entrega_id","variante_id");--> statement-breakpoint
CREATE INDEX "nota_entrega_lineas_por_variante" ON "nota_entrega_lineas" USING btree ("variante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_credito_folio" ON "notas_credito" USING btree ("folio") WHERE "notas_credito"."folio" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_credito_por_autorizar" ON "notas_credito" USING btree ("nota_entrega_id") WHERE "notas_credito"."estado" = 'por_autorizar';--> statement-breakpoint
CREATE UNIQUE INDEX "notas_credito_autorizacion" ON "notas_credito" USING btree ("autorizacion_id");--> statement-breakpoint
CREATE INDEX "notas_credito_cliente" ON "notas_credito" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_entrega_folio" ON "notas_entrega" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_entrega_numero" ON "notas_entrega" USING btree ("pedido_id","numero_en_pedido");--> statement-breakpoint
CREATE INDEX "notas_entrega_abiertas" ON "notas_entrega" USING btree ("estado") WHERE "notas_entrega"."estado" in ('por_despachar', 'en_camino');--> statement-breakpoint
CREATE INDEX "notas_entrega_despacho" ON "notas_entrega" USING btree ("despacho_id");--> statement-breakpoint
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_favor_movimientos" ADD CONSTRAINT "saldo_favor_movimientos_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones" ADD CONSTRAINT "autorizaciones_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_nota_entrega_id_notas_entrega_id_fk" FOREIGN KEY ("nota_entrega_id") REFERENCES "public"."notas_entrega"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_nota_credito_id_notas_credito_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."notas_credito"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_un_destino" CHECK (not ("traspasos"."destino_ubicacion_id" is not null and "traspasos"."destino_externo" is not null)
				and ("traspasos"."destino_ubicacion_id" is not null or "traspasos"."destino_externo" is not null
					or ("traspasos"."estado" in ('esperado', 'en_camino_aduana', 'en_aduana', 'repartido') and "traspasos"."tipo" in ('sobrante_descontinuada', 'otro_de_tienda', 'devolucion_defecto', 'devolucion_cliente_externo', 'devolucion_linea'))));--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Ninguna baja a la tablet; los renglones de
-- las notas y las revisiones de las devoluciones no cambian desde que nacen.
SELECT poner_disparador_comun('notas_entrega', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('nota_entrega_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('nota_entrega_lineas');
--> statement-breakpoint
SELECT poner_disparador_comun('notas_credito', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('nota_credito_lineas', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('nota_credito_lineas');
--> statement-breakpoint
SELECT poner_disparador_comun('revisiones_devolucion', baja_a_aparatos => false);
--> statement-breakpoint
SELECT marcar_solo_crece('revisiones_devolucion');
