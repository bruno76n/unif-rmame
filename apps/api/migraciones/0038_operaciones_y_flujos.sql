CREATE TABLE "flujo_operaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flujo_id" uuid NOT NULL,
	"operacion_id" uuid NOT NULL,
	"orden" smallint NOT NULL,
	"persona_base_id" uuid NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "flujo_operaciones_orden" CHECK ("flujo_operaciones"."orden" > 0)
);
--> statement-breakpoint
CREATE TABLE "flujos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"copiado_de_flujo_id" uuid,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "flujos_nombre_largo" CHECK (char_length("flujos"."nombre") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "operaciones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"es_corte" boolean DEFAULT false NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_por" uuid,
	"motivo_baja" text,
	"reactivado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid,
	"actualizado_en" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"xid_escritura" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "operaciones_nombre_largo" CHECK (char_length("operaciones"."nombre") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_flujo_id_flujos_id_fk" FOREIGN KEY ("flujo_id") REFERENCES "public"."flujos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_operacion_id_operaciones_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_persona_base_id_personas_id_fk" FOREIGN KEY ("persona_base_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujos" ADD CONSTRAINT "flujos_copiado_de_flujo_id_flujos_id_fk" FOREIGN KEY ("copiado_de_flujo_id") REFERENCES "public"."flujos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujos" ADD CONSTRAINT "flujos_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flujos" ADD CONSTRAINT "flujos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operaciones" ADD CONSTRAINT "operaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flujo_operaciones_operacion" ON "flujo_operaciones" USING btree ("flujo_id","operacion_id") WHERE "flujo_operaciones"."baja_en" is null;--> statement-breakpoint
CREATE INDEX "flujo_operaciones_flujo" ON "flujo_operaciones" USING btree ("flujo_id");--> statement-breakpoint
CREATE INDEX "flujo_operaciones_persona" ON "flujo_operaciones" USING btree ("persona_base_id");--> statement-breakpoint
CREATE INDEX "flujo_operaciones_xid_escritura" ON "flujo_operaciones" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "flujos_nombre" ON "flujos" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "flujos_xid_escritura" ON "flujos" USING btree ("xid_escritura");--> statement-breakpoint
CREATE UNIQUE INDEX "operaciones_nombre" ON "operaciones" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "operaciones_un_corte" ON "operaciones" USING btree ("es_corte") WHERE "operaciones"."es_corte";--> statement-breakpoint
CREATE INDEX "operaciones_xid_escritura" ON "operaciones" USING btree ("xid_escritura");--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_flujo_id_flujos_id_fk" FOREIGN KEY ("flujo_id") REFERENCES "public"."flujos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_prenda" ADD CONSTRAINT "tipos_prenda_flujo_defecto_id_flujos_id_fk" FOREIGN KEY ("flujo_defecto_id") REFERENCES "public"."flujos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifas_operacion" ADD CONSTRAINT "tarifas_operacion_flujo_operacion_id_flujo_operaciones_id_fk" FOREIGN KEY ("flujo_operacion_id") REFERENCES "public"."flujo_operaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Escrito a mano (docs/modulos/produccion/operaciones-y-flujos.md): el orden de las operaciones vigentes de un flujo es único, revisado al final de la transacción, porque al agregar o quitar una las siguientes recorren su orden.
ALTER TABLE "flujo_operaciones" ADD CONSTRAINT "flujo_operaciones_un_orden" EXCLUDE USING btree ("flujo_id" WITH =, "orden" WITH =) WHERE ("baja_en" IS NULL) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Las columnas comunes; las tres bajan a la tablet del taller.
SELECT poner_disparador_comun('operaciones', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('flujos', baja_a_aparatos => true);
--> statement-breakpoint
SELECT poner_disparador_comun('flujo_operaciones', baja_a_aparatos => true);
