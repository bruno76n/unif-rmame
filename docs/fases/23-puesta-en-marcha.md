# Fase 23: Puesta en marcha ●

> **Etapa:** Lanzamiento.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 22](22-seguridad-completa.md) · [infraestructura](../cimientos/INFRAESTRUCTURA.md) · [migración](../MIGRACION.md)

## Objetivo

El sistema sale a internet y la fábrica arranca con él: Render, el dominio, Google, R2 y Resend de verdad; la migración de los datos de hoy; el primer respaldo y su restauración probada; y el día del arranque, con todo el mundo trabajando en Unifórmame. Todo lo que cuesta o toca algo de verdad se hace con la autorización de Bruno.

## Depende de

- [Fase 22](22-seguridad-completa.md), terminada y en verde: el sistema completo, probado de punta a punta y revisado en seguridad.

## Qué se construye

### Parte 1 · La imagen y el Blueprint

**Construye:** el `Dockerfile` de la API y el worker (Node 26.13.0, `postgresql-client` 18 y age); `render.yaml` con la API, el worker, la base, la web y la tablet, cada uno con su plan, su comando, su revisión de salud, el comando previo de las migraciones, los encabezados de los sitios estáticos y sus variables sin valor; y `.env.ejemplo` al día con todas las variables.

**Leer:**
- [infraestructura](../cimientos/INFRAESTRUCTURA.md) — todo.
- [seguridad](../cimientos/SEGURIDAD.md#los-encabezados-de-seguridad) — los encabezados de los sitios estáticos.
- [base de datos](../cimientos/BASE-DE-DATOS.md#migraciones) — las migraciones antes de arrancar la API nueva.

### Parte 2 · La migración

**Construye:** `pnpm migracion:cargar` con su revisión previa de todos los archivos, sus dos tiempos, el ensayo, el actor «Migración», el reporte y la siembra de la puesta en marcha; las cargas de arranque `admin.cargar_arranque` y `catalogo.cargar_arranque`; y los archivos de ejemplo sacados de los datos de la muestra.

**Leer:**
- [migración](../MIGRACION.md) — todo.
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) y [folios](../modulos/admin/folios.md) — los códigos de hoy y los contadores.
- [conteos](../modulos/inventario/conteos.md) — la carga inicial de prendas y de material.
- [cuentas](../modulos/admin/cuentas.md#las-primeras-cuentas) — las dos primeras cuentas.

### Parte 3 · Los servicios de verdad

**Construye,** con Bruno: el espacio de Render con el Blueprint; el dominio en Cloudflare con sus registros; los dos cubos de R2 con sus credenciales y sus reglas; el dominio de Resend verificado; el cliente de Google; los secretos en Render; y la verificación real de las fases 4, 5 y 20 que estaba pendiente.

**Leer:**
- [infraestructura](../cimientos/INFRAESTRUCTURA.md) — cada servicio, sus variables y su costo.
- [registros](../registros/REGISTROS.md#verificación-real-pendiente) — lo que falta comprobar de verdad y cómo.
- [puente de impresión](../apps/puente-de-impresion.md#la-instalación) y [la tablet](../apps/tablet.md#el-registro) — instalar el puente en las dos computadoras y registrar la tablet.

### Parte 4 · La recuperación probada

**Construye,** con Bruno: el primer respaldo semanal corrido a mano; su restauración fuera de Render con la llave privada; regresar la base a un momento del pasado en una instancia nueva; las dos pruebas registradas con su evidencia (`admin.registrar_restauracion`); y las instancias de prueba quitadas.

**Leer:**
- [respaldos](../modulos/admin/respaldos.md) — el respaldo, la restauración y su registro.
- [infraestructura](../cimientos/INFRAESTRUCTURA.md#la-restauración-probada) — los pasos.

### Parte 5 · El arranque

**Construye,** con Bruno y la dueña, en este orden: el ensayo final de la migración con los archivos de verdad; la carga de la base; la preparación (cuentas, aparatos, impresoras, recetas, flujos, tarifas, PIN y mínimos); el conteo y la carga del arranque; el respaldo del día; y el primer día de trabajo, acompañado.

**Leer:**
- [migración](../MIGRACION.md#los-tres-tiempos) — los tres tiempos y el día del arranque.
- [migración](../MIGRACION.md#las-tiendas-sin-caja) — cómo trabajan las tiendas mientras no tienen su caja.

## Cómo se construye

- **Un solo agente, una parte a la vez,** y las partes 3 a 5 con Bruno presente: nada se contrata, se paga ni se toca de verdad sin su autorización, y con tope de gasto.
- **Ningún secreto pasa por el chat ni por git:** Bruno los pone en Render y en su computadora; Claude Code solo dice cuáles faltan.
- **Los archivos de la migración** viven en la computadora de Bruno; nunca entran al repositorio.
- **Si algo de verdad no sale como en local,** se anota en `REGISTROS.md` y se resuelve con el bucle de resolución antes de seguir; el arranque no empieza con algo pendiente.

## Excepciones permitidas

- Esta fase toca servicios de verdad y la base de producción, solo con la autorización de Bruno.
- Las cargas de arranque escriben lo que una acción normal no permite (un código de hoy, un contador de folio), solo dentro del comando de la migración y solo sobre una base sin operación.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| La imagen trae lo que necesitan la API y el worker, y el worker hace un respaldo con `pg_dump` y age que se vuelve a restaurar | `pruebas/puesta-en-marcha/imagen.prueba.ts` |
| El Blueprint declara cada servicio con su plan, su comando, su salud y sus variables, como dice [infraestructura](../cimientos/INFRAESTRUCTURA.md) | `pruebas/puesta-en-marcha/blueprint.prueba.ts` |
| La migración de los archivos de ejemplo en una base vacía deja lo mismo que los datos de la muestra; un archivo con un error no carga nada de su tiempo; una base con operación no se deja cargar; el ensayo no escribe nada | `scripts/migracion/migracion.prueba.ts` |
| Los códigos de hoy se conservan, uno repetido o fuera de su rango detiene la carga, y el contador queda en el mayor de fábrica más uno | `modulos/catalogo/internas/cargar-arranque.prueba.ts` |
| Los contadores de folio siguen la numeración de hoy y nunca bajan | `modulos/admin/internas/cargar-arranque.prueba.ts` |
| La verificación real de las fases 4, 5, 20 y 23 está hecha | `REGISTROS.md`, con «Hecha» en cada renglón |
| Hay una restauración probada de cada defensa, con su evidencia, y las dos cuadraron | Administración del sistema · Respaldos |
| El día del arranque, el cuadre de la noche no deja residuo y las existencias son las contadas | El reporte de la migración y el cuadre de esa noche |

## Revisión de fase

Delicada ●: cuatro [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **secretos** (el Blueprint, las variables, la imagen y que ningún archivo de la migración ni secreto llegó al repositorio);
- **inventario** (que la carga del arranque cuadra con los conteos y el cuadre no deja residuo);
- **dinero** (los anticipos, las deudas y los descuentos que entraron, y que ningún saldo de hoy se metió sin su documento);
- **permisos y datos personales** (las primeras cuentas, el actor «Migración» que solo existe en su comando, y la base sin acceso desde internet).
