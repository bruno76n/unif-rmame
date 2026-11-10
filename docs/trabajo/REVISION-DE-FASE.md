# La revisión de fase

> **Qué cubre:** cómo se audita y se cierra cada fase: quién audita, los seis puntos con su evidencia, cómo se clasifica cada hallazgo, las fases delicadas con varios auditores y el desmentidor, la revisión más ligera de la interfaz y el cierre.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../../AGENTS.md) · [CLAUDE.md](../../CLAUDE.md) · [forma de trabajo](FORMA-DE-TRABAJO.md) · [auditor](../../.claude/agents/auditor.md) · [desmentidor](../../.claude/agents/desmentidor.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md) · [fases](../fases/FASES.md) · [trabajador](../../.claude/agents/trabajador.md)

## Cuándo

Cuando todas las partes de la fase ya están construidas, cada una con su revisión completa en verde y su commit. La auditoría es de la fase entera, no de una parte.

## Quién audita

1. **Con contexto limpio:** el subagente [auditor](../../.claude/agents/auditor.md) o una sesión nueva, que no escribió el código.
2. **Solo informa:** quien audita no corrige, y quien corrige no se audita.
3. **Lo corregido lo revisa un revisor distinto** del que encontró el hallazgo.

## Los seis puntos

Cada punto lleva su evidencia: el archivo y la línea, la prueba que lo demuestra o el comando y su salida.

1. **Hace lo que tiene que hacer:** cada criterio de terminado del archivo de la fase tiene su prueba, y la prueba demuestra el criterio, no otra cosa.
2. **Conecta con lo que tiene que conectar:** cada «Se conecta con» de sus archivos de creación se cumple en el código (llama a quien debe, con lo que debe).
3. **No tiene errores:** las pruebas pasan, y los casos límite que dicen los archivos de creación están probados.
4. **El código está bien hecho y es coherente:** sigue la [regla de código](../../.claude/rules/codigo.md), no tiene nada duplicado ni muerto, está documentado en español, y no hay nada que ya existía y se debió reusar.
5. **Nada inseguro:** permisos revisados en el servidor, nada que la cuenta no deba ver, ningún secreto en el código, validación en cada entrada.
6. **Los archivos de creación están al día:** lo construido coincide con lo escrito y cada parte tiene su «Cómo está hecho».

## Cómo se clasifica cada hallazgo

- **Bloqueante:** impide cerrar la fase.
- **Debe:** se corrige si es de la fase; si es de otra, va a «Pendientes» de `REGISTROS.md` con la fase que lo resuelve.
- **Podría:** se anota y no detiene nada.

Un archivo de creación desactualizado nunca es bloqueante, y los registros (bitácora, sesiones, `REGISTROS.md`) nunca son hallazgo del código: si les falta algo, se escribe.

Cada hallazgo que se corrige pasa por el [bucle de resolución](FORMA-DE-TRABAJO.md#el-bucle-de-resolución). Cuando todos están resueltos, la revisión completa corre una vez.

## Tres tamaños de revisión

| Fase | Quién revisa | Qué mira de más |
|---|---|---|
| **Normal** | Un auditor | Los seis puntos |
| **Delicada ●** (3, 5, 6, 7, 9, 14, 15, 17, 22 y 23) | Varios auditores, cada uno un pedazo, y el [desmentidor](../../.claude/agents/desmentidor.md) | Cada auditor toma un tema: dinero, permisos y datos personales, inventario, sincronización o secretos. El desmentidor intenta desmentir cada hallazgo, y solo lo confirmado llega al reporte |
| **Interfaz** (19 y 20) | El [revisor de diseño](../../.claude/agents/revisor-diseno.md) y un auditor, sin desmentidor | El revisor compara cada pantalla con la muestra (capturas), los textos con la guía, los estados (cargando, vacío, error, sin permiso, sin conexión) y cómo se ve en el teléfono. El auditor revisa que ninguna pantalla tenga reglas del negocio, que no pida datos que la cuenta no debe ver y que el código siga su estructura |

La interfaz se revisa más ligero porque casi todos sus errores se ven a simple vista y la lógica ya está probada en la API.

## El reporte de auditoría

Un hallazgo por renglón:

| # | Punto | Clasificación | Qué pasa | Evidencia | Propuesta |
|---|---|---|---|---|---|
| 1 | 5 · Nada inseguro | Bloqueante | `ventas.cancelar_pedido` no revisa el permiso de Ventas | `apps/api/src/modulos/ventas/acciones/cancelar-pedido.ts:31`; la prueba `cancelar-pedido.prueba.ts` no cubre una cuenta sin permiso | Revisar el permiso antes de abrir la transacción y agregar la prueba |

Al final, el auditor dice qué no pudo revisar y por qué.

## El cierre

1. Todos los hallazgos bloqueantes y «debe» de la fase, resueltos y revisados por un revisor distinto.
2. La rama de la fase se une con la principal y corre la revisión completa sobre esa unión.
3. La fase se marca como terminada en [FASES.md](../fases/FASES.md).
4. Se integra con un merge que conserva los commits.
5. El reporte de cierre: qué se hizo, cómo y por qué, las decisiones nuevas y los pendientes, con su línea en la bitácora.

**En la nube,** la unión se hace en la máquina de la sesión, y `main` se empuja a GitHub cuando todo está en verde y Bruno da su visto bueno (ver [las ramas en la nube](FORMA-DE-TRABAJO.md#las-ramas-en-la-nube)).

## Cómo está hecho

**Fase 1.**

- **Cómo se lanza la auditoría:** la sesión principal lanza un subagente nuevo, sin el contexto de la sesión, con la orden de leer y seguir [auditor](../../.claude/agents/auditor.md). Le pasa la rama, el commit base de la fase (`git diff` contra la rama principal; en la fase 1, contra el commit de los archivos de creación, porque `main` todavía no existía) y lo que no puede correr (`pnpm revision`, que sella, ni `pnpm install`). El auditor solo lee y corre pruebas, y entrega su reporte como respuesta.
- **Dónde quedan los reportes:** en `docs/registros/auditorias/AAAA-MM-DD-fase-NN.md`, con una columna más que dice qué se hizo con cada hallazgo. Son registros: no entran a la huella del sello y `pnpm docs:revisar` no revisa su contenido.
- **El revisor distinto:** lo corregido lo revisa otro subagente sin contexto, que recibe solo la lista de hallazgos y el `git diff` de las correcciones.
