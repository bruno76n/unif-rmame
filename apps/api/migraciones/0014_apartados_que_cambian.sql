CREATE INDEX "comandos_recibidos_documento" ON "comandos_recibidos" USING btree ("dispositivo_id","entidad_id") WHERE "comandos_recibidos"."entidad_id" is not null;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/SINCRONIZACION.md, decisión 413): un apartado que se reintenta y se vuelve a
-- apartar por otro motivo guarda el motivo nuevo y, si ya no espera un documento, deja de esperarlo.
GRANT UPDATE (motivo_apartado, espera_entidad_id) ON comandos_recibidos TO uniformame_app;
