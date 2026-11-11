CREATE TABLE "traspaso_lineas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"traspaso_id" uuid NOT NULL,
	"renglon" smallint NOT NULL,
	"variante_id" uuid,
	"material_id" uuid,
	"rollo_id" uuid,
	"lote_id" uuid,
	"piezas_enviadas" integer,
	"piezas_recibidas_aduana" integer,
	"piezas_repartidas" integer DEFAULT 0 NOT NULL,
	"piezas_recibidas_destino" integer,
	"cantidad_enviada" numeric(12, 3),
	"cantidad_recibida_aduana" numeric(12, 3),
	"cantidad_repartida" numeric(12, 3) DEFAULT '0' NOT NULL,
	"cantidad_recibida_destino" numeric(12, 3),
	"defecto_id" uuid,
	"pedido_linea_id" uuid,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "traspaso_lineas_forma" CHECK (("traspaso_lineas"."variante_id" is not null and "traspaso_lineas"."material_id" is null and "traspaso_lineas"."rollo_id" is null
					and "traspaso_lineas"."cantidad_enviada" is null and "traspaso_lineas"."cantidad_recibida_aduana" is null
					and "traspaso_lineas"."cantidad_recibida_destino" is null and "traspaso_lineas"."cantidad_repartida" = 0)
				or ("traspaso_lineas"."material_id" is not null and "traspaso_lineas"."variante_id" is null
					and "traspaso_lineas"."piezas_enviadas" is null and "traspaso_lineas"."piezas_recibidas_aduana" is null
					and "traspaso_lineas"."piezas_recibidas_destino" is null and "traspaso_lineas"."piezas_repartidas" = 0)),
	CONSTRAINT "traspaso_lineas_no_negativas" CHECK (coalesce("traspaso_lineas"."piezas_enviadas", 0) >= 0 and coalesce("traspaso_lineas"."piezas_recibidas_aduana", 0) >= 0
				and "traspaso_lineas"."piezas_repartidas" >= 0 and coalesce("traspaso_lineas"."piezas_recibidas_destino", 0) >= 0
				and coalesce("traspaso_lineas"."cantidad_enviada", 0) >= 0 and coalesce("traspaso_lineas"."cantidad_recibida_aduana", 0) >= 0
				and "traspaso_lineas"."cantidad_repartida" >= 0 and coalesce("traspaso_lineas"."cantidad_recibida_destino", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "traspasos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"folio" text NOT NULL,
	"tipo" text NOT NULL,
	"origen_ubicacion_id" uuid,
	"origen_externo" text,
	"destino_ubicacion_id" uuid,
	"destino_externo" text,
	"estado" text NOT NULL,
	"solicitud_tienda_id" uuid,
	"salida_tienda_id" uuid,
	"solicitud_envio_id" uuid,
	"folio_rb" text,
	"pedido_id" uuid,
	"nota_entrega_id" uuid,
	"pedido_especial_tienda_id" uuid,
	"lote_id" uuid,
	"reproceso_id" uuid,
	"orden_compra_id" uuid,
	"devolucion_linea_id" uuid,
	"nota_credito_id" uuid,
	"traspaso_padre_id" uuid,
	"recepcion_aduana_id" uuid,
	"despacho_id" uuid,
	"recepcion_destino_id" uuid,
	"fecha_salida_esperada" date,
	"enviado_en" timestamp with time zone,
	"llego_aduana_en" timestamp with time zone,
	"terminado_en" timestamp with time zone,
	"etiquetas_impresas_en" timestamp with time zone,
	"nota" text,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"clave_idempotencia" uuid,
	"cancelado_en" timestamp with time zone,
	"cancelado_por" uuid,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "traspasos_tipo" CHECK ("traspasos"."tipo" in ('solicitud_tienda', 'reabasto', 'pedido_linea', 'surtido_pedido_externo', 'lote_cliente', 'lote_reabasto', 'lote_temporada', 'lote_pedido_especial', 'quitado_de_pedido', 'excedente_pedido', 'reproceso', 'material_proveedor', 'nota_entrega', 'devolucion_defecto', 'sobrante_descontinuada', 'traspaso_entre_tiendas', 'pedido_de_bodega', 'otro_de_tienda', 'regresa', 'devolucion_cliente_externo', 'devolucion_linea', 'devolucion_proveedor')),
	CONSTRAINT "traspasos_estado" CHECK ("traspasos"."estado" in ('esperado', 'en_camino_aduana', 'en_aduana', 'en_transito', 'recibido', 'con_diferencia', 'salio', 'repartido', 'cancelado')),
	CONSTRAINT "traspasos_origen_externo" CHECK ("traspasos"."origen_externo" in ('proveedor', 'cliente_externo', 'cliente_linea')),
	CONSTRAINT "traspasos_destino_externo" CHECK ("traspasos"."destino_externo" in ('cliente_externo', 'cliente_linea', 'proveedor', 'merma')),
	CONSTRAINT "traspasos_un_origen" CHECK (("traspasos"."origen_ubicacion_id" is null) <> ("traspasos"."origen_externo" is null)
				or ("traspasos"."tipo" = 'regresa' and "traspasos"."origen_ubicacion_id" is null and "traspasos"."origen_externo" is null)),
	CONSTRAINT "traspasos_un_destino" CHECK (not ("traspasos"."destino_ubicacion_id" is not null and "traspasos"."destino_externo" is not null)
				and ("traspasos"."destino_ubicacion_id" is not null or "traspasos"."destino_externo" is not null
					or ("traspasos"."estado" in ('en_camino_aduana', 'en_aduana') and "traspasos"."tipo" in ('sobrante_descontinuada', 'otro_de_tienda', 'devolucion_defecto', 'devolucion_cliente_externo', 'devolucion_linea')))),
	CONSTRAINT "traspasos_esperado" CHECK ("traspasos"."estado" <> 'esperado' or "traspasos"."tipo" in ('devolucion_cliente_externo', 'devolucion_linea', 'devolucion_proveedor')),
	CONSTRAINT "traspasos_terminado" CHECK (("traspasos"."estado" in ('recibido', 'con_diferencia', 'salio', 'repartido', 'cancelado')) = ("traspasos"."terminado_en" is not null)),
	CONSTRAINT "traspasos_cancelado" CHECK (("traspasos"."estado" = 'cancelado') = ("traspasos"."cancelado_en" is not null and "traspasos"."motivo_cancelacion" is not null))
);
--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_origen_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("origen_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_destino_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("destino_ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_traspaso_padre_id_traspasos_id_fk" FOREIGN KEY ("traspaso_padre_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_cancelado_por_usuarios_id_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "traspaso_lineas_renglon" ON "traspaso_lineas" USING btree ("traspaso_id","renglon");--> statement-breakpoint
CREATE INDEX "traspaso_lineas_variante" ON "traspaso_lineas" USING btree ("variante_id");--> statement-breakpoint
CREATE INDEX "traspaso_lineas_pedido_linea" ON "traspaso_lineas" USING btree ("pedido_linea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traspasos_folio" ON "traspasos" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX "traspasos_clave" ON "traspasos" USING btree ("clave_idempotencia") WHERE "traspasos"."clave_idempotencia" is not null;--> statement-breakpoint
CREATE INDEX "traspasos_abiertos" ON "traspasos" USING btree ("estado") WHERE "traspasos"."estado" not in ('recibido', 'con_diferencia', 'salio', 'repartido', 'cancelado');--> statement-breakpoint
CREATE INDEX "traspasos_destino_estado" ON "traspasos" USING btree ("destino_ubicacion_id","estado");--> statement-breakpoint
CREATE INDEX "traspasos_origen_estado" ON "traspasos" USING btree ("origen_ubicacion_id","estado");--> statement-breakpoint
CREATE INDEX "traspasos_despacho" ON "traspasos" USING btree ("despacho_id");--> statement-breakpoint
CREATE INDEX "traspasos_pedido" ON "traspasos" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "traspasos_nota_entrega" ON "traspasos" USING btree ("nota_entrega_id");--> statement-breakpoint
CREATE INDEX "traspasos_solicitud_tienda" ON "traspasos" USING btree ("solicitud_tienda_id");--> statement-breakpoint
CREATE INDEX "traspasos_folio_rb" ON "traspasos" USING btree ("folio_rb");--> statement-breakpoint
CREATE INDEX "traspasos_padre" ON "traspasos" USING btree ("traspaso_padre_id");--> statement-breakpoint
CREATE INDEX "traspasos_version" ON "traspasos" USING btree ("version");--> statement-breakpoint
ALTER TABLE "movimiento_lineas" ADD CONSTRAINT "movimiento_lineas_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes; nada de esto baja a un aparato todavía.
SELECT poner_disparador_comun('traspasos', baja_a_aparatos => false);
--> statement-breakpoint
SELECT poner_disparador_comun('traspaso_lineas', baja_a_aparatos => false);
--> statement-breakpoint
-- Escrito a mano (docs/modulos/inventario/traspasos.md, «La partida en aduana»): una partida A- es un traspaso
-- en aduana. Por renglón, lo que queda (recibido − repartido), sus horas desde que llegó, su color con
-- `inventario.dias_aduana_ambar` y `inventario.horas_aduana_parado`, y si sale hoy o mañana (hora de México).
CREATE VIEW partidas_aduana AS
WITH limites AS (
	SELECT
		(SELECT valor_entero::int FROM parametros WHERE clave = 'inventario.horas_aduana_parado') AS horas_parado,
		(SELECT valor_entero::int FROM parametros WHERE clave = 'inventario.dias_aduana_ambar') * 24 AS horas_ambar,
		(now() AT TIME ZONE 'America/Mexico_City')::date AS hoy
)
SELECT
	t.id AS traspaso_id,
	t.folio,
	t.tipo,
	t.origen_ubicacion_id,
	t.origen_externo,
	t.destino_ubicacion_id,
	t.destino_externo,
	l.id AS linea_id,
	l.renglon,
	l.variante_id,
	l.material_id,
	l.rollo_id,
	l.lote_id,
	CASE WHEN l.variante_id IS NOT NULL THEN l.piezas_recibidas_aduana - l.piezas_repartidas END AS piezas,
	CASE WHEN l.material_id IS NOT NULL THEN l.cantidad_recibida_aduana - l.cantidad_repartida END AS cantidad,
	t.llego_aduana_en,
	round((extract(epoch FROM now() - t.llego_aduana_en) / 3600)::numeric, 1) AS horas_en_aduana,
	CASE
		WHEN now() - t.llego_aduana_en >= make_interval(hours => limites.horas_parado) THEN 'rojo'
		WHEN now() - t.llego_aduana_en >= make_interval(hours => limites.horas_ambar) THEN 'ambar'
		ELSE 'verde'
	END AS color,
	t.fecha_salida_esperada,
	CASE
		WHEN t.fecha_salida_esperada <= limites.hoy THEN 'hoy'
		WHEN t.fecha_salida_esperada = limites.hoy + 1 THEN 'manana'
	END AS sale
FROM traspasos t
JOIN traspaso_lineas l ON l.traspaso_id = t.id
CROSS JOIN limites
WHERE t.estado = 'en_aduana'
	AND coalesce(l.piezas_recibidas_aduana - l.piezas_repartidas, l.cantidad_recibida_aduana - l.cantidad_repartida) > 0;
