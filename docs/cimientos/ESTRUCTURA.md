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
│   └── registros/             bitácora, REGISTROS.md, sesiones/ y auditorias/
├── apps/
│   ├── api/                   la API y el worker
│   ├── web/                   las pantallas de la fábrica
│   ├── tablet/                la Puerta del taller
│   └── puente/                el programa puente de impresión
├── packages/
│   ├── compartido/            contratos, tipos, cálculos puros y el cliente de la API
│   └── interfaz/              el sistema de diseño
├── pruebas/                   la base de las pruebas, los simuladores y, desde la fase 21, las de punta a punta
└── scripts/                   revisión, sello, docs:revisar y carpetas de trabajadores
```

Cuando llegue el POS, entra como `apps/caja/`, con su módulo `tiendas` en la API. uniformame.mx será su propio proyecto que habla con la API.

## La API por dentro

```text
apps/api/
├── src/
│   ├── servidor.ts            arranca Fastify y registra los módulos
│   ├── trabajos.ts            arranca el worker (Graphile Worker)
│   ├── impresos/              el dibujo de cada etiqueta y cada hoja (ZPL y PDF): zpl.ts y pdf.ts con lo común de las etiquetas, hoja.ts con lo de las hojas, etiquetas/ y hojas/; los datos los da su módulo
│   ├── nucleo/                lo que usan todos los módulos
│   │   ├── entorno.ts         lee y valida las variables de entorno, una sola vez
│   │   ├── base/              conexión, transacciones con reintento y candados
│   │   ├── http/              rutas de acciones y consultas, errores y recorte
│   │   ├── acceso/            sesión, llave del aparato y revisión de permisos
│   │   ├── idempotencia/      la clave de cada acción y la respuesta guardada
│   │   ├── sincronizacion/    subir, bajar, foto y avisos en vivo
│   │   ├── trabajos/          el reloj y el proceso de la bandeja de eventos
│   │   ├── hojas.ts           el marco de toda hoja en PDF: la empresa y quién la sacó y cuándo
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
├── impresion.ts               sus tipos de etiqueta y de hoja: quién los pide, la función que junta sus datos y su dibujo
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
│   ├── acceso/                la pantalla de entrada y la vuelta de «Confirmar con Google»
│   └── <depto>/
│       ├── index.tsx          Pendientes
│       └── <pestana>.tsx      una por pestaña
├── departamentos/<depto>/
│   ├── menu.ts                su ícono en el menú (el nombre, el grupo y el orden vienen de `admin.armazon`)
│   ├── pagina.tsx             su página: el título, las pestañas, la acción principal y los cajones que abre la dirección
│   ├── direccion.ts           sus rutas y sus parámetros, sobre `comun/direccion.ts`
│   ├── envio.ts               qué consultas vuelve a leer cada acción, sobre `useEnvio` de lo común
│   ├── enlaces.ts             las direcciones a otros departamentos, si las usa
│   ├── comun.tsx              lo que comparten sus pestañas y no comparte nadie más, si lo hay
│   ├── pestanas/              una pestaña por archivo
│   ├── cajones/               un cajón por archivo
│   └── ventanas/              una ventana por archivo
└── comun/                     lo que comparten todos: armazón, cliente de la API, búsqueda, campana, cuenta, avisos, abrir una hoja en PDF y el arnés de pruebas
```

- **Un cajón se abre por su dirección:** `/<departamento>/<pestaña>?cajon=<nombre>&id=<id>` (decisión 759), así otro departamento lo enlaza sin importar su componente.
- **El encargo de un trabajador** va en `.trabajador.json`, en la raíz de su worktree (no entra a git): su departamento, el commit del que salió y lo que el capataz le dio de más. `scripts/carpetas.ts` revisa con él que solo tocó sus carpetas, y la revisión rápida lo corre (decisión 750).
- **Una ruta solo arma la pantalla:** monta su pestaña, que lee los filtros de la dirección y llama a la consulta del contrato con TanStack Query (`useConsulta`, o `usePaginas` con `SegunPaginas` si va por páginas). Ninguna regla del negocio vive en la ruta ni en la pestaña (decisión 808).
- **El menú se arma solo** con los `menu.ts` de cada carpeta (`import.meta.glob` de Vite). La cuenta solo ve los departamentos que tiene.
- **Los componentes** salen de `packages/interfaz`; la carpeta de un departamento no define botones, tablas ni colores propios. Las reglas están en la [regla de pantallas](../../.claude/rules/react.md).
- La tablet (`apps/tablet/src/`) sigue la misma idea con `pantallas/`, `cola/` (lo guardado sin internet), `copia/` (lo que bajó), `sincronizacion/`, `registro/` y `pin/` (ver [la tablet](../apps/tablet.md)).
- El puente (`apps/puente/src/`) lleva `registro/`, `trabajos/`, `zebra/` y `diario/` (ver [puente de impresión](../apps/puente-de-impresion.md)).
- Los dibujos de `apps/api/src/impresos/` van en `etiquetas/` y `hojas/`, uno por archivo, con lo común del ZPL y del PDF: reciben datos ya listos y no consultan nada, como una pantalla (ver [etiquetas](../impresos/etiquetas.md#cómo-se-arman)).

## El sistema de diseño por dentro

Cada familia de componentes en su carpeta, un componente por archivo (decisión 743):

```text
packages/interfaz/src/
├── tokens.css                 los colores y las medidas, una sola vez (ver diseño)
├── clases.ts                  une las clases de un componente
├── botones/                   boton.tsx · boton-con-cifra.tsx · boton-de-archivo.tsx · enlace.tsx
├── captura/                   campo.tsx · selector.tsx · interruptor.tsx · casilla.tsx · filtros.tsx · buscador.tsx · campo-de-archivo.tsx
├── estados/                   estado.tsx · estado-de-pantalla.tsx · aviso.tsx · recuadro.tsx · textos-con-tono.tsx · muestra-de-color.tsx · colores.ts (el color de cada estado)
├── contenedores/              cajon.tsx · ventana.tsx · emergente.tsx · menu-de-opciones.tsx · tarjeta.tsx · grupo-plegable.tsx
├── tablas/                    tabla.tsx · panel-pendientes.tsx · dos-renglones.tsx
├── pagina/                    armazon.tsx · pagina-departamento.tsx · barra-indicadores.tsx · colores-de-tipo.ts · seccion.tsx · dato.tsx · panel.tsx · cifra-de-cajon.tsx
├── avance/                    hilo.tsx · barra-avance.tsx · pasos.tsx
├── graficas/                  grafica-chica.tsx · grafica.tsx
└── muestra/                   catalogo.tsx (todos los componentes en todos sus estados), su página y componentes.prueba.ts
```

- **Se importa por su carpeta:** `@uniformame/interfaz/botones/boton`. No hay un archivo que junte todos: no hay archivos que solo reexportan.
- **Lo que comparte una familia** va dentro de su carpeta, nunca en una carpeta de cajón de sastre.
- **Un componente nuevo** lo pide el departamento al capataz y entra a la carpeta de su familia.

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

**El sello.** La huella es el contenido exacto de lo que se revisó, sin los registros (los `.md` de `docs/registros/`). El gancho de git antes de cada commit y de cada merge:

1. si el commit solo toca registros, pasa;
2. si solo toca documentos (`*.md`), pide que no quede nada sin agregar, corre `pnpm docs:revisar` y pasa si sale en verde;
3. si toca código, pide que el sello sea de exactamente lo que se va a guardar.

`git rebase`, `git cherry-pick` y `git revert` hacen commits sin pasar por los ganchos, así que no se usan: un cambio es un commit nuevo, y la historia de las ramas no se reescribe (decisión 329).

Cómo encaja en el trabajo de cada parte está en la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#los-verdes).

## Cómo está hecho

**El árbol real** (fase 1). Solo existen las carpetas que ya tienen algo; las demás nacen en la fase que las llena.

```text
uniformame/
├── AGENTS.md · CLAUDE.md
├── package.json               versiones fijas, packageManager, engines y los comandos
├── pnpm-workspace.yaml        apps/* y packages/*; engineStrict, saveExact, optimisticRepeatInstall
├── pnpm-lock.yaml
├── tsconfig.base.json         TypeScript estricto, solo sintaxis borrable
├── tsconfig.json              los scripts y los paquetes, con los tipos de Node
├── biome.json
├── vitest.config.ts           toma los *.prueba.ts
├── .env.ejemplo · .gitignore
├── compose.yaml               Postgres 18 para pnpm local
├── playwright.config.ts       las pruebas en el navegador (*.navegador.ts)
├── .githooks/               pre-commit y pre-merge-commit: los dos llaman a scripts/gancho-git.ts
├── .worktreeinclude           copia .env a cada worktree
├── .claude/
│   ├── settings.json          los ganchos de inicio, de después de editar y de fin; worktree.baseRef
│   ├── modo                   supervisado | autonomo
│   └── rules/ · agents/
├── docs/
├── apps/
│   └── api/                   @uniformame/api
│       ├── drizzle.config.ts
│       ├── migraciones/       las migraciones en orden y meta/
│       ├── semillas/          sembrar.ts (los datos de la muestra)
│       ├── openapi.json       generado desde los contratos (pnpm api:documentar)
│       └── src/
│           ├── servidor.ts    Fastify con las rutas de lo registrado
│           ├── documentar.ts  pnpm api:documentar
│           ├── modulos/admin/ comandos_recibidos
│           └── nucleo/
│               ├── entorno.ts · modulos.ts
│               ├── base/      conexion, transacciones, columnas, tablas, siembra, migrar, local y el arranque de las pruebas
│               ├── http/      errores y consultas
│               ├── acceso/    quién llama
│               ├── acciones/  el corredor y las pisadas
│               ├── idempotencia/ la clave y la respuesta guardada
│               └── pruebas/   el módulo de prueba y el servidor de prueba
├── pruebas/                   @uniformame/pruebas
│   ├── base/                  la copia de la plantilla por archivo
│   └── simuladores/           google, resend, r2 y sus fallas
├── packages/
│   └── compartido/            @uniformame/compartido
│       ├── package.json
│       └── src/
│           ├── tipos/base.ts          Centavos, Uuid, DiaNegocio, Momento
│           ├── calculos/              dinero.ts y fechas.ts, con sus *.prueba.ts
│           ├── contratos/             definir, protocolo y versiones
│           └── cliente/               el cliente de la API con tipos
└── scripts/
    ├── archivos.ts            qué se revisa: lo que se va a guardar, lo cambiado y lo del commit
    ├── comandos.ts            corre Biome, tsc, Vitest, node y pnpm
    ├── revision.ts            pnpm revision
    ├── revision-rapida.ts     pnpm revision:rapida
    ├── sello.ts               la huella y el sello
    ├── secretos.ts            la búsqueda de secretos
    ├── gancho-git.ts          los tres casos del gancho de git
    ├── docs-revisar.ts        pnpm docs:revisar
    ├── migraciones.ts         las migraciones de main sin cambios y las llaves pendientes
    ├── gancho-inicio.ts       el gancho de inicio de Claude Code
    ├── gancho-edicion.ts      el gancho después de editar
    ├── gancho-fin.ts          el gancho de fin y el conteo de intentos
    ├── repositorio-de-prueba.ts  los repositorios temporales de las pruebas
    └── *.prueba.ts            las pruebas, junto a su script
```

**Los scripts de `package.json`:**

| Script | Qué corre |
|---|---|
| `prepare` | `git config core.hooksPath .githooks`; lo corre cada `pnpm install` (con `optimisticRepeatInstall: false`, aunque `node_modules` ya esté al día) |
| `pnpm estilo` · `pnpm tipos` | `biome check .` · `tsc -p tsconfig.json` |
| `pnpm pruebas` | `vitest run`: todas las pruebas, sin sellar |
| `pnpm revision:rapida` | `scripts/revision-rapida.ts`: Biome sobre los archivos cambiados desde el último commit, `tsc` si cambió un `.ts` o un `tsconfig`, y `vitest related` sobre los `.ts` cambiados |
| `pnpm revision` | `scripts/revision.ts`: Biome, tipos, todas las pruebas (también las migraciones desde cero, con Postgres real), las migraciones y las llaves pendientes, secretos, `pnpm audit`, `pnpm docs:revisar` y que `openapi.json` esté al día, en ese orden; se detiene en el primero en rojo |
| `pnpm docs:revisar` | `scripts/docs-revisar.ts`: los archivos de creación (abajo) |
| `pnpm local` · `pnpm base:generar` · `pnpm base:migrar` · `pnpm base:sembrar` · `pnpm api:documentar` | Los de `apps/api` (ver [base de datos](BASE-DE-DATOS.md#cómo-está-hecho) y [arquitectura](ARQUITECTURA.md#cómo-está-hecho)); leen `.env` con `--env-file-if-exists` |

**El workspace** (`pnpm-workspace.yaml`): `apps/*`, `packages/*` y `pruebas`; ningún paquete corre scripts al instalarse (`allowBuilds`, decisión 330) y dos dependencias indirectas van con `overrides` (decisión 336).

**Las herramientas** se llaman desde `node_modules/.bin` (`scripts/comandos.ts`), sin rutas de la máquina: lo mismo corre en la nube y en la Mac.

**La huella del sello** (`scripts/sello.ts`): por cada archivo que se guardaría (lo que git sigue y lo nuevo que `.gitignore` no deja fuera), su ruta y el hash de git de su contenido, ordenados y pasados por SHA-256. No incluye los registros: los `.md` de `docs/registros/` (cualquier otro archivo ahí se sella como código). Al revisar se calcula sobre el árbol (`git hash-object`); al hacer el commit, sobre el índice (`git ls-files -s`). Por eso el sello vale solo si se guarda exactamente lo revisado: con todo agregado (`git add -A`), las dos huellas son iguales. La revisión completa calcula la huella antes y después de sus pasos y no sella si algo cambió mientras corría. El sello vive en `.revision/sello.json`, fuera de git.

**El gancho de git** (`.githooks/pre-commit` y `.githooks/pre-merge-commit` → `scripts/gancho-git.ts`) ve lo que cambia en el índice, también en un merge: si todo son registros, pasa; si todo es `*.md`, rechaza el commit si queda cualquier archivo cambiado sin agregar (porque `docs:revisar` lee el árbol de trabajo, también los archivos a los que enlazan los documentos) y si no, corre `scripts/docs-revisar.ts`; si hay código, pide que el sello sea igual a la huella del índice. Un merge con código se hace con `git merge --no-commit`, `pnpm revision` y `git commit`.

**La búsqueda de secretos** (`scripts/secretos.ts`) revisa lo que se va a guardar: llaves privadas, direcciones de Postgres con contraseña, el secreto de cliente y las llaves de API de Google, las llaves de Resend, un `.env` que `.gitignore` no deja fuera o que se va a guardar, y cualquier variable de `.env.ejemplo` escrita con un valor (`NOMBRE=algo`), que cubre también las credenciales de R2. Dice el archivo y el renglón, nunca el valor.

**`pnpm docs:revisar`** (`scripts/docs-revisar.ts`) lee todos los `.md` de `docs/`, `AGENTS.md`, `CLAUDE.md` y `.claude/` que se van a guardar, menos las sesiones:

- **el encabezado:** título, renglón vacío y los cuatro campos en orden (Qué cubre, Estado, Se construye en, Se conecta con; en `docs/fases/NN-…`, Etapa, Estado, Antes de empezar, Se conecta con), con un estado de la lista y «Se construye en» con su enlace. Antes del título solo puede ir el bloque de configuración `---` de `.claude/` o la línea `@AGENTS.md`;
- **los enlaces:** cada enlace relativo fuera de los bloques de código lleva a un archivo o carpeta que existe, y su ancla, a un título de ese archivo, calculada como GitHub (minúsculas, sin puntuación salvo `-` y `_`, un guion por espacio, acentos incluidos; los títulos repetidos llevan `-1`, `-2`);
- **las conexiones:** si el «Se conecta con» de A enlaza a B, el de B enlaza a A;
- **el índice:** cada archivo revisado está enlazado desde `docs/INDICE.md`.

De `docs/registros/` solo revisa el encabezado de la bitácora y de `REGISTROS.md`; las carpetas de dentro (sesiones y auditorías) no. Dice cada error con su archivo y su renglón.

**Las pruebas:**

- en un repositorio de git temporal con la configuración del real y `node_modules` enlazado (`scripts/repositorio-de-prueba.ts`): `revision-rapida.prueba.ts`, `sello.prueba.ts`, `gancho-git.prueba.ts`, `secretos.prueba.ts`, `docs-revisar.prueba.ts` y `gancho-edicion.prueba.ts`;
- en uno temporal sin enlazar `node_modules`, porque instala de verdad: `gancho-inicio.prueba.ts`;
- con salidas simuladas en una carpeta temporal, y con la revisión rápida real en un repositorio temporal: `gancho-fin.prueba.ts`;
- sobre el repositorio real, que solo leen: `versiones.prueba.ts` (las versiones) y `revision.prueba.ts` (los pasos de la revisión completa y su orden).

`archivos.ts` y `comandos.ts` no tienen prueba propia: los prueban las de los scripts que los usan.
