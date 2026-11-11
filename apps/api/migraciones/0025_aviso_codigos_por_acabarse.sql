-- Fase 8 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md («El aviso `codigos_por_acabarse`»):
-- Catálogo suma su tipo de aviso al CHECK de `avisos.tipo`.
ALTER TABLE "avisos" DROP CONSTRAINT "avisos_tipo";--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_tipo" CHECK (tipo in ('autorizacion_pedida', 'autorizacion_decidida', 'alerta_seguridad', 'dispositivo_sin_sincronizar', 'alerta_direccion', 'restauracion_por_probar', 'respaldo_fallido', 'pin_bloqueado', 'trabajo_fallido', 'codigos_por_acabarse'));
