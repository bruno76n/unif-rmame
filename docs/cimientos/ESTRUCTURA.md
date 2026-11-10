# Estructura del repositorio

> **Qué cubre:** el monorepo `uniformame/`: el árbol completo, dónde va cada cosa, cómo se arma por dentro un módulo de la API y una pantalla, qué carpetas no se crean y los comandos.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../../AGENTS.md) · [arquitectura](ARQUITECTURA.md) · [módulos](MODULOS.md) · [paquete compartido](PAQUETE-COMPARTIDO.md) · [reglas de código](../../.claude/rules/codigo.md) · [trabajador](../../.claude/agents/trabajador.md) · [sistema de diseño](../interfaz/DISENO.md) · [etiquetas](../impresos/etiquetas.md) · [hojas](../impresos/hojas.md)

## El árbol

```text
uniformame/
├── AGENTS.md                  lo común para cualquier agente
├── CLAUDE.md                  importa AGENTS.md y agrega lo de Claude Code
├── package.json               los comandos del monorepo y las versiones fijas
├── pnpm-workspace.yaml
├── tsconfig.base.json         TypeScript estricto, compartido por todos
├── biome.json
├── .env.ejemplo               variables de entorno, sin valores reales
├── .worktreeinclude           copia .env a cada worktree
├── .githooks/                 ganchos de git (core.hooksPath)
├── .claude/
│   ├── settings.json          ganchos de Claude Code y worktree.baseRef
│   ├── modo                   supervisado | autonomo
│   ├── rules/                 reglas por tipo de archivo
│   └── agents/                auditor, desmentidor, revisor-diseno, trabajador
├── .revision/                 el sello de la última revisión completa (no entra a git)
├── docs/                      los archivos de creación
│   ├── PROYECTO.md · GLOSARIO.md · DECISIONES.md · INDICE.md
│   ├── fases/                 FASES.md y un archivo por fase
│   ├── trabajo/               la forma de trabajar y la revisión de fase
│   ├── cimientos/             lo que usa todo el sistema
│   ├── modulos/<modulo>/      un archivo por tema de cada módulo
│   ├── interfaz/              diseño, textos, pantallas y la muestra
│   ├── apps/                  la tablet y el puente de impresión
│   ├── impresos/              hojas y etiquetas
│   ├── flujos/fabrica/        los flujos de punta a punta
│   └── registros/             bitácora, REGISTROS.md y sesiones/
├── apps/
│   ├── api/                   la API y el worker
│   ├── web/                   las pantallas de la fábrica
│   ├── tablet/                la Puerta del taller
│   └── puente/                el programa puente de impresión
├── packages/
│   ├── compartido/            contratos, tipos, cálculos puros y el cliente de la API
│   └── interfaz/              el sistema de diseño
├── pruebas/                   las pruebas de punta a punta y los flujos
└── scripts/                   revisión, sello, docs:revisar y carpetas de trabajadores
```

Cuando llegue el POS, entra como `apps/caja/`, con su módulo `tiendas` en la API. uniformame.mx será su propio proyecto que habla con la API.

## La API por dentro

```text
apps/api/
├── src/
│   ├── servidor.ts            arranca Fastify y registra los módulos
│   ├── trabajos.ts            arranca el worker (Graphile Worker)
│   ├── impresos/              el dibujo de cada etiqueta y cada hoja (ZPL y PDF); los datos los da su módulo
│   ├── nucleo/                lo que usan todos los módulos
│   │   ├── entorno.ts         lee y valida las variables de entorno, una sola vez
│   │   ├── base/              conexión, transacciones con reintento y candados
│   │   ├── http/              rutas de acciones y consultas, errores y recorte
│   │   ├── acceso/            sesión, llave del aparato y revisión de permisos
│   │   ├── idempotencia/      la clave de cada acción y la respuesta guardada
│   │   ├── sincronizacion/    subir, bajar, foto y avisos en vivo
│   │   ├── trabajos/          el reloj y el proceso de la bandeja de eventos
│   │   └── modulos.ts         encuentra y registra cada carpeta de modulos/
│   └── modulos/
│       └── <modulo>/          admin, personal, direccion, catalogo, patronaje, compras, ventas,
│                              produccion, calidad, mantenimiento, inventario, contaduria, linea
├── migraciones/               el SQL que genera drizzle-kit; nunca se edita una aplicada
├── semillas/                  los datos de la muestra para local y pruebas
└── openapi.json               generado desde los contratos; entra a git para ver qué cambió
```

### Un módulo por dentro

Cada módulo es dueño de sus tablas y de nada más. Las reglas de cómo se escribe están en [módulos](MODULOS.md).

```text
apps/api/src/modulos/inventario/
├── index.ts                   registra el módulo: sus acciones, consultas, internas, lecturas, trabajos, parámetros, bajada y tipos de impresión
├── tablas.ts                  sus tablas en Drizzle; solo las suyas
├── parametros.ts              las claves de sus parámetros con su valor inicial
├── permisos.ts                qué departamentos leen cada tabla (para los avisos en vivo) y qué campos se recortan
├── bajada.ts                  lo que baja a cada tipo de aparato: sus tablas, su filtro, sus columnas y su orden
├── acciones/                  una acción pública por archivo: recibir-traspaso.ts
├── internas/                  lo que ofrece a otros módulos: reservar.ts
├── consultas/                 una consulta por pantalla, pestaña o cajón: existencias.ts
├── lecturas/                  lecturas para otros módulos: libres.ts
├── trabajos/                  sus trabajos programados: cuadre-nocturno.ts
└── dominio/                   lo que comparten sus propias acciones e internas y nadie de fuera importa: escribir-movimiento.ts
```

- **Nombres de archivo** en minúsculas, sin acentos ni ñ, con guiones: el archivo de `inventario.recibir_traspaso` es `acciones/recibir-traspaso.ts`.
- **Las pruebas van junto al código**, con el mismo nombre y `.prueba.ts`: `acciones/recibir-traspaso.prueba.ts`.
- **`dominio/` es privado del módulo:** otro módulo nunca lo importa; si necesita algo, llama a una interna o a una lectura del dueño (ver [módulos](MODULOS.md#las-reglas)).
- **Nadie edita una lista central.** `nucleo/modulos.ts` lee las carpetas de `modulos/` al arrancar y registra lo que exporta cada `index.ts`. Agregar un módulo o una acción no toca ningún archivo de otro.

## Las pantallas por dentro

```text
apps/web/src/
├── main.tsx
├── rutas/                     rutas por archivo de TanStack Router; el árbol se genera solo
│   ├── __root.tsx             el armazón
│   ├── acceso.tsx             la pantalla de entrada
│   └── <depto>/
│       ├── index.tsx          Pendientes
│       └── <pestana>.tsx      una por pestaña
├── departamentos/<depto>/
│   ├── menu.ts                su entrada del menú: grupo, ícono, orden y acción principal
│   ├── pestanas/              una pestaña por archivo
│   ├── cajones/               un cajón por archivo
│   └── ventanas/              una ventana por archivo
└── comun/                     lo que comparten todos: menú, barra superior, búsqueda, avisos de la cuenta, sesión
```

- **Una ruta solo arma la pantalla:** lee los filtros de la dirección, llama a la consulta del contrato con TanStack Query y entrega los datos a su pestaña. Ninguna regla del negocio vive aquí.
- **El menú se arma solo** con los `menu.ts` de cada carpeta (`import.meta.glob` de Vite). La cuenta solo ve los departamentos que tiene.
- **Los componentes** salen de `packages/interfaz`; la carpeta de un departamento no define botones, tablas ni colores propios. Las reglas están en la [regla de pantallas](../../.claude/rules/react.md).
- La tablet (`apps/tablet/src/`) sigue la misma idea con `pantallas/`, `cola/` (lo guardado sin internet), `copia/` (lo que bajó), `sincronizacion/`, `registro/` y `pin/` (ver [la tablet](../apps/tablet.md)).
- El puente (`apps/puente/src/`) lleva `registro/`, `trabajos/`, `zebra/` y `diario/` (ver [puente de impresión](../apps/puente-de-impresion.md)).
- Los dibujos de `apps/api/src/impresos/` van en `etiquetas/` y `hojas/`, uno por archivo, con lo común del ZPL y del PDF: reciben datos ya listos y no consultan nada, como una pantalla (ver [etiquetas](../impresos/etiquetas.md#cómo-se-arman)).

## El paquete compartido por dentro

```text
packages/compartido/src/
├── contratos/<modulo>/        un contrato Zod por acción y por consulta
├── calculos/                  funciones puras: dinero, fechas, cuenta de material, precio sugerido…
├── tipos/                     los tipos que salen de los contratos
└── cliente/                   el cliente de la API con tipos (lo usan la web y la tablet)
```

Qué va en cada uno está en el [paquete compartido](PAQUETE-COMPARTIDO.md).

## Qué no se crea

- Carpetas de cajón de sastre: `utils/`, `helpers/`, `lib/`, `common/`, `misc/`, `services/`. Si algo no sabe dónde va, es una pregunta para el plan.
- Carpetas `__tests__`: las pruebas van junto a su código, y las de punta a punta en `pruebas/`.
- Archivos que solo reexportan lo de otros.
- Una tabla, una acción o un cálculo en un módulo que no es su dueño.
- Nombres en inglés para cosas del negocio.

## Comandos

Todos se corren desde la raíz.

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala todo el monorepo con las versiones fijas |
| `pnpm local` | Levanta Postgres en Docker, aplica las migraciones y arranca la API, el worker, la web y la tablet con recarga al guardar |
| `pnpm revision:rapida` | Biome y tipos sobre lo cambiado, y las pruebas relacionadas con lo cambiado. La corren los ganchos |
| `pnpm revision` | La revisión completa, en este orden: Biome, tipos, todas las pruebas, las migraciones aplicadas desde cero sobre una base vacía, la búsqueda de secretos, `pnpm audit` de dependencias, `pnpm docs:revisar` y que `openapi.json` esté al día. En verde, guarda el sello en `.revision/` |
| `pnpm pruebas` | Todas las pruebas, sin sellar |
| `pnpm base:generar` | Genera la migración nueva desde los cambios de `tablas.ts` (drizzle-kit) |
| `pnpm base:migrar` | Aplica las migraciones pendientes |
| `pnpm base:sembrar` | Carga los datos de la muestra (solo local y pruebas) |
| `pnpm docs:revisar` | Revisa los archivos de creación: encabezado de cuatro líneas, enlaces y anclas que existen, conexiones en los dos sentidos y que cada archivo esté en el índice. No revisa el contenido de los registros |
| `pnpm api:documentar` | Genera `openapi.json` desde los contratos |
| `pnpm puente:empaquetar` | Arma el ejecutable del puente de impresión para Windows y Linux |
| `pnpm migracion:cargar` | Carga los datos de hoy en el arranque, por tiempos y con ensayo (ver [migración](../MIGRACION.md#el-comando)) |

**El sello.** La huella es el contenido exacto de lo que se revisó, sin `docs/registros/`. El gancho de git antes de cada commit:

1. si el commit solo toca `docs/registros/`, pasa;
2. si solo toca documentos (`*.md`), corre `pnpm docs:revisar` y pasa si sale en verde;
3. si toca código, pide que el sello sea de exactamente lo que se va a guardar.

Cómo encaja en el trabajo de cada parte está en la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#los-verdes).

## Cómo está hecho

**El árbol real** (fase 1). Solo existen las carpetas que ya tienen algo; las demás nacen en la fase que las llena.

```text
uniformame/
├── AGENTS.md · CLAUDE.md
├── package.json               versiones fijas, packageManager y engines
├── pnpm-workspace.yaml        apps/* y packages/*; engineStrict y saveExact
├── pnpm-lock.yaml
├── tsconfig.base.json         TypeScript estricto, solo sintaxis borrable
├── tsconfig.json              los scripts y los paquetes, con los tipos de Node
├── biome.json
├── vitest.config.ts           toma los *.prueba.ts
├── .env.ejemplo · .gitignore
├── .claude/                   rules/ y agents/
├── docs/
└── scripts/
    └── versiones.prueba.ts    las versiones contra la tabla del stack
```

**Los scripts de `package.json`** (fase 1, parte 1): `pnpm estilo` (Biome sobre todo el repositorio), `pnpm tipos` (`tsc` sin emitir) y `pnpm pruebas` (todas las pruebas con Vitest).
