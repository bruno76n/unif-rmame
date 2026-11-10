# Flujo 09 · Autorizaciones

> **Qué cubre:** los seis tipos de autorización de Dirección de punta a punta: quién la pide, cómo llega, quién decide con «Confirmar con Google», qué pasa al autorizar y al rechazar en el módulo de origen, la que pide y decide la misma persona, la que se cancela porque su documento se canceló, y el alta de usuario que solo da la dueña; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [autorizaciones](../../modulos/direccion/autorizaciones.md)

## Qué prueba

Que lo que decide Dirección se decide una sola vez, con «Confirmar con Google», y que su efecto pasa completo en el módulo que lo pidió, en la misma transacción, o no pasa nada. Que rechazar regresa todo a como estaba y le dice el motivo a quien pidió.

## Datos de arranque

- Los datos de la muestra.
- **Por pedir, una de cada tipo:** un conteo de Bodega con una diferencia; una orden de tela por recibir; una nota de entrega entregada; una factura de proveedor que cobra más de lo recibido; una muestra sin escuela lista para aprobar; y una persona de Personal sin cuenta.
- **Las cuentas:** la dueña; la oficina con Dirección (no es la dueña); Bodega; Aduana; Administración del sistema.
- **Google simulado,** con la dueña y la oficina.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Cada departamento | Pide la suya: el conteo con diferencia (Bodega), la recepción de más (Aduana, sola al recibir), la nota de crédito (Ventas), «Pagar lo recibido» (Contaduría), la muestra lista (Patronaje) y «Pedir cuenta nueva» (Administración) | Seis AU- por autorizar en Dirección · Autorizaciones, cada una con «{departamento} · {fecha}» y lo que pide en palabras; cada documento dice «Esperando autorización» |
| 2 | La oficina · Autorizaciones | Autoriza el ajuste → «Confirmar con Google» → `direccion.decidir_autorizacion` | «Autorizado por Dirección: ajuste de inventario»: el AJ- mueve la diferencia que se vio y sus DF- quedan resueltas |
| 3 | La oficina | Rechaza la recepción de más con «No pedimos tanto» | «Rechazado: recepción de más. {OC}: lo de más regresa al proveedor»: la devolución espera en aduana, lo recibido de la línea baja, y Aduana ve el motivo |
| 4 | La oficina | Autoriza la nota de crédito | La NC- con su folio, y el saldo de la nota baja; la nota conserva su total |
| 5 | La oficina | Autoriza el pago de lo recibido | La factura queda autorizada por lo recibido, con la diferencia por aclarar, y su cuenta queda por pagar por ese monto |
| 6 | La oficina | Autoriza la muestra | El desarrollo pasa a ficha técnica |
| 7 | La oficina | Intenta el alta de usuario | `403 solo_duena`: «Las cuentas nuevas solo las da la dueña» |
| 8 | La dueña · cajón «Alta de usuario» | «Dar de alta» → «Confirmar con Google» → `direccion.decidir_autorizacion` | «{persona} dada de alta: ya puede entrar con su cuenta de Google»; la cuenta activa con los departamentos pedidos, y esa persona ya entra con Google |
| 9 | Bodega | Pide otro ajuste; la dueña, que también es quien contó, lo autoriza desde Bodega · Conteos y ajustes | Se aplica, y Dirección y la bitácora lo marcan «pedida y autorizada por la misma persona» |
| 10 | Patronaje | Entrega otra muestra sin escuela y, antes de que se decida, descarta el desarrollo con motivo → `patronaje.descartar_desarrollo` | Patronaje cancela su AU- (`direccion.cancelar_autorizacion`), con su motivo; Dirección ya no la puede decidir: «Esa autorización se canceló: {motivo}.» |

## Lo que tiene que cuadrar al final

- **Las AU-:** ninguna por autorizar de las de este flujo; cada una autorizada, rechazada o cancelada, con quién, cuándo, desde dónde y su confirmación.
- **Sus documentos:** el AJ- autorizado y su movimiento; la devolución al proveedor esperando en aduana; la NC- con folio y el saldo menor; la factura autorizada por lo recibido; el desarrollo en ficha técnica; la cuenta activa.
- **El inventario y el dinero:** la existencia es la suma del libro; lo que se cobra y lo que se paga es lo que dijeron las decisiones.
- **La bitácora:** un renglón por decisión, en la misma transacción que su efecto; la de la misma persona, marcada.

## Lo que sale mal

- **Decidir dos veces:** la segunda responde `ya_decidida`, «Esa autorización ya se decidió.»
- **Rechazar sin motivo:** «Escribe el motivo: le llega a quien lo pidió».
- **Sin «Confirmar con Google» reciente:** `401 reautenticar`; al volver de Google, la decisión sigue con su misma clave.
- **El efecto no se puede aplicar** (la persona del alta ya está dada de baja): su error sale tal cual, `persona_dada_de_baja`, y la AU- sigue por autorizar.
- **Dos personas deciden a la vez:** una gana y la otra recibe `ya_decidida`.
- **Pedir dos veces sobre el mismo documento:** una sola por autorizar a la vez (por ejemplo, `nota_credito_esperando`).
- **Una cuenta sin Dirección** abre Autorizaciones por su dirección: «No tienes acceso a esta pantalla».

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
