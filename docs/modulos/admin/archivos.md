# Archivos

> **Qué cubre:** fotos, comprobantes, facturas, documentos del contador y evidencias: la subida directa a R2 con dirección firmada, los tipos y tamaños que se aceptan, cómo se ligan a su documento y los enlaces que vencen.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [arquitectura](../../cimientos/ARQUITECTURA.md) · [módulos](../../cimientos/MODULOS.md) · [impresión](impresion.md) · [respaldos](respaldos.md) · [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [gastos](../contaduria/gastos.md) · [contador y cuadres](../contaduria/contador-y-cuadres.md) · [seguridad](../../cimientos/SEGURIDAD.md) · [productos](../catalogo/productos.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [hojas](../../impresos/hojas.md) · [infraestructura](../../cimientos/INFRAESTRUCTURA.md)

## Para qué sirve

Los archivos no pasan por la API ni se guardan en la base: van directo a Cloudflare R2, y la base guarda solo su registro. Ejemplo: al registrar un gasto, la pantalla pide una dirección firmada, sube la foto del ticket directo a R2 y después manda el `archivo_id` en `contaduria.registrar_gasto`, que lo liga al gasto G-0412.

## Reglas

1. **Tres pasos:**
   1. `POST /v1/archivos/subida` regresa un `archivo_id` y una dirección firmada para subir;
   2. el cliente sube el archivo directo a R2 con esa dirección;
   3. la acción que lo usa manda el `archivo_id`, y su módulo lo liga con `admin.ligar_archivo`.
2. **El almacenamiento nunca se expone.** El cubo es privado; se entra solo con direcciones firmadas que valen `admin.minutos_enlace_archivo` (5 minutos).
3. **Lo que se sube es lo que se declaró:** la dirección firmada lleva el tipo, el tamaño y la suma SHA-256, y R2 rechaza otro contenido. Al ligar, la API revisa que el objeto llegó con ese tamaño y esa suma.
4. **Cada propósito acepta sus tipos** y nada pasa de `admin.archivo_tamano_max_mb` (20 MB):

   | Propósito | Tipos |
   |---|---|
   | `foto` | JPG, PNG, WEBP o HEIC |
   | `comprobante` | Imagen, PDF o XML |
   | `factura_proveedor` | PDF, imagen o XML |
   | `documento_contador` | PDF, imagen, XML o ZIP |
   | `guia`, `pdf_documento`, `etiqueta` | PDF |
   | `evidencia_restauracion` | Imagen, PDF o texto |

   Un módulo puede pedir un tope menor o menos tipos para su propósito (la foto de un producto, en [productos](../catalogo/productos.md)).
5. **Un archivo es de un solo documento.** Una vez ligado, otro documento no lo puede usar.
6. **Nada se borra:** un archivo se archiva con `baja_en`, y el objeto se queda en R2.
7. **Ver un archivo** pide poder ver su documento, y eso lo responde el módulo dueño del documento. Un archivo sin ligar solo lo ve quien lo subió.

## La tabla `archivos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Un aparato puede traer el suyo |
| `proposito` | text | no | CHECK (`foto`, `comprobante`, `documento_contador`, `factura_proveedor`, `etiqueta`, `guia`, `pdf_documento`, `evidencia_restauracion`) |
| `modulo` | text | no | El módulo del documento al que pertenece |
| `entidad` · `entidad_id` | text · uuid | sí | El documento. Es informativo: la llave foránea fuerte va del documento al archivo |
| `nombre_original` | text | no | Hasta 200 |
| `tipo_mime` | text | no | Revisado contra su propósito |
| `tamano_bytes` | bigint | no | Con tope |
| `sha256` | text | no | La huella del contenido, en hexadecimal |
| `almacen_clave` | text | no | La llave del objeto en R2: `{modulo}/{año}/{mes}/{archivo_id}`. Única |
| `subido_en` | timestamptz | sí | Cuando se comprobó que el objeto llegó |
| `persona_id` · `dispositivo_id` | uuid | sí | Si lo subió un aparato |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | Archivado en vez de borrado |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Índices:** único (`almacen_clave`); (`entidad`, `entidad_id`); (`sha256`).
- `persona_id` y `dispositivo_id` nacen con su `@llavePendiente` hasta las fases 7 y 6.

## `admin.subir_archivo` · `POST /v1/archivos/subida`

| | |
|---|---|
| **Pantalla** | Todo campo de archivo: foto de producto, comprobante, factura del proveedor, documento del contador, evidencia de restauración |
| **Quién** | Una sesión o la llave de un aparato, con un departamento (o el alcance del aparato) del módulo que usa ese propósito |
| **Recibe** | `proposito` · obligatorio<br>`modulo` · texto · obligatorio<br>`nombre_original` · texto · obligatorio · hasta 200<br>`tipo_mime` · texto · obligatorio<br>`tamano_bytes` · entero · obligatorio<br>`sha256` · texto en hexadecimal · obligatorio<br>`archivo_id` · uuid · opcional: el que trae el aparato |
| **Reglas y errores** | `422 tipo_no_aceptado`: «Ese tipo de archivo no se acepta aquí. Sube {tipos}.»<br>`422 archivo_muy_grande`: «El archivo pesa más de {n} MB.» |
| **Escribe** | `archivos`, sin `subido_en` |
| **Regresa** | `archivo_id`, `url_subida` (subida firmada que vale `admin.minutos_enlace_archivo`) y los encabezados que el cliente tiene que mandar (tipo, tamaño y suma SHA-256) |
| **Bitácora** | Ninguna: la deja la acción que use el archivo |
| **Sin internet** | No. El aparato sube sus archivos cuando hay red, antes de mandar la tanda que los usa |

## `admin.guardar_archivo` · interna

| | |
|---|---|
| **La llaman** | Lo que genera el servidor: el PDF de etiquetas, el PDF de la orden de compra, el ZIP del paquete del contador, las guías |
| **Recibe** | El contenido · `proposito` · `modulo`, `entidad`, `entidad_id` · `nombre_original` · `tipo_mime` |
| **Escribe** | El objeto en R2 y su renglón en `archivos`, con `subido_en` y su SHA-256 |
| **Regresa** | `archivo_id` y una dirección firmada para bajarlo |

Si la acción que lo llama necesita el archivo para confirmarse (el PDF de la orden de compra), lo genera y lo sube antes de confirmar: si falla, la acción falla.

## `admin.ligar_archivo` · interna

| | |
|---|---|
| **La llaman** | Toda acción que recibe un `archivo_id` |
| **Recibe** | `archivo_id` · el `proposito` que espera · `modulo`, `entidad`, `entidad_id` |
| **Reglas y errores** | `404 archivo_no_existe`<br>`422 proposito_distinto`: «Ese archivo no es {propósito}.»<br>`422 archivo_ajeno`: lo subió otra cuenta u otro aparato<br>`422 archivo_ya_ligado`: ya pertenece a otro documento<br>`422 archivo_no_subido`: R2 no lo tiene, o su tamaño o su suma no son los declarados, «El archivo no terminó de subir. Vuelve a subirlo.» |
| **Escribe** | `archivos`: `entidad`, `entidad_id` y `subido_en` |

En un comando de un aparato que llega con un archivo que no existe, la acción no se aparta: se aplica y su módulo abre la excepción `referencia_desconocida` (ver [excepciones](../inventario/excepciones.md)).

## `admin.archivo` · `GET /v1/archivos/{id}`

| | |
|---|---|
| **Pantalla** | Toda liga a un archivo: un comprobante, una foto, una factura, una evidencia, un PDF |
| **Quién** | Quien puede ver el documento al que pertenece (lo responde su módulo); un archivo sin ligar, solo quien lo subió |
| **Recibe** | `descarga` · booleano: abrirlo o bajarlo |
| **Regresa** | `302` a una dirección firmada que vale `admin.minutos_enlace_archivo`. Si la cuenta no lo puede ver: `404` |

## En local y en las pruebas

- **En las pruebas,** el simulador de R2 con MSW recibe la subida, contesta la revisión del objeto y se puede poner a fallar (ver [pruebas](../../cimientos/PRUEBAS.md)).
- **En local,** un servidor compatible con S3 en Docker, que levanta `pnpm local`. El plan de la fase 4 escoge cuál, leyendo su documentación: tiene que aceptar direcciones firmadas de subida y de bajada y la suma SHA-256. La elección se anota como decisión.
- Que la subida y el vencimiento de los enlaces funcionen en R2 de verdad se comprueba en «Verificación real pendiente» de `REGISTROS.md`.

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.archivo_tamano_max_mb` | 20 MB | El tamaño máximo de cualquier archivo |
| `admin.minutos_enlace_archivo` | 5 min | Cuánto valen las direcciones firmadas de subida y de bajada |

Los dos van en la sección `tecnico`.

## Permisos

- Subir: cualquier sesión o aparato con un departamento (o alcance) del módulo de ese propósito.
- Ver: lo que dice el módulo del documento.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 4.*
