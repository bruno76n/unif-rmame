# Fase 09: Inventario: libro, existencias, reservas y traspasos ●

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 8](08-catalogo.md) · [fase 10](10-patronaje-y-compras.md)

## Objetivo

El corazón del inventario queda listo: el libro de movimientos que es el inventario, las existencias que salen de él y se comprueban cada noche, el traspaso que lleva cada pieza de un lado a otro con lo que dijo cada lado, las reservas que apartan piezas sin moverlas y viajan con ellas, y la bandeja de lo que se aceptó y no cuadra. Todo lo que después mueva inventario lo hará por aquí.

## Depende de

- [Fase 8](08-catalogo.md), terminada y en verde.

## Qué se construye

### Parte 1 · El libro y las existencias

**Construye:** las tablas `movimientos`, `movimiento_lineas`, `existencias` y `existencias_material`, con los permisos de la base que no dejan cambiar ni borrar el libro; `escribirMovimiento` en `modulos/inventario/dominio/`, con su revisión de cada renglón contra su tipo, los candados en el orden fijo, las claves derivadas y la suma de la proyección; la reversión; las lecturas `inventario.existencia_material` e `inventario.piezas_de_variante` (con `bloquear`).

**Leer:**
- [libro de movimientos](../modulos/inventario/libro-de-movimientos.md) — las reglas, los tipos, las tablas y cómo se escribe un movimiento. La tabla `ubicaciones` ya existe desde la fase 4.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md) — las tablas, las cuentas y las lecturas (el cuadre va en la parte 5).
- [base de datos](../cimientos/BASE-DE-DATOS.md#candados) — los candados y el reintento.

### Parte 2 · Traspasos

**Construye:** las tablas `traspasos` y `traspaso_lineas` y la vista `partidas_aduana`; la tabla de transiciones de estado (una que no está es un error del programa); las funciones del módulo para crear un traspaso, cambiarlo de estado y repartirlo (`repartirTraspaso`), con su evento.

**Leer:**
- [traspasos](../modulos/inventario/traspasos.md) — todo lo de esta parte.

### Parte 3 · Reservas

**Construye:** la tabla `reservas`; las internas `inventario.reservar`, `inventario.liberar_reservas`, `inventario.confirmar_pago_reserva`, `inventario.apartar_para_nota` e `inventario.devolver_de_nota`; las lecturas `inventario.libres` e `inventario.listo_en_aduana`; el candado por variante antes de escoger o mover reservas; las reservas que viajan con su pieza en `escribirMovimiento` y en `repartirTraspaso`; y los candados `talla_con_existencia` y `talla_con_reservas` de `catalogo.dar_baja_talla`, con `inventario.piezas_de_variante`.

**Leer:**
- [reservas](../modulos/inventario/reservas.md) — los motivos, los estados, la tabla y las internas.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md#catalogodar_baja_talla) — los dos candados que se agregan aquí.

### Parte 4 · Excepciones

**Construye:** la tabla `excepciones` con todos sus tipos; `inventario.resolver_excepcion`; las internas `inventario.registrar_excepcion` e `inventario.marcar_excepcion_resuelta`; la subida de los aparatos que abre su excepción con `inventario.registrar_excepcion` (en lugar del módulo de prueba de la fase 6) y la excepción `dispositivo_revocado` de lo retenido; `admin.aplicar_comando_retenido`.

**Leer:**
- [excepciones](../modulos/inventario/excepciones.md) — los tipos, las bandejas, la tabla y las acciones.
- [dispositivos](../modulos/admin/dispositivos.md#adminaplicar_comando_retenido) — aplicar un comando retenido.
- [sincronización](../cimientos/SINCRONIZACION.md#el-aparato-revocado) — lo que llega de un aparato revocado.

### Parte 5 · El cuadre de la noche

**Construye:** la tabla `cuadres`; la interna `inventario.correr_cuadre` con los pasos 1, 3, 6, 7 y 8 en tandas por ubicación; el trabajo «Cuadre nocturno» a `inventario.hora_cuadre`; el aviso `cuadre_fallido`; la tarea «Depurar eventos» encolada al llegar `cuadre.terminado`.

**Leer:**
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche) — los pasos, el trabajo y el aviso.
- [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md#depurar-eventos) — la tarea que se encola al terminar.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Ninguna acción del negocio mueve inventario todavía: la primera llega en la fase 11. Las pruebas escriben movimientos de los 31 tipos con documentos de prueba, con `escribirMovimiento`.
- El libro, las reservas y el cuadre se prueban con datos al azar y con varias conexiones al mismo tiempo.
- No va en esta fase: ninguna pantalla, ninguna acción de Aduana ni de Bodega, ni las consultas de sus pantallas.

## Excepciones permitidas

- Las llaves a tablas de fases posteriores llevan su `@llavePendiente`: materiales (10), rollos (11), lotes (12), y en `traspasos` y `reservas`, las recepciones, los despachos, los pedidos, las notas y lo de tienda.
- Las internas de reservas las llaman Ventas (16), Tienda en línea (18) y la caja (con el POS): aquí se prueban directo, con documentos de prueba. En el orden de surtido en línea solo entran Bodega y Aduana; la tienda entra con el POS, cuando hay cajas que sincronizan.
- El cuadre construye aquí sus pasos 1, 3, 6, 7 y 8. El paso 2 llega con los rollos (11), el 4 con los lotes (12), el 5 y las DF- de los tramos con diferencia con la fase 14, y en el paso 6 los documentos de Ventas (16), Tienda en línea (18) y las tiendas (con el POS).
- `admin.aplicar_comando_retenido` vive en el archivo de [dispositivos](../modulos/admin/dispositivos.md) (fase 6), pero se construye aquí, con su excepción.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un movimiento escribe sus renglones y suma la existencia en la misma transacción; si algo falla, no queda nada; el rol de la app no puede cambiar ni borrar el libro | `modulos/inventario/dominio/escribir-movimiento.prueba.ts` y `modulos/inventario/tablas.prueba.ts` |
| Un renglón que no va del origen al destino de su tipo, o que toca Tránsito o En camino a aduana sin su traspaso, no se escribe | `escribir-movimiento.prueba.ts` |
| Nunca se rechaza por existencia: queda negativa | La misma prueba |
| Con movimientos al azar y varias conexiones al mismo tiempo, la existencia guardada es siempre la suma del libro y no hay bloqueos cruzados | `escribir-movimiento.azar.prueba.ts`, con fast-check |
| La misma acción repetida no duplica un movimiento, también cuando crea varios con claves derivadas; un movimiento se revierte una sola vez | `escribir-movimiento.prueba.ts` |
| Repartir nunca pasa de lo que queda en aduana, no mueve existencia, lleva las reservas al hijo y deja al padre `repartido` cuando no le queda nada | `modulos/inventario/dominio/repartir-traspaso.prueba.ts` |
| Una transición de estado que no está en la tabla de traspasos es un error; la vista `partidas_aduana` da lo que queda en aduana y su antigüedad | `modulos/inventario/dominio/traspasos.prueba.ts` |
| Dos acciones que quieren las últimas piezas de Bodega para un pedido externo: una aparta y la otra recibe `sin_libres`; nunca se aparta de más | `modulos/inventario/internas/reservar.prueba.ts`, con dos conexiones |
| Un pedido en línea sin pieza en ningún lado queda reservado en Bodega, en negativo, con su excepción; liberar una parte deja el resto en una reserva nueva | `reservar.prueba.ts` y `liberar-reservas.prueba.ts` |
| Una reserva viaja con su pieza en cada movimiento y en cada reparto; un documento cancelado reparte lo de aduana en un `regresa` a su origen | `escribir-movimiento.prueba.ts` y `liberar-reservas.prueba.ts` |
| Crear una nota aparta lo listo y nunca más; cancelarla antes de salir lo regresa al pedido | `apartar-para-nota.prueba.ts` y `devolver-de-nota.prueba.ts` |
| Una talla con existencia o con reservas no se da de baja, y ningún movimiento se cruza con la baja | `modulos/catalogo/acciones/dar-baja-talla.prueba.ts` |
| Una excepción no deshace lo aplicado; resolver pide qué se hizo y no se resuelve dos veces; Producción solo resuelve las del taller y Contaduría las de su bandeja | `modulos/inventario/acciones/resolver-excepcion.prueba.ts` |
| Lo que llega de un aparato revocado y pasó antes abre `dispositivo_revocado`; al aplicarlo la dueña, la excepción queda resuelta, y aplicarlo otra vez no hace nada | `modulos/admin/acciones/aplicar-comando-retenido.prueba.ts` |
| El cuadre corrige desde el libro una existencia alterada y deja la excepción con los dos valores; un traspaso terminado con algo en un tramo abre `cuadre_proyeccion`; uno de más días sin confirmar abre `sin_confirmar`; corre una sola vez por fecha | `modulos/inventario/internas/correr-cuadre.prueba.ts` |
| El cuadre no frena las ventas: cada tanda es su propia transacción corta | La misma prueba, con un movimiento a media corrida |
| Un cuadre que no termina avisa a la dueña; al terminar se encola la depuración de eventos | `modulos/inventario/trabajos/cuadre-nocturno.prueba.ts` |

## Revisión de fase

Delicada ●: dos [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **inventario** (el libro, las existencias, los tramos de los traspasos, las reservas y el cuadre);
- **sincronización** (las claves derivadas, lo que llega de los aparatos, el aparato revocado y la bandeja de excepciones).
