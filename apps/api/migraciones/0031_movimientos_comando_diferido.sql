-- Fase 9 · docs/modulos/inventario/libro-de-movimientos.md (regla 9): un comando que sube un aparato escribe sus
-- movimientos antes de guardar su renglón en `comandos_recibidos` (en la misma transacción), así que la llave del
-- movimiento a su comando se revisa al confirmar, como la de la excepción (decisión 487).
ALTER TABLE "movimientos" ALTER CONSTRAINT "movimientos_comando_id_comandos_recibidos_id_fk" DEFERRABLE INITIALLY DEFERRED;
