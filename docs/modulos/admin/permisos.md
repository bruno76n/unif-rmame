# Permisos

> **Qué cubre:** los 15 departamentos, los permisos finos (ven sueldos y tarifas, imprimen guías), qué ve cada departamento y qué no, cómo los lee el sistema y que solo la dueña los cambia.
> **Estado:** Decidido.
> **Se construye en:** [fase 5 ●](../../fases/05-acceso-con-google-cuentas-y-permisos.md).
> **Se conecta con:** [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md) · [cuentas](cuentas.md) · [acceso con Google](acceso-con-google.md) · [proyecto](../../PROYECTO.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md)

## Para qué sirve

Cada cuenta ve solo los departamentos que la dueña le dio, y dentro de ellos, solo lo que le toca. Un departamento que la cuenta no tiene no aparece en su menú, ni en gris ni con candado. Ejemplo: Javier (Aduana y bodega) ve Aduana y Bodega; nunca ve un precio, un costo ni un saldo, pero sí el nombre y la dirección del cliente para despachar.

## Reglas

1. **El permiso se revisa en el servidor,** en cada acción y cada consulta. Lo que la pantalla esconde no cuenta.
2. **Los departamentos son fijos:** son los 15 del menú. Un departamento nuevo es código nuevo, no un dato.
3. **La dueña tiene todos los departamentos y todos los permisos finos,** sin renglones: un departamento nuevo le llega solo, y su casilla no se puede quitar.
4. **Solo la dueña cambia** departamentos, permisos finos y accesos (ver [cuentas](cuentas.md)), siempre con «Confirmar con Google».
5. **Nadie de tienda entra al sistema de la fábrica:** una cuenta nunca se liga a una persona de tienda.
6. **Los departamentos no se cruzan:** la cuenta del taller no entra a Contaduría; la de Aduana no ve precios.
7. **El encargado del taller** es el departamento Producción: no hay un permiso aparte.

## Qué ve cada departamento

| Departamentos | No ven |
|---|---|
| Producción, Calidad y la Puerta del taller | Precios, costos ni sueldos |
| Mantenimiento | Sueldos, ventas ni precios. Sí ve lo que cuestan sus reparaciones y las horas de paro |
| Aduana y Bodega | Precios, costos ni saldos. Aduana sí ve el nombre y la dirección del cliente para despachar |
| Ventas a externos | El saldo y la antigüedad de un cliente: solo si cada nota de su pedido está pagada, y el anticipo |
| Cualquiera sin «ven sueldos y tarifas» | La nómina, su total, el pago por día de las personas y las tarifas por pieza |
| El «Costo del lote» | Solo lo ven Compras y Contaduría |

Cada consulta dice en su archivo qué recorta y para quién; esto es el resumen.

## La tabla `departamentos`

El catálogo fijo de los 15 departamentos. Lo siembra la migración; no tiene pantalla de alta.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `clave` | text | no | Única, CHECK con la lista de abajo. El código revisa los permisos por clave |
| `nombre` | text | no | Como sale en el menú |
| `grupo` | text | sí | CHECK (`operacion`, `taller`, `almacen`, `administracion`). Nulo es sin grupo (Dirección) |
| `orden` | integer | no | El orden en el menú |
| `asignable_en_alta` | boolean | no | Falso solo en `puerta_taller`, que se entra con PIN |

Lleva las columnas comunes.

**La siembra:**

| Clave | Nombre | Grupo | Orden | Módulo que lo atiende |
|---|---|---|---|---|
| `direccion` | Dirección | — | 1 | `direccion` |
| `compras` | Compras | Operación | 2 | `compras` |
| `catalogo` | Catálogo | Operación | 3 | `catalogo` |
| `patronaje` | Patronaje | Operación | 4 | `patronaje` |
| `ventas` | Ventas a externos | Operación | 5 | `ventas` |
| `linea` | Tienda en línea | Operación | 6 | `linea` |
| `produccion` | Producción | Taller | 7 | `produccion` |
| `puerta_taller` | Puerta del taller | Taller | 8 | `produccion` (la tablet) |
| `calidad` | Calidad | Taller | 9 | `calidad` |
| `mantenimiento` | Mantenimiento | Taller | 10 | `mantenimiento` |
| `aduana` | Aduana | Almacén | 11 | `inventario` |
| `bodega` | Bodega | Almacén | 12 | `inventario` |
| `contaduria` | Contaduría | Administración | 13 | `contaduria` |
| `personal` | Personal | Administración | 14 | `personal` |
| `admin` | Administración del sistema | Administración | 15 | `admin` |

## La tabla `permisos_finos`

Permisos de una cuenta que van dentro de un departamento.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `usuario_id` | uuid | no | → `usuarios.id` |
| `permiso` | text | no | CHECK (`ven_sueldos_y_tarifas`, `imprime_guias`) |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | Se lo quitaron. Volver a darlo es un renglón nuevo |

Lleva las columnas comunes; `creado_por` es la dueña.

| Permiso | Qué permite | Al inicio |
|---|---|---|
| `ven_sueldos_y_tarifas` | Ver la nómina, su total, el pago por día y las tarifas por pieza. Las cuentas por cobrar y por pagar las ve quien tiene Contaduría, sin este permiso | La dueña y la cuenta de la oficina |
| `imprime_guias` | Imprimir las guías de la paquetería de los pedidos en línea | La dueña y la cuenta de Aduana y bodega |

## Acciones

### `admin.cambiar_permiso_fino`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Configuración · Decisiones de operación · casillas «Ven sueldos y tarifas» e «Imprimen guías de la paquetería» |
| **Quién** | Administración del sistema · `solo_duena` · «Confirmar con Google» |
| **Recibe** | `usuario_id` · uuid · obligatorio<br>`permiso` · `ven_sueldos_y_tarifas` o `imprime_guias` · obligatorio<br>`tiene` · booleano · obligatorio<br>`version` · entero · obligatorio, la de la cuenta |
| **Reglas y errores** | `422 es_la_duena`: «La casilla de la dueña no se puede quitar.»<br>`422 cuenta_no_activa`<br>`422 soporte_sin_dinero`: «ven sueldos y tarifas» a la cuenta de soporte<br>Sin cambio: responde bien sin escribir |
| **Escribe** | `permisos_finos`: un renglón nuevo, o la baja del vigente. Sube la versión de la cuenta |
| **Regresa** | «Dio acceso a sueldos y tarifas: {puesto}» · «Quitó acceso a sueldos y tarifas: {puesto}» · «Puede imprimir guías: {puesto}» · «Ya no puede imprimir guías: {puesto}» |
| **Eventos** | `cuenta.permisos_cambiados`: `permisos_cambiados` a sus sesiones |
| **Bitácora** | El mismo texto del aviso, con alerta |

## Lecturas

### `admin.permisos_de`

| | |
|---|---|
| **La usan** | El núcleo, en cada llamada, y cualquier módulo que necesite saber qué puede alguien |
| **Regresa** | De una cuenta: sus departamentos efectivos, sus permisos finos, si es la dueña y si es soporte. De un aparato: su tipo, su ubicación, su prefijo y si está vigente |

**Departamentos efectivos:** la dueña, todos; las demás cuentas, sus departamentos sin baja y solo si la cuenta está activa. Un departamento sin ubicación vale para todas las ubicaciones.

## Permisos

- Ver los permisos de cada cuenta: Administración del sistema.
- Cambiarlos: solo la dueña, con «Confirmar con Google».

## Eventos

`cuenta.permisos_cambiados`.

## Cómo está hecho

**Fase 5, parte 1.**

- **Las tablas** `departamentos` y `permisos_finos` están en `apps/api/src/modulos/admin/tablas.ts` (migración `0011_cuentas.sql`). La app solo lee `departamentos`.
- **Las claves** de los 15 departamentos viven en `clavesDeDepartamento` (`packages/compartido/src/contratos/admin/cuentas.ts`); `nucleo/acceso/departamentos.ts` las reusa y la tabla las repite en su CHECK. La siembra está en `modulos/admin/dominio/departamentos.ts`.
- **`admin.cambiar_permiso_fino`** (`acciones/cambiar-permiso-fino.ts`): edita con la versión de la cuenta; si ya estaba así revisa la versión y responde sin escribir (`sinBitacora`). Su texto es el del aviso, con el nombre de la cuenta hasta que Personal dé el puesto en la fase 7.
- **`admin.permisos_de`** (`lecturas/permisos-de.ts`): `leerPermisosDe` regresa `activa`, `es_duena`, `es_soporte`, los departamentos efectivos (con `ubicacion_id`) y los permisos finos; la dueña, todos sin renglones; una cuenta que no está activa, ninguno; a la de soporte nunca le valen Dirección, Contaduría ni «ven sueldos y tarifas». Es lo que usa el núcleo en cada llamada (ver [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md#cómo-está-hecho)). Lo de los aparatos llega en la fase 6.
- **Los lectores** de `departamentos`, `usuarios`, `usuario_departamentos`, `permisos_finos` y `sesiones` están en `modulos/admin/permisos.ts`.
- **Las pruebas:** `acciones/cambiar-permiso-fino.prueba.ts` y `lecturas/cuentas.prueba.ts`.
