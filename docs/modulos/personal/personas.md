# Personas

> **Qué cubre:** quién trabaja en la fábrica o en las tiendas, tenga o no cuenta (folio E-): darla de alta, editar su ficha, darla de baja y reactivarla; su área, su forma de pago y lo que baja a los aparatos.
> **Estado:** Decidido.
> **Se construye en:** [fase 7 ●](../../fases/07-autorizaciones-y-personal.md).
> **Se conecta con:** [cuentas](../admin/cuentas.md) · [PIN del taller](pin-del-taller.md) · [asistencia](asistencia.md) · [tarifas](tarifas.md) · [folios](../admin/folios.md) · [nómina](../contaduria/nomina.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [registros de operación](../produccion/registros-de-operacion.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [pantallas de Administración del sistema](../../interfaz/fabrica/administracion.md) · [la tablet del taller](../../apps/tablet.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Una persona no necesita cuenta para existir en el sistema: su producción y su pago le corresponden igual. Personal la da de alta con su área, su puesto y su forma de pago; si es del Taller, le asigna su PIN; si necesita entrar al sistema de la fábrica, la dueña le da una cuenta de Google. Ejemplo: Personal da de alta a Lupita Ramos, costurera del Taller, que cobra por pieza; queda con su folio E- y el aviso «Lupita Ramos dada de alta. Falta asignarle PIN del taller».

## Reglas

1. **Persona no es cuenta:** la cuenta de Google se liga a la persona por su folio, nunca por el nombre (ver [cuentas](../admin/cuentas.md)).
2. **Nada se borra:** dar de baja conserva su producción, sus pagos y su historia; también se puede editar a una persona dada de baja.
3. **El pago por día es sueldo:** solo lo ve y lo cambia quien tiene «ven sueldos y tarifas». Sin el permiso, el campo no viaja y se conserva.
4. **El área decide su entrada:** el Taller entra con PIN en la tablet; la oficina, Aduana y Bodega, con cuenta de Google; la tienda, en la caja de su tienda. Nadie de tienda entra al sistema de la fábrica.
5. **Una persona de tienda** tiene su tienda y su rol (cajera o encargada). Así Tienda 1 y Tienda 2 no van escritas en el código.
6. **Dar de baja quita todo lo que la deja entrar,** en la misma transacción: anula su PIN y cierra su cuenta de Google (o cancela la solicitud de cuenta).
7. **Salir del Taller anula el PIN;** pasar a tienda a alguien con cuenta no se deja: primero se le quita el acceso.
8. **La persona de la dueña no se da de baja.**

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| — | activa | «Dar de alta». Toma el siguiente E-, sin PIN | Personal |
| activa | dada de baja | «Dar de baja» con motivo | Personal |
| dada de baja | activa | «Reactivar». No le regresa PIN ni cuenta | Personal |

## La tabla `personas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | E-, único y consecutivo |
| `nombre` | text | no | De 5 a 40 («Nombre y apellido») |
| `area` | text | no | CHECK (`taller`, `oficina`, `aduana_bodega`, `tienda`) |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`. Obligatoria en `tienda` (cuál tienda); vacía en las demás (CHECK) |
| `rol_tienda` | text | sí | CHECK (`cajera`, `encargada`). Obligatorio en `tienda`; vacío en las demás (CHECK) |
| `puesto` | text | no | De 3 a 30, libre |
| `forma_pago` | text | no | CHECK (`tiempo`, `pieza`, `mixta`) |
| `pago_dia_centavos` | bigint | sí | «Por día» o «Base por día». Obligatorio y mayor que 0 si no es `pieza`; vacío si es `pieza` (CHECK). Hasta $99,999 |
| `fecha_ingreso` | date | no | No futura |
| `baja_en` · `baja_por` | timestamptz · uuid | sí | |
| `motivo_baja` | text | sí | De 5 a 80. Obligatorio con `baja_en` (CHECK) |
| `reactivado_en` · `reactivado_por` | timestamptz · uuid | sí | |

- Lleva las columnas comunes y, como baja a la tablet, `xid_escritura`.
- **Índices:** único (`folio`); (`area`, `ubicacion_id`) donde `baja_en` es nulo.

## Acciones

### `personal.dar_alta_persona`

| | |
|---|---|
| **Pantalla** | Personal · «Nueva persona» → cajón «Nueva persona» · «Dar de alta» |
| **Quién** | Personal. Mandar el pago por día pide además «ven sueldos y tarifas» |
| **Recibe** | `nombre` · texto · de 5 a 40<br>`area` · obligatorio (la pantalla empieza en Taller)<br>`ubicacion_id` · uuid · obligatorio en tienda: una ubicación de tienda<br>`rol_tienda` · obligatorio en tienda<br>`puesto` · texto · de 3 a 30<br>`forma_pago` · obligatorio (la pantalla empieza en Por pieza)<br>`pago_dia_centavos` · obligatorio si no es por pieza · mayor que 0, hasta $99,999<br>`fecha_ingreso` · fecha · no futura (la pantalla pone hoy) |
| **Reglas y errores** | `400`: «Nombre y apellido» · «Escribe el puesto» · «Pesos por día» · «Escoge la tienda.» · «Escoge si es cajera o encargada.» · «La fecha de ingreso no puede ser después de hoy.»<br>`403 sin_permiso_fino`: manda pago por día sin el permiso, «Esta cuenta no puede poner sueldos. Lo decide la dueña en Administración del sistema.» |
| **Escribe** | La persona activa, con el siguiente E- y sin PIN |
| **Llama** | `admin.tomar_folio` (E-) |
| **Regresa** | `persona_id` y su folio. «{persona} dada de alta», más «. Falta asignarle PIN del taller» si es del Taller |
| **Eventos** | `persona.alta` |
| **Bitácora** | «Dio de alta a {persona}», con la ficha; con pago por día, marcada como sueldo |

### `personal.editar_persona`

| | |
|---|---|
| **Pantalla** | Personal · Personas · renglón → cajón de la persona · «Guardar». También una persona dada de baja |
| **Quién** | Personal. El pago por día, solo con «ven sueldos y tarifas»: sin el permiso no viaja y se conserva |
| **Recibe** | `persona_id`, `version` y todos los campos del alta (los que no cambian van igual) |
| **Reglas y errores** | Las del alta<br>`422 tiene_cuenta`: pasar a tienda a alguien con cuenta, «{persona} entra con Google y nadie de tienda entra al sistema de fábrica. Quítale el acceso antes de pasarla a una tienda.»<br>`403 sin_permiso_fino`: cambiar a tiempo o mixta sin el permiso (pide pago por día)<br>`409` |
| **Escribe** | La persona |
| **Llama** | Si sale del Taller con PIN vivo: `personal.anular_pin` (`cambio_area`) |
| **Regresa** | «{persona} actualizada», más «. Su PIN ya no entra» si se anuló |
| **Eventos** | `persona.editada`; si tiene PIN, «hay cambios» para la tablet |
| **Bitácora** | «Editó la ficha de {persona}», más « (forma de pago o tarifa)» si cambió la forma de pago o el pago por día; con lo que cambió, marcado como sueldo si toca el pago |

### `personal.dar_baja_persona`

| | |
|---|---|
| **Pantalla** | Cajón de la persona · «Dar de baja» → ventana «Dar de baja a {persona}» · «Dar de baja» |
| **Quién** | Personal |
| **Recibe** | `persona_id` · `motivo` (de 5 a 80) · `version`. Todos obligatorios |
| **Reglas y errores** | `400`: «Escribe el motivo»<br>`422 ya_dada_de_baja`: «{persona} ya está dada de baja.»<br>`422 es_la_duena`: «La dueña no se da de baja.» |
| **Escribe** | La baja, con quién y su motivo. Lo que pase con su semana abierta lo calcula la nómina con la fecha de baja |
| **Llama** | `personal.anular_pin` (`baja_persona`) si tenía PIN vivo; `admin.cerrar_cuenta_de_persona` |
| **Regresa** | «{persona} dada de baja», más «. Su PIN ya no entra» y «. Su cuenta de Google ya no entra» si aplica |
| **Eventos** | `persona.baja`: «hay cambios» en `personas` y `pines` para la tablet |
| **Bitácora** | Un renglón: «Dio de baja a {persona}: {motivo}», con el PIN anulado y la cuenta cerrada |

### `personal.reactivar_persona`

| | |
|---|---|
| **Pantalla** | Cajón de una persona dada de baja · «Reactivar» |
| **Quién** | Personal |
| **Recibe** | `persona_id` · `version` · `fecha_ingreso` (opcional, si vuelve con otra fecha) |
| **Reglas y errores** | `422 no_esta_de_baja`: «{persona} ya está activa.» |
| **Escribe** | Limpia la baja y pone quién y cuándo la reactivó. No le regresa PIN ni cuenta |
| **Regresa** | «{persona} reactivada», más «. Falta asignarle PIN del taller» si es del Taller |
| **Eventos** | `persona.reactivada` |
| **Bitácora** | «Reactivó a {persona}», con la baja que tenía |

## Lecturas

### `personal.entra_al_sistema`

| | |
|---|---|
| **La usan** | Personal y Usuarios y accesos |
| **Regresa** | Por persona: «Cuenta de Google · {rol}», «Sistema de su tienda», «PIN del taller», «Sin PIN» o «Baja {fecha}» |

### `personal.fichas_para_nomina(personas)`

Se construye en la [fase 17](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md), con la nómina.

| | |
|---|---|
| **La usa** | Contaduría: la nómina y el descuento semanal (ver [nómina](../contaduria/nomina.md)) |
| **Regresa** | Por persona: nombre, área y tienda, puesto, forma de pago, pago por día, ingreso y baja. Lleva sueldos: nunca va a una pantalla sin «ven sueldos y tarifas» |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas | Se quita cuando |
|---|---|---|---|
| `personas` | Del Taller con un PIN de la ubicación Taller (activo o bloqueado, y los que acaban de anularse) | `id`, `nombre` y sus iniciales (las calcula el servidor) | Ya no tiene PIN vivo y su anulación ya bajó |

Nunca bajan el pago por día, el puesto, correos ni nada de las cuentas. Asignar, anular o restablecer un PIN toca el renglón de la persona para que baje o se quite (ver [sincronización](../../cimientos/SINCRONIZACION.md#filtros-que-cambian-sin-tocar-el-renglón)).

## Permisos

- Dar de alta, editar, dar de baja y reactivar: Personal.
- Ver y cambiar el pago por día: con «ven sueldos y tarifas». Abrir la ficha de una persona es consulta sensible y queda en la bitácora.

## Eventos

`persona.alta` · `persona.editada` · `persona.baja` · `persona.reactivada`.

## Lo que llega después

- **Fase 17:** la lectura `personal.fichas_para_nomina`, con la [nómina](../contaduria/nomina.md).
- **Con el POS:** las personas de tienda bajan a la caja de su tienda (activas, con su rol), y la asistencia de tienda sale de sus turnos.

## Cómo está hecho

**Fase 7, partes 2 a 5.**

- **La tabla** `personas` es del módulo `personal` (`apps/api/src/modulos/personal/tablas.ts`, migración `0016_personas.sql`), con sus CHECK (el área, la tienda y su rol solo en tienda, la forma de pago con su pago por día, el nombre, el puesto y la baja con su motivo), `xid_escritura` y el disparador. La misma migración convierte en llaves las `@llavePendiente` hacia `personas`: cuentas, comandos recibidos, eventos, bitácora, archivos, autorizaciones y el responsable de una ubicación.
- **Lo común** (`dominio/personas.ts`): `veSueldos` (la dueña o «ven sueldos y tarifas», nunca soporte), `revisarFicha` (la tienda y su rol, el pago según la forma, la fecha no futura), las columnas de la ficha, si tiene cuenta viva y si es la de la dueña.
- **Las acciones**, con sus contratos en `packages/compartido/src/contratos/personal/personas.ts`:
  - **`personal.dar_alta_persona`**: el pago por día pide el permiso; toma su E- y deja la ficha en la bitácora, marcada como sueldo (la descripción va como plantilla).
  - **`personal.editar_persona`**: sin el permiso el pago por día se conserva, y mandarlo o cambiar la forma de pago responde `403 sin_permiso_fino` (decisión 421); no pasa a tienda a quien tiene cuenta viva (`422 tiene_cuenta`); la bitácora lleva solo lo que cambió. Salir del Taller anula su PIN vivo (`cambio_area`), con «. Su PIN ya no entra».
  - **`personal.dar_baja_persona`** y **`personal.reactivar_persona`**: con su versión; la persona de la dueña no se da de baja. Dar de baja anula su PIN vivo (`baja_persona`) en la misma transacción, con «. Su PIN ya no entra» y `acceso_quitado` en la bitácora (decisión 425), y `admin.cerrar_cuenta_de_persona` cierra su cuenta o rechaza su solicitud («. Su cuenta de Google ya no entra»); cerrarle una cuenta activa deja el renglón como alerta, como «Quitar acceso». La ficha en la bitácora lleva el pago por día solo si lo tiene, así que el alta de alguien por pieza no queda como sueldo.
- **La ficha** (`consultas/persona.ts`, `personal.persona`): sin persona, los valores del alta; con persona, la apunta como consulta sensible, y el recorte común le quita el pago por día a quien no tiene el permiso (`recortado` lo dice). El listado `personal.personas` (`consultas/personas.ts`, parte 5) filtra por área (o las dadas de baja) y tienda; con `ver_tarifas=si` pide «ven sueldos y tarifas», deja «Consultó las tarifas del personal» como consulta sensible y lleva el pago por día; el promedio por operación de quien cobra por pieza llega con los registros (fase 12, decisión 420).
- **La lectura** `personal.entra_al_sistema` (`lecturas/entra-al-sistema.ts`): «Baja {fecha}», «Cuenta de Google · {puesto}», «Sistema de su tienda», en el Taller «PIN del taller» si tiene un PIN vivo (activo o bloqueado) o «Sin PIN» y, en la oficina o Aduana y bodega sin cuenta, «Sin cuenta» (decisión 419).
- **La subida** revisa la persona de cada comando (ver [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho)).
- **La muestra** (`apps/api/semillas/personas.ts`) carga las personas de la muestra con sus E- y los ids que ya usan las cuentas, antes de las cuentas; las cuentas de prueba llevan su persona (decisión 422). Lo que baja a la tablet está en `bajada.ts`: las personas activas del Taller con un PIN vivo en la ubicación de la tablet, con su nombre y sus iniciales (la primera letra del nombre y la de su última palabra, calculadas en SQL, decisión 424); al anularse el PIN, la persona baja como `quitar`.
- **Las pruebas:** `modulos/personal/acciones/editar-persona.prueba.ts` (el alta con y sin el permiso; los errores de la ficha; editar sin el permiso; la ficha recortada y su consulta sensible; `tiene_cuenta`) y `dar-baja-persona.prueba.ts` (la baja, su motivo, la reactivación y la dueña); el PIN anulado al dar de baja o salir del Taller, «PIN del taller» y lo que baja a la tablet, en las pruebas del [PIN del taller](pin-del-taller.md#cómo-está-hecho).

**Fase 13.** `dar_baja_persona` llama también `mantenimiento.soltar_maquinas_de_persona`: las máquinas que traía quedan sin quién las trae, y su bitácora dice cuántas (`maquinas_soltadas`, decisión 629).
