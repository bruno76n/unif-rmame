# Configuración

> **Qué cubre:** los parámetros del negocio con su historial (las decisiones de operación, los parámetros y los técnicos), las listas que solo crecen y los datos de la empresa que salen en las hojas.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [base de datos](../../cimientos/BASE-DE-DATOS.md) · [reglas de código](../../../.claude/rules/codigo.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [escuelas y secciones](../catalogo/escuelas-y-secciones.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [nómina](../contaduria/nomina.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [reservas](../inventario/reservas.md) · [asistencia](../personal/asistencia.md) · [materiales](../compras/materiales.md) · [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md) · [crédito de clientes](../contaduria/credito-de-clientes.md) · [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [notas de crédito](../ventas/notas-de-credito.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pedidos y sus versiones](../ventas/pedidos.md) · [cuentas por pagar](../contaduria/cuentas-por-pagar.md) · [gastos](../contaduria/gastos.md) · [pantallas de Mantenimiento](../../interfaz/fabrica/mantenimiento.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Ningún dato del negocio vive en el código: plazos, porcentajes, mínimos, días y opciones de operación son **parámetros** que la dueña cambia en Administración del sistema → Configuración, y cada cambio queda con su historial. Ejemplo: «Lote atorado» empieza en 2 días hábiles; si la dueña lo sube a 3, desde ese momento Producción y Dirección marcan atorado un lote a los 3 días, y la bitácora dice «Lote atorado: 3 días».

Aquí también viven las **listas sencillas** que el usuario agrega (categorías de gasto, unidades de material) y los **datos de la empresa** que salen en las hojas y en el ticket.

## Reglas

1. **Una clave por valor, con el prefijo del módulo que la lee:** `inventario.hora_cuadre`, `produccion.lote_atorado_dias`. Las reglas que usan todos llevan `general.`; las de la sincronización, `sync.`; las de los avisos, `avisos.`; las de la nómina, `nomina.`.
2. **Cada parámetro vive en el archivo de su tema,** con su valor inicial (la tabla «Parámetros» de cada archivo). Este archivo solo dice cómo funcionan.
3. **Cada módulo declara los suyos** en su `parametros.ts`: clave, sección, nombre y explicación de pantalla, tipo y unidad, valor inicial, mínimo y máximo, si acepta vacío, a qué aparatos baja y su orden. La siembra del sistema los crea si faltan y nunca cambia uno que ya existe.
4. **Solo la dueña los cambia.** Las demás cuentas con Administración del sistema los ven sin poder editar. Cada cambio escribe su historial y su renglón de bitácora en la misma transacción.
5. **Las casillas numéricas no aceptan vacío ni cero,** salvo los parámetros que dicen que aceptan vacío (como `personal.horas_dia_completo`).
6. **El valor que vale es el de ese momento.** Lo que llega tarde de un aparato se juzga con el valor que valía cuando pasó, que sale del historial.
7. **Un parámetro que decide qué baja a un aparato** (como `produccion.tarifa_visible_tablet`) pide la foto completa a esos aparatos al cambiar (ver [sincronización](../../cimientos/SINCRONIZACION.md)).

## Las tres secciones

| Sección | Qué lleva | En pantalla |
|---|---|---|
| `decision_operacion` | Las decisiones de operación de la dueña: costo y responsable de la hora de paro, día de pago de la nómina, si se pagan las piezas dañadas y qué pasa con un descuento mayor que lo ganado, si la tablet muestra la tarifa, si la etiqueta de la prenda lleva el precio, el primer vistazo de Dirección, el lote atorado y los mínimos de existencia | «Decisiones de operación» |
| `parametro` | Los plazos y umbrales del negocio, con su unidad | «Parámetros» |
| `tecnico` | Los que casi nunca se tocan: sincronización, intentos, enlaces, depuración | Grupo «Técnicos» al final de «Parámetros», cerrado al abrir |

Un parámetro **por decidir** sale con la etiqueta ámbar «Por decidir» hasta que la dueña lo cambia por primera vez.

## La tabla `parametros`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `clave` | text | no | Estable; la usa el código |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`, para un valor por ubicación. Nulo = de todo el sistema |
| `seccion` | text | no | CHECK (`decision_operacion`, `parametro`, `tecnico`) |
| `nombre` | text | no | Como sale en pantalla |
| `explicacion` | text | sí | La línea de explicación |
| `tipo_valor` | text | no | CHECK (`entero`, `centavos`, `porcentaje`, `opcion`, `booleano`, `texto`, `hora`) |
| `unidad` | text | sí | `h`, `min`, `s`, `días`, `días hábiles`, `%`, `MB` |
| `valor_entero` | bigint | sí | Para `entero` y `centavos` |
| `valor_porcentaje` | numeric(6,3) | sí | Para `porcentaje` |
| `valor_texto` | text | sí | Para `opcion` (uno de `opciones`), `texto` (versiones mínimas) y `hora` («HH:MM») |
| `valor_booleano` | boolean | sí | Para `booleano` |
| `opciones` | text[] | sí | Los valores permitidos de una `opcion` |
| `minimo` · `maximo` | bigint | sí | Validación de las casillas numéricas |
| `permite_vacio` | boolean | no | default false |
| `estado_decision` | text | no | CHECK (`decidido`, `por_decidir`) |
| `modulo_lector` | text | no | El módulo que lo usa |
| `baja_a` | text[] | no | default `'{}'`. Los tipos de aparato que lo reciben al sincronizar (`tablet_taller`; `computadora_tienda` con el POS) |
| `orden` | integer | no | Orden en la pantalla |

- **CHECK:** según `tipo_valor` va lleno su valor y los otros en nulo; vacío solo si `permite_vacio`.
- **Único:** (`clave`, `ubicacion_id`) con `NULLS NOT DISTINCT`.
- Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). `creado_por` es nulo en la siembra.
- `ubicaciones` se construye en esta misma fase (ver [libro de movimientos](../inventario/libro-de-movimientos.md#la-tabla-ubicaciones)); los parámetros por ubicación llegan con sus módulos.

## La tabla `parametros_historial`

Cada valor que tuvo un parámetro y desde cuándo. Solo crece.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `parametro_id` | uuid | no | → `parametros.id` |
| `valor_anterior` | text | sí | En texto canónico. Nulo en el de la siembra |
| `valor_nuevo` | text | no | En texto canónico |
| `creado_en` | timestamptz | no | default `now()`. Vale desde aquí |
| `creado_por` | uuid | sí | → `usuarios.id` (la dueña). Nulo en la siembra |

Índice: (`parametro_id`, `creado_en` desc).

## Las listas

Listas sencillas que el usuario agrega, con solo un nombre. Cada valor nuevo queda al final; **no se renombran ni se quitan**.

### La tabla `listas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `clave` | text | no | Única: `categorias_gasto` |
| `nombre` | text | no | «Categorías de gasto» |
| `modulo` | text | no | El módulo que usa sus valores |
| `solo_duena_agrega` | boolean | no | default true |
| `baja_a` | text[] | no | default `'{}'`. Qué listas bajan a la caja (con el POS) |

Lleva las columnas comunes.

### La tabla `lista_valores`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `lista_id` | uuid | no | → `listas.id` |
| `nombre` | text | no | 3 letras o más; en las unidades de material, 1 o más («m», «kg») |
| `nombre_normalizado` | text | no | En minúsculas y sin acentos. Único por lista |
| `clave` | text | sí | Para los valores que reconoce el código (`reparacion_maquinas`). Única por lista. En las unidades de material va siempre: es lo que guarda el material |
| `seleccionable` | boolean | no | default true. Falso en lo que solo pone el sistema |
| `se_cuenta_entera` | boolean | sí | Solo en las unidades de material: si esa unidad se cuenta entera al comprar y al contar |
| `orden` | integer | no | Lo nuevo queda al final |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | Sin pantalla en la primera versión |

Lleva las columnas comunes; `creado_por` es nulo en la siembra.

### Las listas que hay

Cada lista la siembra el archivo de su tema:

| Lista | Clave | Su archivo |
|---|---|---|
| Categorías de gasto | `categorias_gasto` | [gastos](../contaduria/gastos.md) |
| Tipos de comprobante de gasto | `tipos_comprobante_gasto` | [gastos](../contaduria/gastos.md) |
| Cuentas de la fábrica | `cuentas_fabrica` | [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) |
| Unidades de material | `unidades_material` | [materiales](../compras/materiales.md) |
| Motivos de ajuste | `motivos_ajuste` | [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md) |
| Áreas del taller | `areas_taller` | [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) |

Las «Secciones del catálogo» de la misma pantalla no son una lista de aquí: son de Catálogo, y su «Agregar» llama a `catalogo.agregar_seccion` (ver [escuelas y secciones](../catalogo/escuelas-y-secciones.md)).

## La tabla `empresa`

Los datos de la empresa. Un solo renglón.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `unica` | boolean | no | default true. CHECK (`unica`) y único: no puede haber dos renglones |
| `razon_social` | text | no | |
| `nombre_comercial` | text | no | La marca de la pantalla de acceso |
| `rfc` | text | no | 12 caracteres, sin espacios (persona moral) |
| `domicilio` | text | no | La dirección fiscal en un solo texto |

Lleva las columnas comunes. Se captura en la puesta en marcha; en local trae los datos de la muestra. Las impresoras de etiquetas están en [impresión](impresion.md).

## Acciones

### `admin.cambiar_parametro`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Configuración · «Decisiones de operación» y «Parámetros». Se guarda al salir de la casilla o al escoger la opción |
| **Quién** | Administración del sistema · `solo_duena` («Solo la dueña puede cambiarlas») |
| **Recibe** | `clave` · texto · obligatorio<br>`ubicacion_id` · uuid · opcional, si el valor es por ubicación<br>`valor` · según su tipo: entero; centavos (la pantalla escribe pesos); porcentaje; una de sus opciones; booleano; texto; hora «HH:MM» · obligatorio salvo que acepte vacío<br>`version` · entero · obligatorio |
| **Reglas y errores** | `404 no_existe`: no hay parámetro con esa clave y ubicación<br>`400` en `valor`: vacío o cero en una casilla numérica, «Escribe un número mayor que cero» (la casilla regresa al valor anterior) · fuera de su rango, «Escribe un número de {mínimo} a {máximo}» · una opción que no está, «Escoge una de las opciones.»<br>El mismo valor que ya tenía: responde bien sin escribir nada |
| **Escribe** | `parametros`: el valor y `estado_decision = decidido`. `parametros_historial`: el anterior, el nuevo y quién |
| **Llama** | Si el parámetro decide qué baja a un aparato: pide la foto a esos aparatos (ver [sincronización](../../cimientos/SINCRONIZACION.md)) · con `nomina.dia_pago`: `contaduria.mover_fecha_pago_nomina` (fase 17) |
| **Regresa** | En Parámetros: «Parámetro guardado». En Decisiones de operación: el mismo texto de la bitácora |
| **Eventos** | `parametro.cambiado` (clave y `baja_a`): «hay cambios» en `parametros` para los aparatos de `baja_a` y para las pantallas |
| **Bitácora** | En Parámetros: «Cambió el parámetro «{nombre}»: {antes} → {nuevo}». En Decisiones de operación: «{nombre}: {valor}» («Costo de la hora de paro: $450», «Día de pago de la nómina: Martes», «Lote atorado: 3 días»). `antes` y `despues`: el valor |

### `admin.agregar_a_lista`

| | |
|---|---|
| **Pantalla** | Configuración · Listas · «Agregar» → ventana «Categoría de gasto nueva» (u otra lista) · «Agregar» |
| **Quién** | Administración del sistema · `solo_duena` si la lista dice `solo_duena_agrega` («Solo la dueña puede agregar») |
| **Recibe** | `lista` · texto · obligatorio · la clave de la lista<br>`nombre` · texto · obligatorio · de 3 a 40 (de 1 a 20 en «Unidades de material»)<br>`se_cuenta_entera` · booleano · obligatorio solo en «Unidades de material» |
| **Reglas y errores** | `400` en `nombre`: «Escribe el nombre.»<br>`422 ya_esta`: el mismo nombre sin mayúsculas ni acentos, «Ya está en la lista.» |
| **Escribe** | `lista_valores`, al final del orden, seleccionable. En «Unidades de material», con `se_cuenta_entera` y su clave: el nombre en minúsculas y sin acentos |
| **Regresa** | «{nombre}» agregada a {lista} |
| **Eventos** | `lista.valor_agregado`: «hay cambios» en `lista_valores` |
| **Bitácora** | «Agregó «{nombre}» a {lista}» |

### `admin.editar_empresa`

| | |
|---|---|
| **Pantalla** | Configuración · «Empresa» · «Editar» |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `razon_social` · texto · de 3 a 120<br>`nombre_comercial` · texto · de 2 a 60<br>`rfc` · texto · 12 caracteres; se guarda en mayúsculas y sin espacios<br>`domicilio` · texto · de 10 a 200<br>`version` · entero. Todos obligatorios |
| **Reglas y errores** | `400`: «Escribe la razón social.» · «El RFC de una empresa lleva 12 caracteres.» · «Escribe el domicilio fiscal.» |
| **Escribe** | `empresa` |
| **Regresa** | «Datos de la empresa guardados» |
| **Eventos** | `empresa.cambiada`: «hay cambios» en `empresa` |
| **Bitácora** | «Cambió los datos de la empresa», con `antes` y `despues` |

### `admin.cambiar_minimo`

Se construye en la [fase 14](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md), con [mínimos y reabasto](../inventario/minimos-y-reabasto.md): los mínimos son de Inventario.

| | |
|---|---|
| **Pantalla** | Configuración · «Decisiones de operación» · «Mínimo de existencia en {ubicación}»: casillas «Tallas de mayor venta» y «Demás tallas». Se guarda al salir de la casilla |
| **Quién** | Administración del sistema · `solo_duena` («Solo la dueña puede cambiarlas») |
| **Recibe** | `ubicacion_id` · uuid · obligatorio<br>`nivel` · `mayor_venta` o `demas` · obligatorio<br>`piezas` · entero · obligatorio<br>`version` · entero · obligatorio: la del mínimo vigente |
| **Reglas y errores** | `400` en `piezas`: vacío o cero, «Escribe un número mayor que cero» (la casilla regresa al valor anterior)<br>Las de `inventario.guardar_minimo`. El mismo valor que ya tenía: responde bien sin escribir nada |
| **Escribe** | Nada propio |
| **Llama** | `inventario.guardar_minimo` |
| **Regresa** | El mínimo nuevo, con su versión. «Mínimo en {ubicación} ({tipo de talla}): {n}» |
| **Eventos** | `minimo.cambiado`, de Inventario |
| **Bitácora** | «Mínimo en {ubicación} ({tipo de talla}): {n}», del departamento Administración del sistema y del módulo `inventario`, con `antes` y `despues` |

## Lecturas

### `admin.parametro`

| | |
|---|---|
| **La usan** | Todos los módulos |
| **Recibe** | `clave` · `ubicacion_id` (opcional) · `en` (opcional: un momento) |
| **Regresa** | El valor vigente, ya con su tipo. Con `en`, el que valía en ese momento, del historial |

Dentro de una acción, cada clave se lee una sola vez y se recuerda hasta que la acción termina.

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `general.largo_minimo_motivo` | 5 letras | El largo mínimo de todo motivo que se escribe (cancelar, dar de baja, ajustar, rechazar) |
| `general.dias_de_trabajo` | lunes a sábado | Los días de trabajo de la fábrica: los días hábiles de Producción (lote atorado, riesgo de atraso), las horas de paro de Mantenimiento y los días de la asistencia que se exigen para cerrar la semana |

## Permisos

- Ver Configuración: cualquier cuenta con Administración del sistema.
- Cambiar parámetros y mínimos, agregar a las listas y editar la empresa: solo la dueña.

## Eventos

`parametro.cambiado` · `lista.valor_agregado` · `empresa.cambiada`.

## Lo que llega después

- **Fase 14:** `admin.cambiar_minimo` (arriba), con [mínimos y reabasto](../inventario/minimos-y-reabasto.md); la pantalla lee los mínimos con `inventario.minimos_vigentes`.
- **Fase 17:** cambiar el día de pago de la nómina (`nomina.dia_pago`) llama a `contaduria.mover_fecha_pago_nomina`, con [nómina](../contaduria/nomina.md), y su bitácora lleva un renglón por cada nómina por pagar que cambia de fecha.
- **Las listas y la empresa bajan a la caja** cuando llegue el POS (con su `xid_escritura` y su `baja_a`).

## Cómo está hecho

**Fase 4, parte 2.**

- **Las tablas** están en `apps/api/src/modulos/admin/tablas.ts` (migración `0004_configuracion.sql`): `parametros`, `parametros_historial`, `listas`, `lista_valores` y `empresa`.
  - Cada una lleva su disparador común; `parametros` va con `xid_escritura`.
  - El historial solo crece.
  - El CHECK de `parametros` exige la columna de su tipo y las demás en nulo.
  - La empresa no admite un segundo renglón: un índice único sobre `unica` y el CHECK `unica`.
- **Los parámetros por dentro** (`apps/api/src/nucleo/parametros.ts`):
  - **La definición.** Cada módulo declara los suyos con `semillaDeParametros(modulo, definiciones)`; `DefinicionDeParametro` lleva la clave, la sección, el nombre, el tipo, la unidad, el inicial, los límites, si acepta vacío, las opciones, a qué baja, si va por decidir y el orden.
  - **La siembra.** Crea solo los que faltan y su primer historial, sin valor anterior (decisión 354).
  - **La lectura.** `leerParametro` da el valor con su tipo o, con `en`, el último del historial hasta ese momento.
  - **La versión mínima.** `versionMinimaDeLosParametros` da la de cada app para el paso 2 de cada llamada.
- **Los de `admin`** están en `modulos/admin/parametros.ts`: `general.largo_minimo_motivo`, `general.dias_de_trabajo` (texto con los días ISO separados por coma: `1,2,3,4,5,6`; decisión 350), las tres versiones mínimas y `admin.dias_guardar_eventos`.
- **`admin.cambiar_parametro`** está en `acciones/cambiar-parametro.ts`.
  - Revisa el valor contra su tipo y sus límites y responde `400` en `valor` con el mensaje de la casilla (`errorDeCampo`).
  - El mismo valor que ya tenía solo revisa la versión (`revisarVersion`) y no escribe nada (decisión 351).
  - Si cambia, toma la versión, guarda el valor con `decidido`, escribe el historial con quién, la bitácora y `parametro.cambiado`.
  - Si el parámetro decide qué baja a un aparato (una tabla de la bajada lo nombra en sus `parametros`), pide la foto a esos aparatos con `pedirLaFoto`: su `foto_pedida_en` cambia y su siguiente bajada responde `requiere_foto` (fase 6, ver [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho)). La nómina llega en la 17.
- **`admin.parametro`** (`lecturas/parametro.ts`) recuerda cada clave hasta que la acción termina.
- **`admin.agregar_a_lista`** (`acciones/agregar-a-lista.ts`):
  - compara con `sin_acentos` y responde `ya_esta` con `INSERT … ON CONFLICT DO NOTHING`;
  - revisa el largo y `se_cuenta_entera`;
  - revisa `solo_duena_agrega` dentro de la acción, porque depende de la lista (decisión 353).
- **`admin.editar_empresa`** está en `acciones/editar-empresa.ts`.
- **Los contratos** de las tres acciones están en `packages/compartido/src/contratos/admin/configuracion.ts`.
- **Las pruebas:**
  - `acciones/cambiar-parametro.prueba.ts`;
  - `lecturas/parametro.prueba.ts` (con `en`, una sola lectura por acción, la siembra que no pisa y la versión mínima);
  - `acciones/agregar-a-lista.prueba.ts`;
  - `acciones/editar-empresa.prueba.ts`.
- **La siembra de prueba** (parámetros de cada tipo, tres listas y la empresa) está en `nucleo/pruebas/modulos/prueba/siembra.ts`.
