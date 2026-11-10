# Fase 01: Repositorio, reglas y paquete compartido

> **Etapa:** Cimientos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 2](02-base-de-datos-y-pruebas.md)

## Objetivo

El repositorio queda listo para trabajar como dice la forma de trabajo: el monorepo con sus versiones fijas, las revisiones rápida y completa con su sello, los ganchos de git y de Claude Code, el interruptor de modo, y el paquete compartido con el dinero y las fechas probados.

## Depende de

- Nada: es la primera fase. Los archivos de creación ya están en `docs/`, en `AGENTS.md`, en `CLAUDE.md` y en `.claude/`.
- En la nube, el entorno «Unifórmame» ya deja Node y pnpm con sus versiones exactas (ver [el entorno de la nube](../trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube)).

## Qué se construye

### Parte 1 · El monorepo y sus herramientas

**Construye:** el workspace de pnpm con `apps/` y `packages/`; el `package.json` raíz con las versiones exactas del stack, sin `^`; `tsconfig.base.json` estricto con sintaxis borrable; Biome; Vitest; `.env.ejemplo`; `.gitignore` (`.env`, `.revision/`, `.claude/worktrees/`, `node_modules/`). Solo las carpetas que esta fase usa: las demás nacen en la fase que las llena.

**Leer:**
- [arquitectura](../cimientos/ARQUITECTURA.md) — el stack con sus versiones exactas y por qué TypeScript corre sin compilar.
- [estructura](../cimientos/ESTRUCTURA.md) — el árbol, los nombres de archivo y lo que no se crea.
- [regla de código](../../.claude/rules/codigo.md) — TypeScript estricto y nombres en español.
- [el entorno de la nube](../trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube) — el script que pide las mismas versiones de Node y pnpm.

### Parte 2 · Las revisiones, el sello y los ganchos de git

**Construye:** `pnpm revision:rapida`, `pnpm revision` y `pnpm pruebas` en `scripts/`; la búsqueda de secretos de la revisión completa; el sello en `.revision/` con la huella de lo revisado sin `docs/registros/`; el gancho de git antes de cada commit en `.githooks/`, que `pnpm install` deja activo con `core.hooksPath`, con sus tres casos (solo registros, solo documentos, código).

**Leer:**
- [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#los-verdes) — qué revisa cada revisión, el sello y los registros que no cuentan como error.
- [estructura](../cimientos/ESTRUCTURA.md#comandos) — cada comando, el orden de la revisión completa y el gancho de git.
- [seguridad](../cimientos/SEGURIDAD.md#secretos-y-variables-de-entorno) — qué busca la búsqueda de secretos.

### Parte 3 · La revisión de los archivos de creación

**Construye:** `pnpm docs:revisar`: el encabezado de cuatro líneas (y el de las fases), los enlaces relativos y sus anclas, las conexiones en los dos sentidos y que cada archivo esté en el índice. Corre sobre todos los archivos de `docs/`, `AGENTS.md`, `CLAUDE.md` y `.claude/`, sin revisar el contenido de los registros. Lo que encuentre en los archivos que ya están se arregla en el momento.

**Leer:**
- [regla de documentos](../../.claude/rules/documentos.md) — lo que se revisa en automático.
- [índice](../INDICE.md) — la lista contra la que se revisa.

### Parte 4 · Claude Code: ganchos, modo y worktrees

**Construye:** `.claude/settings.json` con el gancho de inicio (en la nube, `pnpm install`, que deja activo el gancho de git; fuera de la nube no hace nada), el gancho después de editar (revisión rápida de lo cambiado) y el gancho de fin (revisión rápida y conteo de intentos por problema, en un archivo de estado que no entra a git); el interruptor `.claude/modo` en `supervisado`; `worktree.baseRef: "head"`; `.worktreeinclude`. Al tercer intento fallido sobre el mismo problema, el gancho de fin lee el modo y pide el protocolo que corresponde.

**Leer:**
- [CLAUDE.md](../../CLAUDE.md) — los subagentes, los ganchos y los worktrees.
- [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#el-bucle-de-resolución) — el bucle de resolución por problema y los dos modos.
- [el entorno de la nube](../trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube) — el gancho de inicio.

### Parte 5 · El paquete compartido: dinero y fechas

**Construye:** `packages/compartido` con los tipos base (`Centavos`, `DiaNegocio`, `Momento`, `Uuid`) y los cálculos de dinero (`pesosACentavos`, `centavosATexto`, `aPesoEntero`, `aplicarPorcentaje`, `repartir`) y de fechas (día de negocio en hora de México, semanas que empiezan en lunes, días hábiles con los días de trabajo que se le pasen), con sus pruebas de datos al azar.

**Leer:**
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) — las reglas de lo puro, el dinero, el redondeo y las fechas.
- [regla de pruebas](../../.claude/rules/pruebas.md) — cada caso dice qué criterio demuestra.

## Cómo se construye

- Una parte a la vez, con el ciclo de la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#el-ciclo-de-cada-parte). Un solo agente: los cimientos no se reparten.
- Cada script de `scripts/` lleva sus pruebas con un repositorio de prueba en una carpeta temporal: así se demuestra que el gancho rechaza lo que debe rechazar.
- Las herramientas se configuran con su documentación oficial actual; cada lectura va en las Fuentes del plan.
- No va en esta fase: la base de datos, la API ni ninguna pantalla.

## Excepciones permitidas

- La revisión completa corre en esta fase con los pasos que ya existen. Las migraciones desde cero entran en la fase 2; `openapi.json` al día, en la fase 3; las pruebas de punta a punta, en la fase 19.
- El cliente de la API del paquete compartido se construye en la fase 3, con el protocolo.
- El script que revisa las carpetas de cada trabajador se construye en la fase 19.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| `pnpm install` instala exactamente las versiones de la arquitectura y ninguna lleva rango; el script del entorno de la nube pide las mismas de Node y pnpm | `scripts/versiones.prueba.ts`: compara `package.json` y el script del entorno con la tabla del stack, y falla si una versión lleva `^` o `~` o no coincide |
| La revisión rápida falla con un error de tipos, un `any` o un error de estilo en lo cambiado, y pasa sin ellos | `scripts/revision-rapida.prueba.ts`, con archivos de ejemplo en un repositorio temporal |
| La revisión completa en verde guarda el sello con la huella de lo revisado, y escribir en `docs/registros/` no cambia la huella | `scripts/sello.prueba.ts` |
| El gancho de git rechaza un commit de código sin sello vigente, deja pasar uno con sello, uno de solo registros y uno de solo documentos con `pnpm docs:revisar` en verde, y rechaza uno de documentos con un enlace roto | `scripts/gancho-git.prueba.ts`, en un repositorio temporal con el gancho activado |
| `pnpm docs:revisar` encuentra un encabezado incompleto, un enlace roto, un ancla que no existe, una conexión de un solo lado y un archivo fuera del índice; sobre los archivos reales sale en verde | `scripts/docs-revisar.prueba.ts`, con un archivo de ejemplo por cada error; y la corrida sobre `docs/` en la revisión completa |
| El gancho de inicio, en la nube, instala las dependencias y deja `core.hooksPath` en `.githooks`; fuera de la nube no hace nada | `scripts/gancho-inicio.prueba.ts`, en un repositorio temporal, con y sin `CLAUDE_CODE_REMOTE=true` |
| El gancho de fin cuenta los intentos por problema y, al tercero, pide preguntar en `supervisado` y decidir y anotar en `autonomo` | `scripts/gancho-fin.prueba.ts`, con salidas de revisión simuladas y los dos modos |
| El dinero nunca pierde ni sobra un centavo: `repartir` suma exactamente el total; `aPesoEntero` siempre da múltiplos de 100; `pesosACentavos` rechaza lo que no es dinero | `packages/compartido/src/calculos/dinero.prueba.ts`, con fast-check |
| El día de negocio sale en hora de México: un momento de las 23:30 de México es de ese día; las semanas empiezan en lunes; los días hábiles saltan los días que no son de trabajo | `packages/compartido/src/calculos/fechas.prueba.ts`, con fast-check y casos fijos |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
