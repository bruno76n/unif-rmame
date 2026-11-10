# Fase 02: Base de datos y pruebas

> **Etapa:** Cimientos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 1](01-repositorio-reglas-y-paquete-compartido.md) · [fase 3](03-api-protocolo-e-idempotencia.md)

## Objetivo

Las convenciones de la base quedan hechas código y probadas, y cualquier fase puede escribir pruebas contra un Postgres real con los simuladores de los servicios de fuera.

## Depende de

- [Fase 1](01-repositorio-reglas-y-paquete-compartido.md), terminada y en verde.

## Qué se construye

### Parte 1 · Postgres en local y la conexión

**Construye:** Postgres 18 en Docker para `pnpm local`; los dos roles de base (dueño y app); la conexión con `pg` y Drizzle en `apps/api/src/nucleo/base/`; el ayudante de transacciones que reintenta la transacción completa hasta tres veces ante `40P01` y `40001`; `idle_in_transaction_session_timeout`.

**Leer:**
- [base de datos](../cimientos/BASE-DE-DATOS.md) — los roles, los candados y por qué las transacciones son cortas.
- [arquitectura](../cimientos/ARQUITECTURA.md#cómo-corre-en-local) — cómo corre todo en local.

### Parte 2 · Las convenciones hechas código

**Construye:** la secuencia `version_global`; la función de la base que pone `version`, `actualizado_en` y, en las tablas que bajan, `xid_escritura`; los ayudantes de Drizzle para las columnas comunes, las de cancelación y las de baja; los permisos del rol de la app (sin `DELETE` en tablas de negocio, sin `UPDATE` en las que solo crecen); la marca `@llavePendiente` y su revisión.

**Leer:**
- [base de datos](../cimientos/BASE-DE-DATOS.md) — nombres y tipos, columnas comunes, nada se borra, llaves pendientes.
- [regla de base de datos](../../.claude/rules/base-de-datos.md) — lo que se cuida en cada tabla.

### Parte 3 · Migraciones, siembra y datos de la muestra

**Construye:** la configuración de drizzle-kit con las migraciones en `apps/api/migraciones/`; `pnpm base:generar`, `pnpm base:migrar` y `pnpm base:sembrar`; la siembra del sistema que corre después de migrar, agrega lo que falta y nunca cambia lo que existe; el lugar de los datos de la muestra en `apps/api/semillas/`. El paso de la revisión completa que aplica las migraciones desde cero y falla si cambió una que ya está en la rama principal.

**Leer:**
- [base de datos](../cimientos/BASE-DE-DATOS.md#migraciones) — migraciones, siembra del sistema y datos de la muestra.
- [estructura](../cimientos/ESTRUCTURA.md#comandos) — los comandos de la base y el orden de la revisión completa.

### Parte 4 · La base de las pruebas

**Construye:** los proyectos de Vitest (cálculos, base, API); Testcontainers con Postgres 18, la base plantilla y una base copia por archivo; cada prueba dentro de una transacción que se deshace; los simuladores de Google, Resend y R2 con MSW en `pruebas/simuladores/`, cada uno con su modo de fallar; fast-check; la configuración de Playwright para las fases 19 y 21.

**Leer:**
- [pruebas](../cimientos/PRUEBAS.md) — los niveles, la base real, los simuladores y lo que sale mal.
- [regla de pruebas](../../.claude/rules/pruebas.md) — cómo se escribe cada caso.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Todavía no hay tablas de negocio: las pruebas del disparador, de los permisos y de los candados usan tablas de prueba que solo existen en la base de las pruebas.
- Cada simulador sigue la interfaz oficial de su servicio; las lecturas van en las Fuentes del plan.
- No va en esta fase: ninguna tabla de un módulo ni ninguna ruta de la API.

## Excepciones permitidas

- Ninguna.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Toda escritura pone `version` desde la secuencia global y `actualizado_en`; en una tabla que baja, también `xid_escritura`; el código no puede ponerlos a mano | `nucleo/base/disparador.prueba.ts`, con una tabla de prueba |
| Con el rol de la app no se puede borrar en una tabla de negocio ni cambiar una que solo crece | `nucleo/base/roles.prueba.ts` |
| Dos transacciones que se cruzan por los mismos renglones en el orden fijo terminan las dos; una que choca por bloqueo se reintenta sola y a la cuarta responde el error | `nucleo/base/transacciones.prueba.ts`, con dos conexiones a la vez |
| Las migraciones aplican desde cero sobre una base vacía; la siembra corre dos veces y la segunda no cambia nada, ni siquiera un valor que se cambió a mano | `nucleo/base/migraciones.prueba.ts` |
| La revisión completa falla si cambió una migración que ya está en la rama principal, o si una marca `@llavePendiente` apunta a una tabla que ya existe | `scripts/migraciones.prueba.ts`, en un repositorio temporal |
| Cada archivo de pruebas tiene su propia base copia de la plantilla, y cada prueba deja la base como la encontró | `pruebas/base.prueba.ts` |
| Cada simulador responde como su servicio y, puesto a fallar, falla como su servicio | `pruebas/simuladores/*.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
