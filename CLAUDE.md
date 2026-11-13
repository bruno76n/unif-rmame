@AGENTS.md

# Solo para Claude Code

> **Qué cubre:** lo que solo usa Claude Code: sus subagentes, sus ganchos, sus reglas por tipo de archivo y los worktrees. Todo lo común está en `AGENTS.md`, que este archivo importa en su primera línea.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](docs/fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](AGENTS.md) · [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md) · [revisión de fase](docs/trabajo/REVISION-DE-FASE.md) · [reglas de código](.claude/rules/codigo.md) · [decisiones](docs/DECISIONES.md) · [índice](docs/INDICE.md) · [glosario](docs/GLOSARIO.md) · [bitácora](docs/registros/BITACORA.md) · [las fases](docs/fases/FASES.md)

## Subagentes

Viven en `.claude/agents/`. Cuándo se usa cada uno está en la [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](docs/trabajo/REVISION-DE-FASE.md).

| Subagente | Para qué | Puede escribir |
|---|---|---|
| [auditor](.claude/agents/auditor.md) | Audita una fase con contexto limpio, con los seis puntos y su evidencia | No |
| [desmentidor](.claude/agents/desmentidor.md) | En las fases delicadas, intenta desmentir lo que encontraron los auditores | No |
| [revisor-diseno](.claude/agents/revisor-diseno.md) | Compara cada pantalla construida contra la muestra, con capturas | No |
| [trabajador](.claude/agents/trabajador.md) | Construye una parte en paralelo, en su propio worktree, solo en sus carpetas | Sí, en su worktree |

## Ganchos

Están en `.claude/settings.json` y en `.githooks/`; se construyen en la fase 1. Qué revisa cada revisión está en la [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md#los-verdes).

- **Al empezar cada sesión en la nube (gancho de inicio):** `pnpm install`, que deja activo el gancho de git; fuera de la nube no hace nada. El entorno de la nube está en la [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube).
- **Después de editar un archivo:** la revisión rápida de lo cambiado, en el repositorio del archivo: el del proyecto o el worktree del trabajador que lo editó.
- **Al terminar cada turno (gancho de fin):** la revisión rápida y el conteo de intentos por problema. Al tercer intento fallido sobre el mismo problema, el gancho lee el modo en `.claude/modo` y pide aplicar el protocolo: en supervisado, detenerse y preguntar; en autónomo, decidir y anotar.
- **Antes de cada commit (git):** el commit sin sello vigente no entra. La huella del sello no incluye los registros, así que escribirlos después de la revisión no la invalida.

## Reglas por tipo de archivo

Viven en `.claude/rules/` y se cargan solas cuando Claude Code toca un archivo de ese tipo. La lista con su resumen está en `AGENTS.md`.

## Worktrees

Para construir en paralelo (sobre todo en la fase 19):

- Los trabajadores corren con `isolation: worktree` y salen de la rama de la fase (`worktree.baseRef: "head"` en `.claude/settings.json`).
- `.worktreeinclude` copia `.env` a cada worktree.
- `.claude/worktrees/` va en `.gitignore`.

Las reglas para que los trabajadores no choquen están en la [forma de trabajo](docs/trabajo/FORMA-DE-TRABAJO.md#trabajo-en-paralelo).
