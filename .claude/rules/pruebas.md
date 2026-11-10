---
paths:
  - "**/*.prueba.ts"
  - "**/*.prueba.tsx"
  - "pruebas/**"
---

# Reglas para las pruebas

> **Qué cubre:** cómo se escribe cada prueba: qué demuestra, contra qué base corre y lo que nunca se hace para llegar al verde.
> **Estado:** Decidido.
> **Se construye en:** [fase 2](../../docs/fases/02-base-de-datos-y-pruebas.md).
> **Se conecta con:** [pruebas](../../docs/cimientos/PRUEBAS.md)

1. **Cada caso dice qué criterio demuestra,** con el nombre del criterio del archivo de la fase. Así la auditoría ve que cada criterio tiene su prueba.
2. **Primero en rojo.** La prueba se escribe antes del código y se ve fallar por la razón correcta.
3. **Postgres real,** de la misma versión que producción, con Testcontainers. Nada de bases de mentira para lo que toca la base.
4. **Los servicios externos con su simulador** (MSW sobre su interfaz oficial): Google, correo y almacenamiento. Nunca el servicio real en una prueba.
5. **Se prueba lo que sale mal, no solo lo que sale bien:** la misma acción dos veces y al mismo tiempo, respuestas perdidas, tandas cortadas, versiones viejas y cuentas sin permiso.
6. **Lo que cuadra se prueba con datos al azar** (fast-check) cuando hay dinero, inventario o sincronización: miles de casos y la misma regla al final.
7. **Nunca trampa:** no se salta, se debilita ni se borra una prueba, ni se baja un criterio para llegar al verde.
8. **Cada prueba es independiente** y deja la base como la encontró.

**Quién lo vigila:** la revisión completa (todas las pruebas); la auditoría de fase, lo demás. Todo el detalle está en [PRUEBAS.md](../../docs/cimientos/PRUEBAS.md).
