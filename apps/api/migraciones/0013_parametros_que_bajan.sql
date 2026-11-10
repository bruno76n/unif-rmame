-- Fase 6 · docs/modulos/admin/configuracion.md: `baja_a` lleva el tipo de registro del aparato (`tablet_taller`).
-- `sync.intervalo_segundos` y `sync.tanda_max_comandos` nacieron con `tablet` y no bajaban; la siembra nunca
-- cambia un parámetro que ya existe, así que se corrige aquí. En una base nueva no hay nada que corregir.
UPDATE parametros SET baja_a = ARRAY['tablet_taller']
WHERE clave IN ('sync.intervalo_segundos', 'sync.tanda_max_comandos') AND baja_a = ARRAY['tablet'];
