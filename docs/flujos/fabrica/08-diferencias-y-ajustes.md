# Flujo 08 · Diferencias y ajustes

> **Qué cubre:** cómo nace y se cierra cada diferencia de inventario: la de una recepción que no cuadró y su aclaración, la de una pieza que Bodega no encuentra, el conteo ciego con su ajuste y la autorización de Dirección, la diferencia del cuadre de la noche y la de un avío que no alcanzó; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md)

## Qué prueba

Que el inventario explica cada hueco en lugar de taparlo: cada diferencia dice dónde, cuánto y a cargo de quién; se aclara con lo que de verdad pasó o se ajusta con la autorización de Dirección, y el ajuste mueve solo lo que se vio al contar, aunque después haya cambiado la existencia.

## Datos de arranque

- Los datos de la muestra.
- **En Aduana:** un A- con 24 playeras polo talla 10 para Bodega.
- **En Bodega:** la sección «Playeras» con 18 playeras polo talla 12 y un PE- con 2 pants talla 14 apartados.
- **Un lote por cortar** cuya receta lleva 60 botones y en Bodega solo hay 50.
- **Las cuentas:** la dueña (Dirección), Aduana, Bodega y el encargado del taller.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Aduana · Despachar | El A- de 24 a Bodega → `inventario.despachar` | El D- en tránsito, a cargo de Aduana |
| 2 | Bodega · Llegada de aduana | Cuenta 22: «Llegó con diferencias» → `inventario.recibir_despacho` | 22 entran a Bodega; las 2 que faltan se quedan en Tránsito y nace la DF- de recepción, por aclarar, a cargo de Aduana: «Aduana mandó 24 en {D} y Bodega recibió 22» |
| 3 | Bodega · Aclarar | Las 2 aparecieron en la mesa de Aduana: «No salió», con motivo → `inventario.aclarar_diferencia` | «{DF} aclarada: 2 piezas en aduana en {A}»: regresan de Tránsito a Aduana en un A- nuevo, listas para salir otra vez |
| 4 | Bodega · Pendientes | Un pant talla 14 del PE- no está: «No la encuentro» → `inventario.no_la_encuentro` | Nace la DF- `no_la_encontro`, por contar; la reserva se libera y esa pieza vuelve a lo que falta mandar del pedido |
| 5 | Bodega · Conteo de diferencia | Cuenta a ciegas el pant talla 14: había uno menos. «Guardar y pedir ajuste», motivo «Extravío» → `inventario.guardar_conteo` | «{AJ}: 1 diferencia espera autorización de Dirección»; la pantalla nunca mostró lo que decía el sistema |
| 6 | Bodega · Nuevo conteo | La sección «Playeras»: cuenta 17 de la talla 12, a las 9:00 → `inventario.guardar_conteo` | Otro AJ- por −1, con lo que decía el sistema a esa hora |
| 7 | Bodega | Antes de que se autorice, entran 5 playeras talla 12 de un despacho | La existencia sube a 23; el AJ- sigue diciendo −1 |
| 8 | Dirección · Autorizaciones | Autoriza los dos → `direccion.decidir_autorizacion` | «{AJ} autorizado: se movió la diferencia»: cada uno mueve su −1 a Fuera, con su motivo; las playeras quedan en 22, lo que de verdad hay, no en 17; las DF- resueltas por ajuste |
| 9 | Bodega · Entrega al corte | Entrega el lote: los botones no alcanzan → `inventario.entregar_al_corte` | «… No cuadró 10 de botón: queda en diferencias»: la DF- `material_corte`, a cargo de Bodega |
| 10 | Compras y Bodega | Llegan los botones de la orden y entran a Bodega. «Aclarar»: «Ya se cubrió» → `inventario.aclarar_diferencia` | La DF- aclarada, sin movimiento, porque la existencia ya no es negativa |
| 11 | El cuadre de la noche | Una existencia de la sección queda negativa sin DF- (preparada en la prueba) | Nace la DF- `cuadre`, por contar, en esa ubicación |

## Lo que tiene que cuadrar al final

- **Las diferencias:** ninguna abierta de las de este flujo, salvo la del cuadre; cada una con su aclaración o su ajuste, quién y cuándo.
- **Los ajustes:** cada AJ- movió la diferencia que se vio al contar, no la de hoy; los dos con su autorización y su motivo de la lista.
- **El inventario:** la existencia de cada ubicación es la suma del libro; Tránsito sin las 2 playeras; el A- nuevo en aduana con ellas.
- **El traspaso del paso 2:** queda `con_diferencia` aunque se aclaró: dice que la tuvo.
- **El pedido:** el pant que no se encontró volvió a lo que falta mandar.

## Lo que sale mal

- **Aclarar una que nace por contar:** `no_por_aclarar`; se cuenta.
- **«Venía en otro» sin su espejo,** o con uno de otra prenda: «Escoge con qué diferencia se cruzó.» o `espejo_no_corresponde`.
- **Ajustar sin motivo:** «Todo ajuste necesita motivo».
- **Dirección rechaza el ajuste:** la existencia no cambia y la DF- regresa a por contar (o por aclarar, si era de recepción).
- **Contar en una tienda o en el Taller:** `ubicacion_no_contable`.
- **Contar una diferencia que ya no está por contar:** `diferencia_no_por_contar`.
- **Aclarar como «Ya se cubrió» un material que sigue en negativo:** `sigue_en_negativo`.
- **Dos personas aclaran la misma DF- a la vez:** una gana; la otra recibe `409` con lo nuevo.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
