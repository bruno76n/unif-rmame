# Unifórmame

> **Qué cubre:** lo que todo agente necesita para trabajar en este repositorio: qué es Unifórmame, el modo y las órdenes vigentes, cómo se trabaja, dónde está cada cosa, los comandos y las reglas.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](docs/fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [CLAUDE.md](CLAUDE.md) · [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md) · [revisión de fase](docs/trabajo/REVISION-DE-FASE.md) · [índice](docs/INDICE.md) · [glosario](docs/GLOSARIO.md) · [decisiones](docs/DECISIONES.md) · [reglas de código](.claude/rules/codigo.md) · [estructura](docs/cimientos/ESTRUCTURA.md) · [arquitectura](docs/cimientos/ARQUITECTURA.md) · [proyecto](docs/PROYECTO.md) · [las fases](docs/fases/FASES.md) · [bitácora](docs/registros/BITACORA.md)

## Qué es

Unifórmame es el sistema a la medida de la fábrica de uniformes escolares Uniformes Alameda. Lleva cada departamento de la fábrica (Dirección, Compras, Producción, Aduana, Bodega, Ventas, Contaduría y los demás), la tablet del taller y, después, la caja de las tiendas y la tienda en línea uniformame.mx, todo sobre una sola API y una sola base de datos.

Qué es, para quién y qué entra está en [PROYECTO.md](docs/PROYECTO.md).

## Modo y órdenes vigentes

**Modo: autónomo.** Cada cambio de modo es una orden nueva aquí, con su fecha. Qué hace cada modo está en [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md#modos).

| # | Orden | Desde | Decisión |
|---|---|---|---|
| 1 | El sistema se llama Unifórmame y el repositorio, `uniformame/`. | 8 nov 2026 | 154 |
| 2 | Git: una rama por fase, un commit chico por cada parte terminada, la revisión completa antes del merge, y un merge que conserva los commits. | 8 nov 2026 | 171 |
| 3 | Nombres en español, sin acentos ni ñ, en todo el código: tablas, columnas, acciones, variables, funciones y tipos. Comentarios y documentación del código, en español. | 9 nov 2026 | 162 |
| 4 | Ningún dato del negocio en la lógica: cada valor u opción del negocio es un parámetro con su valor inicial, que solo la dueña cambia. | 7 nov 2026 | 105 |
| 5 | Bucle de resolución por problema: hasta tres intentos con enfoques distintos; al tercero, en modo supervisado se pregunta y en autónomo se decide y se anota. | 9 nov 2026 | 164 |
| 6 | Los registros (bitácora, sesiones, `REGISTROS.md`, «Cómo está hecho») nunca cuentan como error del código: si falta algo, se escribe y ya. | 9 nov 2026 | 165 |
| 7 | Documentación oficial primero, y todo en local hasta lanzar. | 8 nov 2026 | 172 |
| 8 | Modo supervisado; la reemplaza la orden 11. | 9 nov 2026 | 174 |
| 9 | Se trabaja en sesiones de Claude Code en la nube, sobre el repositorio de GitHub; la Mac, cuando Bruno decida. | 10 nov 2026 | 319 |
| 10 | En la nube, cada commit se empuja en seguida, y `main` solo cambia al cerrar la fase, con el visto bueno de Bruno. | 10 nov 2026 | 321 |
| 11 | Modo autónomo, hasta el final: sin esperar el «sí» de cada parte ni de cada fase; lo decidido se anota en «Decisiones autónomas». | 10 nov 2026 | 323 |

Cada orden es también una decisión, con su porqué, en [DECISIONES.md](docs/DECISIONES.md).

## Al empezar cada sesión

1. Lee la última línea de la [bitácora](docs/registros/BITACORA.md) y el archivo de la última sesión.
2. Abre el archivo de tu sesión en `docs/registros/sesiones/`.
3. Ubica la fase y la parte en [FASES.md](docs/fases/FASES.md) y lee el archivo de la fase.
4. Lee los archivos que dice el «Leer:» de tu parte, completos, antes de escribir una línea.
5. En la nube, trabaja en la rama de la fase: la que anotó la última sesión de la fase, o la que te dio la nube si la fase empieza ahora (ver [las ramas en la nube](docs/trabajo/FORMA-DE-TRABAJO.md#las-ramas-en-la-nube)).

## Principios que nunca se rompen

Cada uno, con su porqué, en [PROYECTO.md](docs/PROYECTO.md#principios).

1. Los archivos de creación son la fuente de verdad: lo que no está escrito no se construye.
2. El inventario es la suma de movimientos; toda pieza está en un solo lugar y nada pasa de un lugar a otro sin que lo confirmen los dos lados.
3. Nada se borra: se cancela, se da de baja o se corrige con otro documento ligado.
4. Una acción es una transacción, con su clave de idempotencia, su bitácora y sus eventos.
5. Dinero en centavos; fechas de negocio en hora de México.
6. Nadie ve ni hace más de lo que su cuenta permite; la base nunca se expone.
7. Ningún dato del negocio en la lógica.

## Cómo se construye

- **Una fase es una parte del sistema** y se cierra solo en verde; una parte a la vez.
- **El ciclo de cada parte:** plan sin código → pruebas en rojo → construir hasta el verde → «Cómo está hecho» al día → revisión completa con sello → registros → commit chico.
- **Si algo falla:** bucle de resolución sobre ese problema, comprobando solo ese problema. La revisión completa no es la herramienta para ir arreglando.
- **Antes de escribir código, la escalera:** ¿lo pide el archivo de creación? ¿Ya existe en el repositorio? ¿Lo trae la plataforma? ¿Lo trae una librería del stack? Solo entonces, el mínimo código que cumple.

Todo el detalle: [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md) y [revisión de fase](docs/trabajo/REVISION-DE-FASE.md).

## Reglas por tipo de archivo

Claude Code las carga solas al tocar ese tipo de archivo. Cualquier otro agente las lee antes de crear o editar uno:

| Regla | Para | En pocas palabras |
|---|---|---|
| [código](.claude/rules/codigo.md) | todo `.ts` y `.tsx` | TypeScript estricto, nombres en español, la escalera, nada duplicado ni muerto, todo documentado en español con TSDoc |
| [documentos](.claude/rules/documentos.md) | `docs/`, `AGENTS.md`, `CLAUDE.md` | encabezado de cuatro líneas, un dato en un solo lugar, cada archivo se entiende solo, enlaces que funcionan |
| [base de datos](.claude/rules/base-de-datos.md) | esquema y migraciones | uuid v7, centavos, `version`, nada se borra, dueño de cada tabla, nunca editar una migración aplicada |
| [pruebas](.claude/rules/pruebas.md) | `*.prueba.ts` | cada caso dice qué criterio demuestra; Postgres real; nada de trampas para llegar al verde |
| [contratos](.claude/rules/contratos.md) | contratos Zod | una sola forma para la API, la web y la tablet |
| [react](.claude/rules/react.md) | pantallas | componentes del sistema de diseño, textos de la guía, todos los estados |

## Dónde está cada cosa

- **Qué construir:** [FASES.md](docs/fases/FASES.md) y el archivo de cada fase.
- **Cómo funciona cada cosa:** `docs/cimientos/` (lo que usa todo el sistema), `docs/modulos/` (cada módulo), `docs/interfaz/` (pantallas), `docs/apps/`, `docs/impresos/` y `docs/flujos/`.
- **Todos los archivos, con una línea cada uno:** [INDICE.md](docs/INDICE.md).
- **Las palabras del negocio:** [GLOSARIO.md](docs/GLOSARIO.md).
- **El código:** el árbol completo está en [ESTRUCTURA.md](docs/cimientos/ESTRUCTURA.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala todo el monorepo |
| `pnpm local` | Levanta todo en local: la base en Docker, la API, el worker, la web y la tablet |
| `pnpm revision:rapida` | Estilo, tipos y pruebas de lo cambiado |
| `pnpm revision` | La revisión completa; en verde, guarda el sello |
| `pnpm pruebas` | Todas las pruebas |
| `pnpm base:migrar` · `pnpm base:sembrar` | Aplica las migraciones · carga los datos de la muestra |
| `pnpm docs:revisar` | Encabezados, enlaces y conexiones de los archivos de creación |
| `pnpm api:documentar` | Genera `openapi.json` desde los contratos |
| `pnpm puente:empaquetar` | Arma el ejecutable del puente de impresión |

Cómo funciona cada uno está en [ESTRUCTURA.md](docs/cimientos/ESTRUCTURA.md#comandos).

## Al terminar una parte

1. «Cómo está hecho» y los archivos de creación que cambiaron, al día.
2. `pnpm revision` en verde.
3. Su línea en la bitácora y lo que toque en `REGISTROS.md`.
4. Commit chico en la rama de la fase; en la nube, se empuja en seguida.
5. Di qué se dejó fuera o qué no se revisó.

## Prohibido siempre

Reescribir la historia de la rama principal, saltarse los ganchos, debilitar o borrar una prueba para llegar al verde, poner un secreto en el código y tocar otros proyectos de la computadora.
