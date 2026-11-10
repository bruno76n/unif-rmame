---
paths:
  - "apps/api/src/modulos/*/tablas.ts"
  - "apps/api/migraciones/**"
---

# Reglas para la base de datos

> **Qué cubre:** cómo se escriben las tablas y las migraciones: nombres, tipos, columnas comunes, nada se borra, dueño de cada tabla y migraciones que no se editan.
> **Estado:** Decidido.
> **Se construye en:** [fase 2](../../docs/fases/02-base-de-datos-y-pruebas.md).
> **Se conecta con:** [base de datos](../../docs/cimientos/BASE-DE-DATOS.md)

1. **Cada tabla tiene un solo módulo dueño,** que es el único que la escribe; los demás la leen o le piden que actúe. Así cada regla del negocio vive en un solo lugar.
2. **Nombres en español, sin acentos ni ñ, en snake_case:** tablas en plural (`notas_entrega`), columnas en singular (`cantidad`), llaves foráneas `<entidad>_id`. Igual que en el esquema y el contrato.
3. **Llave `id uuid` versión 7.** Lo que nace en un aparato sin internet trae el `id` que hizo el aparato.
4. **Tipos fijos:** dinero en `bigint` de centavos con nombre terminado en `_centavos`; piezas en `integer`; metros y demás unidades en `numeric(12,3)` con su unidad; porcentajes en `numeric(6,3)`; momentos en `timestamptz` (terminan en `_en`); días de negocio en `date`, en hora de México; estados en `text` con CHECK. Así nunca se pierde un centavo ni una hora.
5. **Columnas comunes en toda tabla de negocio:** `creado_en`, `creado_por`, `actualizado_en` y `version`; `persona_id` y `dispositivo_id` en lo que llega de un aparato; y `xid_escritura` en las tablas que bajan a un aparato. El disparador las pone, nunca el código.
6. **Nada se borra:** no hay `DELETE` en tablas de negocio. Un documento se cancela, un catálogo se da de baja y un documento cerrado se corrige con otro ligado.
7. **Una migración aplicada nunca se edita:** un cambio es una migración nueva. Así todas las bases llegan al mismo lugar.
8. **Cada migración va con su prueba** contra un Postgres real, de la misma versión que producción.

**Quién lo vigila:** la revisión completa (migraciones aplicadas desde cero y pruebas de la base); la auditoría de fase, lo demás. Todo el detalle está en [BASE-DE-DATOS.md](../../docs/cimientos/BASE-DE-DATOS.md).
