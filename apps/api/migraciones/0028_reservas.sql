CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"variante_id" uuid NOT NULL,
	"piezas" integer NOT NULL,
	"motivo" text NOT NULL,
	"pedido_id" uuid,
	"nota_entrega_id" uuid,
	"pedido_linea_id" uuid,
	"pedido_linea_renglon_id" uuid,
	"apartado_tienda_id" uuid,
	"pedido_especial_tienda_id" uuid,
	"traspaso_id" uuid,
	"estado" text NOT NULL,
	"vence_en" timestamp with time zone,
	"separada_en" timestamp with time zone,
	"transferida_a_reserva_id" uuid,
	"consumida_por_movimiento_id" uuid,
	"terminada_en" timestamp with time zone,
	"motivo_fin" text,
	"nota_fin" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "reservas_piezas" CHECK ("reservas"."piezas" > 0),
	CONSTRAINT "reservas_motivo" CHECK ("reservas"."motivo" in ('pedido_externo', 'nota_entrega', 'pedido_linea', 'apartado_tienda', 'pedido_especial_tienda')),
	CONSTRAINT "reservas_estado" CHECK ("reservas"."estado" in ('activa', 'consumida', 'liberada', 'transferida')),
	CONSTRAINT "reservas_motivo_fin" CHECK ("reservas"."motivo_fin" in ('cumplida', 'documento_cancelado', 'vencio_pago', 'quitada_del_pedido', 'nota_cancelada', 'pasa_a_nota', 'reasignada', 'no_la_encontro')),
	CONSTRAINT "reservas_documento" CHECK (case "reservas"."motivo"
				when 'pedido_externo' then "reservas"."pedido_id" is not null
				when 'nota_entrega' then "reservas"."nota_entrega_id" is not null
				when 'pedido_linea' then "reservas"."pedido_linea_id" is not null
				when 'apartado_tienda' then "reservas"."apartado_tienda_id" is not null
				when 'pedido_especial_tienda' then "reservas"."pedido_especial_tienda_id" is not null
			end),
	CONSTRAINT "reservas_terminada" CHECK (("reservas"."estado" <> 'activa') = ("reservas"."terminada_en" is not null and "reservas"."motivo_fin" is not null)),
	CONSTRAINT "reservas_transferida" CHECK (("reservas"."estado" = 'transferida') = ("reservas"."transferida_a_reserva_id" is not null)),
	CONSTRAINT "reservas_consumida" CHECK (("reservas"."estado" = 'consumida') = ("reservas"."consumida_por_movimiento_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_transferida_a_reserva_id_reservas_id_fk" FOREIGN KEY ("transferida_a_reserva_id") REFERENCES "public"."reservas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_consumida_por_movimiento_id_movimientos_id_fk" FOREIGN KEY ("consumida_por_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservas_activas" ON "reservas" USING btree ("ubicacion_id","variante_id") WHERE "reservas"."estado" = 'activa';--> statement-breakpoint
CREATE INDEX "reservas_vencen" ON "reservas" USING btree ("vence_en") WHERE "reservas"."estado" = 'activa' and "reservas"."vence_en" is not null;--> statement-breakpoint
CREATE INDEX "reservas_pedido_linea" ON "reservas" USING btree ("pedido_linea_id");--> statement-breakpoint
CREATE INDEX "reservas_nota_entrega" ON "reservas" USING btree ("nota_entrega_id");--> statement-breakpoint
CREATE INDEX "reservas_pedido" ON "reservas" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "reservas_traspaso" ON "reservas" USING btree ("traspaso_id");--> statement-breakpoint
CREATE INDEX "reservas_version" ON "reservas" USING btree ("version");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes. Con el POS, las reservas bajarán a la
-- caja de cada tienda con su `xid_escritura`.
SELECT poner_disparador_comun('reservas', baja_a_aparatos => false);
