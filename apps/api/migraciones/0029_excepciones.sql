CREATE TABLE "excepciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"area" text DEFAULT 'bodega' NOT NULL,
	"estado" text NOT NULL,
	"descripcion" text NOT NULL,
	"ubicacion_id" uuid,
	"variante_id" uuid,
	"documento_tipo" text,
	"documento_id" uuid,
	"documento_folio" text,
	"comando_id" uuid,
	"dispositivo_id" uuid,
	"persona_id" uuid,
	"cuadre_id" uuid,
	"datos" jsonb,
	"detectada_en" timestamp with time zone NOT NULL,
	"resuelta_en" timestamp with time zone,
	"resuelta_por" uuid,
	"resolucion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "excepciones_tipo" CHECK ("excepciones"."tipo" in ('dispositivo_revocado', 'cuadre_proyeccion', 'sin_confirmar', 'reserva_sin_documento', 'rollo_en_dos_lugares', 'pasa_tope_bulto', 'lote_no_en_proceso', 'referencia_desconocida', 'pedido_linea_sin_pieza', 'pago_despues_de_vencer', 'variante_sin_canal_linea', 'totales_no_cuadran', 'pago_de_pedido_cancelado', 'cancelacion_tardia', 'recepcion_duplicada', 'conteo_no_coincide', 'folio_repetido', 'hora_adelantada', 'turno_desconocido', 'turno_cerrado', 'turnos_abiertos_dos', 'devuelve_de_mas', 'entrega_de_mas', 'entrega_sin_recibir', 'anticipo_mayor_total', 'corte_no_coincide', 'corte_repetido')),
	CONSTRAINT "excepciones_area" CHECK ("excepciones"."area" in ('bodega', 'contaduria')),
	CONSTRAINT "excepciones_estado" CHECK ("excepciones"."estado" in ('por_revisar', 'resuelta')),
	CONSTRAINT "excepciones_documento_tipo" CHECK ("excepciones"."documento_tipo" in ('carga_inicial', 'conteo', 'venta_tienda', 'devolucion_mostrador', 'merma_tienda', 'salida_tienda', 'traspaso', 'recepcion', 'despacho', 'nota_entrega', 'pedido_linea', 'corte', 'registro_operacion', 'toma_consumible', 'entrega_corte', 'ajuste', 'diferencia', 'reproceso')),
	CONSTRAINT "excepciones_resuelta" CHECK (("excepciones"."estado" = 'resuelta') = ("excepciones"."resuelta_en" is not null and "excepciones"."resolucion" is not null))
);
--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano: la llave se revisa al confirmar, porque la subida abre la excepción antes de guardar su comando.
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_comando_id_comandos_recibidos_id_fk" FOREIGN KEY ("comando_id") REFERENCES "public"."comandos_recibidos"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excepciones" ADD CONSTRAINT "excepciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "excepciones_bandeja" ON "excepciones" USING btree ("area","estado","detectada_en") WHERE "excepciones"."estado" = 'por_revisar';--> statement-breakpoint
CREATE INDEX "excepciones_tipo" ON "excepciones" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "excepciones_documento" ON "excepciones" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "excepciones_comando" ON "excepciones" USING btree ("comando_id");--> statement-breakpoint
ALTER TABLE "comandos_recibidos" ADD CONSTRAINT "comandos_recibidos_excepcion_id_excepciones_id_fk" FOREIGN KEY ("excepcion_id") REFERENCES "public"."excepciones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): las columnas comunes.
SELECT poner_disparador_comun('excepciones', baja_a_aparatos => false);
