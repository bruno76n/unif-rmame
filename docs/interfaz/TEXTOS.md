# Textos de pantalla

> **Qué cubre:** cómo se escribe todo texto de pantalla (títulos, pestañas, columnas, estados, botones y avisos): el tono, los nombres fijos, las siete formas de los estados con su color, y los textos de los pedidos, el hilo, la receta y el corte.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../fases/19-web-principal.md).
> **Se conecta con:** [diseño](DISENO.md) · [lo común de las pantallas](comunes.md) · [regla de pantallas](../../.claude/rules/react.md) · [API](../cimientos/API.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md) · [pantallas de la tablet](tablet.md) · [fase 19](../fases/19-web-principal.md)

## Para qué sirve

Todo el sistema habla igual: el mismo estado se escribe y se pinta igual en todas las pantallas, y cada estado se entiende solo. Ejemplo: un pedido que todavía no se manda a producción dice «Por mandar a producción» en ámbar en Ventas, en Pendientes y en Dirección; nunca «Sin producción» ni «Pendiente».

## Reglas

1. **Español de México, profesional y directo.** El sistema es una herramienta de trabajo, no una conversación: sin frases coloquiales ni ingeniosas («Te esperan», «Cómo va el negocio»).
2. **Sin textos que expliquen cómo usar la pantalla.** Solo avisos que bloquean una acción o dicen una consecuencia.
3. **Sustantivos de oficio** en títulos y columnas; **verbos en infinitivo** en botones («Surtir», «Recibir», «Mandar a producción»).
4. **Los mensajes de error y los avisos de cada acción** están en el archivo de su tema, con su código (ver [API](../cimientos/API.md)); la pantalla los muestra tal cual, junto al campo o en el aviso de abajo.
5. **Plurales, unidades y mayúsculas siempre bien:** «1 solicitud», «hace 1 día», «entrega en 14 días», «20 m», «Cuadros vino, Colegio Morelos». Los pesos van enteros o con sus dos centavos, nunca a medias («$650.50», no «$650.5»).
6. **Un dato que cambia va entre llaves** en los archivos de creación: «{folio} confirmado para {cliente}». En el código, cada texto con datos es una función del paquete compartido que recibe esos datos.

## Nombres fijos

| No se dice | Se dice |
|---|---|
| Resumen · Te esperan | **Pendientes** (primera pestaña: indicadores y la cola de trabajo) |
| Cómo va el negocio | **Indicadores** |
| Cobrar · Pagar | **Cuentas por cobrar · Cuentas por pagar** |
| Nos deben · Debemos | **Saldo por cobrar · Saldo por pagar** |
| Cortes de tiendas | **Cortes de caja** |
| Contador | **Contador externo** |
| Existencia (pestaña) | **Existencias** |
| Solicitudes de tienda (pestaña) | **Solicitudes** |
| Por aclarar | **Diferencias** (en la matriz, «en diferencia») |
| Lo que está aquí (Aduana) | **Inventario en aduana** |
| Qué pedir (Compras) | **Por pedir** |
| Facturas por casar | **Conciliación de facturas**; estado «No cuadra» o «Sin factura»; quién la tiene: «Esperando a Contaduría», «Esperando a Aduana» o «Esperando al proveedor» |
| Ya no llega a tiempo | **Sin tiempo de entrega** |
| Mover · Mover y fabricar · Fabricar | **Traspaso · Traspaso y fabricación · Fabricación** |
| Prenda y talla (como fila) | **Variante** |
| Dónde | **Ubicación** |
| Pidió · Libres · Falta | **Solicitado · Disponible · Faltante** |
| Espera a Dirección · En autorización | **Esperando autorización** |
| Lo resuelve X | **Responsable: X** |
| Detenidos | **Pagos detenidos** |
| A quién · Qué | **Beneficiario · Documento** |
| Es · Nos debe · Le debemos | **Relación · Por cobrar · Por pagar**; saldo neto **A favor · En contra · Saldado** |
| Guardar documento | **Adjuntar documento** |
| Nota de venta (clientes externos) | **Pedido** (PE-); lo que sale de aduana va en una **Nota de entrega** (NV-) |
| Notas (pestaña de Ventas a externos) | **Pedidos** y **Notas de entrega**, dos pestañas ligadas |
| Nueva nota | **Nuevo pedido**, con «Guardar borrador» y «Guardar y confirmar» |
| Editar un pedido confirmado | **Modificar pedido**, con «Guardar versión {n}» |
| Entregar | **Armar nota de entrega**; en aduana, **Despachar**; con el acuse, **Confirmar entrega** |
| Copiar un producto | **Crear a partir de otro producto**; en la ficha, **Crear otro a partir de este** |
| Mandar lo que se agregó | **Mandar a producción**, que abre la revisión y ahí se confirma con «Mandar a producción»; en el pedido nuevo, **Confirmar y mandar a producción**; al modificar, **Guardar y mandar a producción** |
| Escala por talla · Fijo por prenda | **Cambia por talla · Igual en todas las tallas** (avíos de la receta) |
| Básico, sin escuela | **Ninguna escuela: básico o general** |
| Con el cliente · Con Dirección (muestra) | **Esperando aprobación del cliente · Esperando aprobación de Dirección** |
| Atención · Revisar · Alerta | **Por revisar** (rojo si urge) |
| Abierto (reclamo) | **Por resolver** |
| Sin acuse | **Por confirmar entrega** |
| Sin producción · Sin orden de producción | **Por mandar a producción** |
| Sin imprimir | **Por imprimir** |
| Vencida (prueba de respaldo) | **Por probar** |
| Entrega próxima (Calidad) | **Por revisar hoy** |
| {n} días en espera | **Por autorizar · {n} días** |
| Pagado · por surtir | **Por surtir** · **Por surtir · sale hoy** |
| Desde ayer · Atrasada (solicitud) | **Atrasada {n} días** |
| Detenido (pago) | **Detenido · no cuadra** |
| Más de 30 días (cobranza) | **Vencido hace más de 30 días** |
| Al corriente (material) | **Alcanza** |
| Sin material {n} días | **Faltará material {n} días** |
| Sin pedido a la vista | **Pedir en más de 6 meses** |
| {n} días aquí (aduana) | **{n} días en aduana** |
| En el taller (reproceso) | **En reproceso** |
| Pasa a Calidad · pasa a aduana | **Esperando a Calidad · esperando a Aduana** |
| Con falla (máquina) | **Trabaja con falla** |
| En riesgo | **En riesgo de atraso** |
| Por pedido (talla especial) | **Pedido especial** |
| «En producción», sin más | **El hilo** (abajo) |

## Los estados

Cada estado va en un **cuadro de color sólido con texto blanco en negritas, sin punto** (los colores, en [diseño](DISENO.md#los-colores)). Cada uno se arma con una de estas formas, para que se entienda solo:

| Forma | Cuándo | Ejemplos |
|---|---|---|
| **Por + verbo** | Le toca a quien ve la pantalla | Por surtir · Por recibir · Por revisar · Por autorizar · Por resolver · Por decidir · Por confirmar entrega · Por mandar a producción · Por imprimir · Por probar |
| **Esperando + qué o a quién** | Depende de otra área o de alguien de fuera | Esperando receta · Esperando factura · Esperando prendas · Esperando autorización · Esperando aprobación del cliente · Esperando a Calidad · Esperando al proveedor |
| **Sin + lo que falta** | Le falta un dato o una cosa | Sin receta · Sin verificar · Sin precio · Sin foto · Sin PIN · Sin factura · Sin depósito · Sin existencia |
| **En + dónde está** | Dónde está o en qué proceso va | En producción · En aduana · En tránsito · En reproceso · En reparación |
| **Tiempo** | Cuándo vence, llega o sale | Vence en 3 días · Vencido · Vencido hace más de 30 días · Atrasado 2 días · Corte mañana · Sale hoy · Llega esta semana · 3 días en aduana · Pedir antes del 12 nov · Faltará material 4 días |
| **Cómo va** | Avance contra la fecha | En tiempo · En riesgo de atraso · Atorado en puños y pretina · Trabaja con falla · Parada |
| **Ya quedó** | Terminado o resuelto | Autorizado · Rechazado · Resuelto · Entregada · Recibida · Verificada · Alcanza · Listo para entregar |

- Nunca un estado que no diga qué: «Con el cliente», «Atención», «Alerta», «Abierto», «Desde ayer», «Al corriente», «Por pedido».
- Un dato de más va después de un punto medio: «Por surtir · sale hoy», «Por autorizar · 2 días», «Detenido · no cuadra».

### El color de cada estado

| Color | Qué dice | Estados |
|---|---|---|
| **Rojo** | Vencido o bloqueado | Vencido · Vencido hace más de 30 días · Detenido · no cuadra · Atrasado {n} días · Atrasada {n} días · Parada · En reparación · Por entregar · corte hoy · Sin precio · Sin sincronizar · Corte hoy · Falta la receta · Faltará material {n} días · Por revisar hoy · Por resolver · Por autorizar · {n} días · Por surtir · sale hoy · Sin confirmar · {n} días |
| **Ámbar** | Por hacer | Vence hoy · Vence en {n} días · Corte mañana · Por decidir · Por aclarar · Por entregar · Reportada · En tránsito · Por aplicar · Por pagar · Por enviar · Sin depósito · Por surtir · Por recibir · Por contar · Por revisar · Por autorizar · Por confirmar entrega · Por mandar a producción · Por imprimir · Por probar · Sin foto · Sin PIN · Esperando autorización · Trabaja con falla · En riesgo de atraso |
| **Azul** | Informativo | Llega esta semana · Esperando aprobación del cliente · Esperando aprobación de Dirección · En reproceso · Corte en {n} días · En tiempo |
| **Verde** | Resuelto | Cerrada · Listo para entregar · Alcanza · Resuelto · Resuelta · Aprobado · Trabajando · Autorizado por Dirección |
| **Gris** | Depende de otra área, en borrador o sin empezar | Asistencia sin cerrar · Borrador · Por cortar · Esperando receta · Esperando a {tienda} |

Un estado nuevo entra a esta tabla con su color antes de usarse.

### Las etapas de pedidos, notas y lotes

Son etapas, no urgencias: cada una tiene su color, el mismo de la barra de avance.

- **Pedido:** Borrador (gris) · Confirmado (azul) · En producción (ámbar) · Listo en aduana (morado) · Entrega parcial (verde azulado) · Entregado (verde) · Cancelado (rojo). En el mismo cuadro, abajo, la alerta que aplique: «Atrasado {n} días» · «En riesgo de atraso» · «Listo para entregar» · «Cambio por aplicar» · «Por mandar a producción» (nunca se mandó) · «{n} piezas por mandar» (ya tiene orden y le agregaron piezas).
- **Nota de entrega:** Por despachar (morado) · En camino (ámbar) · Entregada (verde) · Cancelada (rojo).
- **Pedido en línea:** Esperando pago (gris) · Por surtir (azul) · Esperando prendas (ámbar) · Listo para empacar (verde azulado) · Vencido (gris) · Cancelado (rojo). En Pendientes de Tienda en línea la etapa toma el color de su urgencia: roja desde `linea.dias_pedido_rojo` días de pagado, ámbar antes.
- **Salida de una tienda** (con el POS): En camino a aduana (ámbar) · Sin confirmar · {n} días (rojo, desde `inventario.dias_sin_confirmar_rojo`) · Recibida en aduana (verde) · Recibida con diferencias (ámbar, mientras su DF- está por aclarar) · Cancelada (gris). Un documento de venta cancelado (pedido, nota, pedido en línea) va en rojo; un movimiento cancelado (salida, lote), en gris.
- **Diferencia de una tienda** (con el POS): Por contar (ámbar) · Por aclarar (ámbar) · Esperando autorización (ámbar) · Resuelta (verde). La que Bodega pidió contar dice, en la caja, «Por contar · para el {día}» (rojo si ya pasó), y en Bodega, «Esperando a {tienda}» (gris).
- **Lote:** Por cortar (gris) · En tiempo (azul) · En riesgo de atraso (ámbar) · Atrasado (rojo) · Atorado en {operación} (rojo) · Sin datos de la tablet (gris) · Terminado (verde) · Revisado (verde) · En aduana (verde) · Cancelado (gris). Los de en proceso son su salud, que se calcula (ver [lotes](../modulos/produccion/lotes.md#reglas)).
- **Avance del pedido,** por producto y talla: Pedido · Entregado · En nota · Listo en aduana · En producción · En reproceso · Por mandar a producción.
- **Aviso en el pedido:** «Versión {n} por aplicar en Producción: Pantalón gris oxford, talla 30: 5 de más» (azul) · «{n} piezas por mandar», con el botón «Mandar a producción» (ámbar).

### El hilo

Seis paradas con las piezas de cada una: **Pedido · Corte · Costura · Calidad · Aduana · Entrega** (en reabasto y temporada: Orden · … · la tienda o Bodega). Abajo de cada una, una línea corta en minúsculas con el dato que importa:

- **Pedido:** la fecha en que se mandó · «10 por mandar» (ámbar).
- **Corte:** «se corta el 13 oct» · «corte atrasado» (rojo) · la fecha en que se cortó · «falta la receta».
- **Costura:** «40 de 90 listas» (ámbar si va en riesgo, rojo si va atrasado) · «atorado en puños y pretina» (rojo).
- **Calidad:** «por revisar» · «5 en reproceso» (ámbar).
- **Aduana:** «listas» · «por recibir».
- **Entrega:** «70 entregadas» · «en nota» · «para el 20 nov» si todavía no llega nada.

### La revisión antes de mandar a producción

- Por prenda: «Lote nuevo L-2026-135 · se corta el 13 oct» · «Se suman al lote L-2026-125, que se corta el 15 oct».
- Material: «Piqué blanco: usa 100 m · hay 277 m libres» · «… · llega el 20 oct con OC-0225» (ámbar) · «Tejido de punto vino: faltan 485 m · Compras tiene que pedirla» (rojo) · «Avíos completos» · «Sin receta: no se corta hasta que Patronaje la capture» (rojo).
- Arriba: «Playera polo blanca con escudo no tiene receta: no se corta hasta que Patronaje la capture» (rojo) · «Falta material: el corte no puede empezar hasta que Compras lo consiga» (rojo) · «Parte del material llega después de la fecha de corte» (ámbar).

### La receta

- Partes: «Medidas de la prenda» (centímetros, talla por talla) · «Tela» (metros por prenda, talla por talla) · «Avíos» (piezas, centímetros o metros por prenda).
- Debajo de la tela: «Para cortar» · «con 6% de desperdicio» (o «…, estimado» mientras la prenda no tenga cortes).
- Avíos: «Igual en todas las tallas» · «Cambia por talla» · «pza por prenda» · «m por prenda» · «Un cono de 5,000 m alcanza para 333 prendas» · «En bodega: 0.7 m por prenda».
- Arriba: «Con esta receta, el corte L-2026-122 de 190 piezas lleva» y cada material con su cantidad: «214 m», «190 pza», «1 cono».
- Errores al guardar: «Gabardina azul marino, talla 32: 106 m por prenda es demasiado. La tela va en metros, por ejemplo 1.06» · «Cintura, talla 32: 0.81 cm no parece medida de la prenda. Va en centímetros» · «Piqué blanco: faltan 9 tallas, en metros».
- En el alta de producto: «Se captura al crear el producto» · «Se copia la versión 2 de Pantalón azul marino» · «Queda sin receta» (ámbar); botón «Crear y seguir con la receta».
- Desarrollo de producto: «Muestra lista para aprobar» · «Dirección aprobó» · «Esperando aprobación de Dirección» (azul) sin escuela; con escuela, «Esperando aprobación del cliente».

### El corte

- Arriba de los rollos: «La tela alcanza · 190 piezas llevan 214 m según la receta · los 3 rollos tienen 277 m» (verde) · «Faltan 25.5 m de tela · …» (rojo), con el botón «Agregar R-0432 · 88.5 m» · «… · no hay más rollos de esta tela en bodega».
- Cada rollo: «Completo · 92.5 m»; el último, «Se usan 25.5 m · quedan 63 m según la receta» (si se cambió lo que quedó, sin «según la receta»).
- «Quedó del rollo R-0432: 63 m», lleno, con «Según la receta» al lado; cambiado, «Cambiado · según la receta, 63 m» y «Volver a lo calculado». Con menos de 15 m: «Sirve» (como viene) · «Ya no sirve».
- Al cerrar: «R-0432 regresa a bodega con 60 m» · «Retazo de 8 m a la bodega de tela» · «8 m se registran como merma de tela» · «El rollo R-0432 se usó completo».
- Errores: «La receta lleva forro negro: agrega sus rollos» · «Del rollo R-0432 no pueden quedar más de 88.5 m» · «Del rollo R-0432 no se usó nada: quítalo de la lista».
- Avisos que no detienen: «Con 197 m de gabardina azul marino no salen 190 piezas según el patrón, que pide 202 m: revisa lo que quedó.»
- Sin receta: «Falta la receta» · «Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla. Se corta el 15 oct.», con el botón «Capturar receta». En Pendientes de Producción, «Falta la receta» (rojo); en Bodega, «Esperando receta» (gris); en el hilo, «falta la receta».
- La tela del corte: «Tela entregada» (verde) · «Tela por entregar» (gris; ámbar a tres días del corte y rojo a uno).
- Contra el patrón: «+6%» · «−4%» si se usó menos tela.

## Los avisos de abajo

Dicen qué pasó y con qué folio, sin adornos. Verde con palomita cuando algo se hizo; ámbar con «!» cuando algo no se pudo.

- «PG-0302 aplicado a FP-8790 de Textiles Aurora»
- «Depósito del corte CT1-1010 confirmado»
- «FP-1172 registrada con diferencias: pago detenido»
- «S-T2-052: 27 piezas enviadas a aduana para Tienda 2. El faltante pasa a reabasto»
- «RZ-013 recibido: 11 m de felpa marino»
- «PE-0150 confirmado para Colegio Morelos. El precio quedó congelado»
- «PE-0146: 10 piezas a producción: se suman a L-2026-125, que todavía no se corta»
- «PE-0150: 160 piezas a producción: OP-2026-072 con los lotes L-2026-135 y L-2026-136»
- «NV-0151 lista: 50 piezas por despachar en aduana»
- «NV-0151 entregada a Instituto Juan Pablo II. Contaduría ya la cobra»

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 19.*
