# Respaldos

> **Qué cubre:** el respaldo semanal cifrado fuera de Render con su registro, el recordatorio de probar una restauración, y el registro de cada restauración probada con su evidencia.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [infraestructura](../../cimientos/INFRAESTRUCTURA.md) · [archivos](archivos.md) · [avisos](avisos.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [conteos](../inventario/conteos.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [seguridad](../../cimientos/SEGURIDAD.md)

## Para qué sirve

Un respaldo que nunca se restauró no es un respaldo. Hay dos defensas:

1. **La recuperación a un momento del pasado** que da Render (los últimos 7 días en el plan Pro). Es del proveedor: aquí solo se consulta su estado.
2. **El respaldo semanal propio,** cifrado y guardado en otro proveedor (Cloudflare R2), por si el problema es Render mismo.

Y cada tantos días alguien prueba que de verdad se puede restaurar, y lo registra con su evidencia. Si se pasa la fecha, la dueña recibe el aviso.

## Reglas

1. **El respaldo semanal lo hace el worker** cada `admin.dia_respaldo_semanal` (domingo) a `admin.hora_respaldo_semanal` (02:00, hora de México), antes del cuadre de la noche.
2. **Es la base completa,** con `pg_dump` en formato propio de Postgres, de la misma versión de la base.
3. **Va cifrado con una llave pública.** La llave privada no vive en el servidor de la API ni en el worker: la guarda Bruno fuera del sistema. Así, quien entre al servidor no puede leer los respaldos.
4. **Se guarda en un cubo de R2 solo para respaldos,** con su propia credencial que solo puede escribir. Se revisa que llegó completo con su SHA-256.
5. **No se escribe a disco:** el volcado se cifra y se sube mientras sale, para no depender del espacio del worker.
6. **Cada respaldo queda registrado,** correcto o fallido. Si falla, la dueña y soporte reciben `respaldo_fallido`.
7. **La prueba de restauración** se hace en un ambiente de pruebas, nunca sobre la base de producción, y se registra con su evidencia: los conteos de las tablas y el cuadre de inventario, que tienen que dar igual. El procedimiento está en [infraestructura](../../cimientos/INFRAESTRUCTURA.md).
8. **Una prueba que no cuadró se guarda,** pero no cuenta como última prueba buena: el respaldo sigue «Por probar».

## La tabla `respaldos`

Cada respaldo semanal. Solo crece; lo escribe el sistema.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `hecho_en` | timestamptz | no | «11 oct · 03:00» |
| `estado` | text | no | CHECK (`correcto`, `fallido`) |
| `tamano_bytes` | bigint | sí | «1.8 GB» |
| `cifrado` | boolean | no | |
| `destino` | text | no | Dónde quedó, sin ninguna llave |
| `sha256` | text | sí | |
| `error` | text | sí | Si falló |
| `creado_en` | timestamptz | no | default `now()` |

Sin `creado_por` ni `version`. **Índice:** (`hecho_en` desc).

## La tabla `restauraciones_probadas`

Cada prueba de restauración, con su evidencia.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `probada_en` | timestamptz | no | Cuándo se hizo la prueba. No puede ser futura |
| `tipo` | text | no | CHECK (`semanal_externo`, `punto_en_el_tiempo`) |
| `respaldo_id` | uuid | sí | → `respaldos.id`. Obligatorio en `semanal_externo` |
| `punto_restaurado_en` | timestamptz | sí | Obligatorio en `punto_en_el_tiempo` |
| `ambiente` | text | no | CHECK (`pruebas`). default `pruebas` |
| `conteos_cuadraron` | boolean | no | Los conteos de tablas y el cuadre de inventario dieron igual |
| `conteos` | jsonb | sí | Por tabla: renglones esperados y encontrados |
| `evidencia_archivo_id` | uuid | no | → `archivos.id`, con propósito `evidencia_restauracion` |
| `nota` | text | sí | Hasta 200 |

Lleva las columnas comunes; `creado_por` es obligatorio (la dueña). **Índice:** (`probada_en` desc).

## Acciones

### `admin.registrar_restauracion`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Respaldos · «Registrar restauración probada» → ventana con la evidencia |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `tipo` · `semanal_externo` o `punto_en_el_tiempo` · obligatorio<br>`respaldo_id` · uuid · obligatorio en `semanal_externo`<br>`punto_restaurado_en` · momento · obligatorio en `punto_en_el_tiempo`<br>`probada_en` · momento · obligatorio<br>`conteos_cuadraron` · booleano · obligatorio<br>`conteos` · lista de {`tabla`, `esperados`, `encontrados`} · opcional<br>`evidencia_archivo_id` · uuid · obligatorio<br>`nota` · texto · hasta 200 · opcional |
| **Reglas y errores** | `400`: «Sube la evidencia de la prueba.» · «Escoge el respaldo que restauraste.» · «La prueba no puede ser de una fecha futura.»<br>`422 respaldo_fallido`: «Ese respaldo falló: escoge uno correcto.» |
| **Escribe** | `restauraciones_probadas`, en el ambiente `pruebas` |
| **Llama** | `admin.ligar_archivo` (la evidencia) |
| **Regresa** | «Restauración registrada. La siguiente toca el {fecha}», con la fecha de `probada_en` más `admin.restauracion_cada_dias`. Si no cuadró: «La prueba no cuadró: el respaldo sigue por probar.» |
| **Eventos** | `restauracion.registrada`: quita el pendiente «Respaldo» |
| **Bitácora** | «Registró una restauración probada en el ambiente de pruebas», con `despues` (tipo, respaldo y si cuadró) |

### `admin.registrar_respaldo` · interna

| | |
|---|---|
| **La llama** | El trabajo del respaldo semanal |
| **Recibe** | `hecho_en` · `estado` · `tamano_bytes` · `cifrado` · `destino` (sin llaves) · `sha256` · `error` |
| **Escribe** | `respaldos` |
| **Eventos** | `respaldo.hecho`; si es `fallido`, el aviso `respaldo_fallido` |

## Trabajos

### Respaldo semanal

| | |
|---|---|
| **Cuándo** | `admin.dia_respaldo_semanal` a `admin.hora_respaldo_semanal`, hora de México |
| **Qué hace** | Vuelca la base completa, la cifra con la llave pública mientras sale, la sube al cubo de respaldos de R2 y revisa su SHA-256 |
| **Escribe** | `respaldos`, con `admin.registrar_respaldo` |
| **Avisa** | Si falla: `respaldo_fallido` a la dueña y a soporte |
| **Repetible** | Si ya hay uno `correcto` esa semana, no corre |

### Recordatorio de prueba de restauración

| | |
|---|---|
| **Cuándo** | Cada día a `admin.hora_recordatorio_respaldo`, hora de México |
| **Lee** | La última restauración que cuadró y el último respaldo |
| **Regla** | Días desde la última prueba buena ≥ `admin.restauracion_aviso_dias`; sin ninguna prueba, se cuenta desde el primer respaldo. Aparte: el último respaldo semanal falló, o no hay uno correcto en los últimos `admin.dias_respaldo_vencido` días |
| **Avisa** | `restauracion_por_probar` a la dueña, y otra vez cada `admin.dias_repetir_recordatorio` mientras no se registre. `respaldo_fallido` a la dueña y a soporte |
| **Repetible** | Busca el último aviso de ese tipo para no repetirlo antes de tiempo |

## Lo que muestra Administración

La pestaña Respaldos y su pendiente (las consultas están en [pantallas de Administración](../../interfaz/fabrica/administracion.md)):

- **La recuperación a un momento del pasado:** su estado sale de la API de Render si la da; si no, «Sin dato del proveedor», y se confirma a mano en cada prueba de restauración.
- **El último respaldo semanal,** con su estado y su tamaño.
- **La última prueba de restauración** y cuándo toca la siguiente. Desde `admin.restauracion_aviso_dias` sale «Por probar».

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.restauracion_cada_dias` | 92 días | Cada cuánto se prueba una restauración |
| `admin.restauracion_aviso_dias` | 81 días | Desde cuántos días sin probar sale «Por probar» y el aviso |
| `admin.dias_repetir_recordatorio` | 7 días | Cada cuánto se repite el aviso mientras no se registre la prueba |
| `admin.dias_respaldo_vencido` | 8 días | Sin un respaldo correcto en estos días, aviso |
| `admin.dia_respaldo_semanal` | domingo | El día del respaldo semanal |
| `admin.hora_respaldo_semanal` | 02:00 | La hora del respaldo semanal |
| `admin.hora_recordatorio_respaldo` | 09:00 | La hora del recordatorio |

Los dos primeros van en `parametro`; los demás, en `tecnico`.

## Permisos

- Ver Respaldos: las cuentas con Administración del sistema.
- Registrar una restauración probada: solo la dueña.

## Eventos

`respaldo.hecho` · `restauracion.registrada`.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 4.*
