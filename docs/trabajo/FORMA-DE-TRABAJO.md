# La forma de trabajar

> **Qué cubre:** cómo se construye Unifórmame: quién hace qué, dónde se trabaja (la nube, su entorno, sus ramas y la Mac), las fases y las partes, el ciclo de cada parte, el bucle de resolución, los registros, los verdes, los modos, el trabajo en paralelo, cómo se escribe el código y las reglas que no cambian.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../../AGENTS.md) · [CLAUDE.md](../../CLAUDE.md) · [revisión de fase](REVISION-DE-FASE.md) · [reglas de documentos](../../.claude/rules/documentos.md) · [reglas de código](../../.claude/rules/codigo.md) · [pruebas](../cimientos/PRUEBAS.md) · [registros](../registros/REGISTROS.md) · [bitácora](../registros/BITACORA.md) · [trabajador](../../.claude/agents/trabajador.md) · [las fases](../fases/FASES.md) · [arquitectura](../cimientos/ARQUITECTURA.md)

## Quién hace qué

- **Bruno** decide, aprueba, revisa a ojo y lleva los mensajes de un lado a otro.
- **El chat de planeación** platica y acuerda sin adelantarse, investiga con fuentes oficiales, diseña con prototipos y escribe los archivos de creación y los encargos. No escribe código del repositorio.
- **Claude Code** construye siguiendo los archivos de creación, refuta antes de hacer algo que choque con lo decidido (con el porqué) y reporta.
- **El ida y vuelta:**
  1. El chat escribe los archivos de creación que cambian y el encargo en un `.md`. Los archivos llegan al repositorio en una rama `planeacion/…`, que sube el chat o Bruno.
  2. Bruno pega el encargo en una sesión nueva de Claude Code, que une esa rama a la de la fase antes de empezar.
  3. El reporte de Claude Code regresa al chat, y el chat le da a Bruno el mensaje de respuesta.

## Dónde se trabaja

- **En la nube, por ahora.** Claude Code trabaja en sesiones de la nube de Anthropic ([claude.ai/code](https://claude.ai/code)) sobre el repositorio privado `uniformame` de GitHub. Cada sesión arranca en una máquina nueva (Ubuntu, x86_64) con el repositorio recién clonado, y sigue trabajando aunque Bruno cierre la computadora.
- **En la Mac, cuando Bruno decida.** Todo funciona igual en macOS: ningún script del repositorio depende de rutas o comandos que solo tiene la máquina de la nube.
- **«En local»** quiere decir en la máquina donde corre la sesión, la de la nube o la Mac. Ahí se construye y se prueba todo; nada toca un servicio real antes de la [puesta en marcha](../fases/23-puesta-en-marcha.md).

### El entorno de la nube

Las sesiones usan el entorno «Unifórmame» de claude.ai/code, con acceso a la red **Trusted** (los registros de paquetes, GitHub, Docker Hub y nodejs.org, entre otros) y sin variables de entorno. La máquina ya trae git, Docker y Node 22; este script de configuración deja Node y pnpm con las versiones exactas de la [arquitectura](../cimientos/ARQUITECTURA.md#el-stack). Postgres corre en Docker, igual que en la Mac.

```bash
#!/bin/bash
# Unifórmame · script del entorno de la nube (claude.ai/code)
# Deja Node y pnpm con las versiones exactas de docs/cimientos/ARQUITECTURA.md.
# La copia que manda está en docs/trabajo/FORMA-DE-TRABAJO.md («El entorno de la nube»).
NODE_VERSION=26.13.0
PNPM_VERSION=12.18.0

destino=/opt/node26
paquete="node-v${NODE_VERSION}-linux-x64"
fuente="https://nodejs.org/dist/v${NODE_VERSION}"
trabajo=$(mktemp -d)

# 1. Node, de nodejs.org, revisado contra su SHASUMS256.txt
if [ "$("$destino/bin/node" --version 2>/dev/null)" != "v${NODE_VERSION}" ]; then
  curl -fsSL --retry 3 -o "$trabajo/$paquete.tar.gz" "$fuente/$paquete.tar.gz" &&
  curl -fsSL --retry 3 -o "$trabajo/SHASUMS256.txt" "$fuente/SHASUMS256.txt" &&
  (cd "$trabajo" && grep " $paquete.tar.gz\$" SHASUMS256.txt | sha256sum --check --strict -) &&
  rm -rf "$destino" && mkdir -p "$destino" &&
  tar -xzf "$trabajo/$paquete.tar.gz" -C "$destino" --strip-components=1
fi

# 2. pnpm, del registro de npm, en la misma carpeta que Node
if [ -x "$destino/bin/npm" ] && [ "$("$destino/bin/pnpm" --version 2>/dev/null)" != "$PNPM_VERSION" ]; then
  "$destino/bin/npm" install --global --prefix "$destino" "pnpm@$PNPM_VERSION"
fi

# 3. Que sean las que corren siempre, en la terminal y en los ganchos: la máquina trae
#    Node 22 en /opt/node22/bin, que va en el PATH; sus comandos pasan a apuntar a /opt/node26.
for comando in node npm npx pnpm pnpx; do
  [ -e "$destino/bin/$comando" ] || continue
  for carpeta in /opt/node22/bin /usr/local/bin; do
    [ -d "$carpeta" ] && ln -sfn "$destino/bin/$comando" "$carpeta/$comando"
  done
done
rm -rf "$trabajo"

# 4. Si algo no quedó, el script falla: la sesión no arranca y no se guarda un entorno a medias.
if [ "$(node --version 2>/dev/null)" != "v${NODE_VERSION}" ] || [ "$(pnpm --version 2>/dev/null)" != "$PNPM_VERSION" ]; then
  echo "Unifórmame: Node o pnpm no quedaron en la versión de la arquitectura" >&2
  exit 1
fi
echo "Unifórmame: Node $(node --version) · pnpm $(pnpm --version)"
```

- **Si cambia la versión de Node o de pnpm** en la arquitectura, el script cambia en el mismo commit y Bruno lo pega otra vez en el entorno. Al cambiarlo, la nube vuelve a armar el entorno.
- **Al empezar cada sesión en la nube,** el gancho de inicio de `.claude/settings.json` corre `pnpm install`, que deja activo el gancho de git, y arranca el daemon de Docker si no responde: la máquina lo trae instalado pero sin correr (decisión 333). Fuera de la nube no hace nada.
- **Lo que le falte a la máquina** (otra herramienta, la imagen de Postgres para no bajarla en cada sesión) se agrega a este script: Claude Code le da a Bruno las líneas exactas. Lo que se instala a mano dentro de una sesión se pierde con ella.
- **Ningún secreto** va en el script ni en las variables del entorno: cualquiera que use el entorno los puede leer.

### Las ramas en la nube

- **La rama de la fase** es la que la nube le da a la sesión que empieza la fase. Se anota en el archivo de la sesión. Si la misma sesión sigue con la fase siguiente, sigue en esa rama, y `main` avanza a su punta al cerrar cada fase (decisión 332).
- **Si la fase sigue en otra sesión,** Bruno la abre sobre la rama de la fase, y el trabajo sigue en esa misma rama aunque la nube proponga otra.
- **Cada commit se empuja a GitHub en seguida.** Cuando una sesión se queda quieta, la nube puede reciclar su máquina, y lo que no se empujó se pierde. Por eso el commit de cada parte se empuja antes de esperar el visto bueno de Bruno: él lo revisa en el panel de cambios de la sesión, y lo que pida va en otro commit de la misma parte.
- **El cierre:** con el visto bueno de Bruno, Claude Code une la rama con `main` en la máquina de la sesión, con un merge que conserva los commits, corre la revisión completa sobre esa unión y empuja `main`. Nada llega a `main` sin ese visto bueno, ninguna rama se borra y nada se reescribe.

### En la Mac

- **Cuándo,** lo decide Bruno. La [puesta en marcha](../fases/23-puesta-en-marcha.md) se trabaja desde la Mac, porque los secretos y los archivos de la migración viven en su computadora y nunca entran a git ni a la nube.
- **Qué necesita:** git, Node y pnpm con las versiones de la [arquitectura](../cimientos/ARQUITECTURA.md#el-stack), Docker y Claude Code. Se clona el repositorio y se corre `pnpm install`, que deja activo el gancho de git.
- **Una sesión de la nube sigue en la Mac** con `claude --teleport`, desde el repositorio clonado: trae la conversación y su rama.

## Los archivos de creación

- **Son la fuente de verdad.** Se escriben antes del código y viven en `docs/`. Claude Code los lee antes de escribir una línea y no inventa:
  - si algo no está escrito, primero se decide, después se escribe y al final se construye;
  - si algo los contradice, se elige lo más simple que respete los principios y se anota como decisión.
- **Cada archivo se entiende solo.** Lo que necesita de otro lo dice completo para su caso, con la regla y los números que usa, y enlaza al archivo dueño para el detalle. Nunca «eso está en el otro archivo» y ya.
- **Cada dato vive en un solo archivo.** Los demás lo resumen para su caso y lo enlazan, nunca lo copian entero. Así nada se contradice.
- **Se mantienen vivos.** Un cambio que mueve algo decidido cambia su archivo en el mismo commit. Un archivo viejo es basura, igual que el código muerto.
- **Lo construido se documenta en el mismo archivo.** Al terminar su parte, Claude Code llena la sección «Cómo está hecho»: dónde vive en el código, qué reglas cumple y qué pruebas lo demuestran.

Cómo se escribe cada uno (encabezado, enlaces, estilo) está en la [regla de documentos](../../.claude/rules/documentos.md).

## Fases y partes

- **Una fase es una parte del sistema** (los cimientos, la base de datos, la API, un módulo, la interfaz), no una pantalla ni un departamento. Son 23, en [FASES.md](../fases/FASES.md), y cada una tiene su archivo con su plantilla.
- **De abajo hacia arriba:** primero los cimientos; después cada módulo, en orden de dependencia; la interfaz cuando el sistema ya existe detrás; al final, el lanzamiento.
- **No se empieza una fase hasta que la anterior esté en verde.** La única excepción es un pedazo mínimo de una fase futura que haga falta, y va anotado en «Excepciones permitidas» del archivo de la fase.
- **Por qué así:** si algo falla en la fase N, el problema está en la fase N, porque lo anterior ya pasó su revisión.
- **Una parte a la vez,** nunca la fase entera. Cada parte cabe en una sesión y su «Leer:» dice qué archivos leer y para qué.

## El ciclo de cada parte

Siempre en este orden:

1. **Plan sin código.** Archivos que se tocan, pruebas, riesgos, dudas y Fuentes (las documentaciones oficiales que se leyeron). Con un mapa: cada pieza dice «ya existe: [ruta]», «existe parecida: [ruta]» o «nueva: [dónde va]». Se busca antes de crear. Lo que el sistema no tiene no se inventa: va en el plan con su propuesta.
2. **Pruebas primero, en rojo.** Cada criterio de terminado de la parte tiene la suya.
3. **Construir hasta el verde,** reusando lo que hay. Si aparece un problema, se resuelve con el [bucle de resolución](#el-bucle-de-resolución).
4. **Una explicación corta** de lo hecho, con la salida de las revisiones.
5. **«Cómo está hecho» y los archivos de creación al día.**
6. **La revisión completa en verde,** que sella lo revisado.
7. **Los registros:** su línea en la bitácora, su sesión y lo que toque en `REGISTROS.md`.
8. **Un commit chico** en la rama de la fase. En la nube, se empuja a GitHub en seguida (ver [las ramas en la nube](#las-ramas-en-la-nube)).

**En la interfaz** (fases 19 y 20), la prueba de cada parte es la captura contra la muestra y que cada botón llame a su acción. Las pruebas en rojo primero se quedan para la lógica que haya en la pantalla.

## El bucle de resolución

Un problema se resuelve donde aparece, no con la revisión completa.

1. **Entender la causa** antes de tocar nada.
2. **Corregir** y **comprobar solo ese problema:** su prueba, su chequeo de tipos o la revisión rápida de lo cambiado. No la revisión completa.
3. **Si sigue fallando, otro intento con otro enfoque,** nunca el mismo arreglo repetido. Son hasta tres intentos.
4. **Al tercer intento fallido:**
   - **Modo supervisado:** se detiene y pregunta a Bruno, con lo que intentó, lo que vio y las opciones que ve. Bruno decide y sigue.
   - **Modo autónomo:** evalúa dos o tres opciones, elige la más simple que cumpla, la anota en «Decisiones autónomas» de `REGISTROS.md` y sigue.
5. **Cuando ya no queda ningún problema,** corre la revisión completa una vez. Si encuentra algo, cada hallazgo tiene su propio bucle, y cuando todos están resueltos, la revisión completa corre otra vez, una vez.

El gancho de fin cuenta los intentos por problema, no por revisión. Lo mismo vale para los hallazgos de la auditoría de fase.

## Los registros

Son la memoria del trabajo:

- **La bitácora** (`docs/registros/BITACORA.md`): una línea por parte o por sesión.
- **El archivo de cada sesión** (`docs/registros/sesiones/`): por cada parte, su plan con sus Fuentes, las pruebas que salieron en rojo, lo hecho, los errores con sus intentos («falló dos veces hasta…»), las decisiones, los pendientes que cierra o abre, y el resultado de las revisiones.
- **`REGISTROS.md`:** pendientes, para después, verificación real pendiente y decisiones autónomas.
- **«Cómo está hecho»** en cada archivo de creación.

Sus reglas:

1. **Nunca son errores del código.** Tienen que estar al día, pero si les falta algo, se escribe y ya. No hacen que el código salga mal ni detienen una revisión.
2. **Se escriben al final,** cuando ya se conoce el resultado de la revisión. Ninguna revisión comprueba que un registro mencione la revisión misma.
3. **La huella del sello no los incluye,** así que escribirlos después de la revisión no invalida el sello.
4. **Claros y concisos:** resumidos, pero sin saltarse detalles. Escribirlos no debe tomar más que unos minutos.

## Los verdes

- **La revisión rápida** (`pnpm revision:rapida`): estilo, tipos y pruebas de lo cambiado. Corre sola cada vez que Claude Code edita un archivo.
- **La revisión completa** (`pnpm revision`): estilo, tipos, todas las pruebas, la base de datos, las pruebas de punta a punta, los secretos, las dependencias y los archivos de creación con sus enlaces.
  - **El sello:** en verde, guarda la huella exacta de lo revisado, sin los registros. Un gancho de git rechaza el commit que no tiene sello vigente.
  - **Lo que encuentre en los documentos** (un enlace roto, un encabezado incompleto) se arregla en el momento y no cuenta como falla del código.
  - **Un commit de solo documentos** pide solo la revisión rápida de documentos (`pnpm docs:revisar`).
- **El gancho de fin:** al terminar cada turno corre la revisión rápida y cuenta los intentos por problema. Al tercero sobre el mismo problema, pide el protocolo del [bucle de resolución](#el-bucle-de-resolución).
- **Cada regla dice qué revisión la vigila,** o que no se puede vigilar en automático. Lo que no se puede, lo mira la auditoría de fase.

Cómo se audita y se cierra cada fase está en la [revisión de fase](REVISION-DE-FASE.md).

## Modos

El modo vive en `.claude/modo` (`supervisado` o `autonomo`), y cada cambio es una orden de Bruno escrita en `AGENTS.md` con su fecha.

- **Supervisado:**
  - el plan de la fase lleva el «sí» de Bruno;
  - cada parte se construye en local para que Bruno la vea;
  - el visto bueno de Bruno va antes del commit; en la nube, va sobre el commit ya empujado, y lo que pida va en otro commit de la misma parte (ver [las ramas en la nube](#las-ramas-en-la-nube));
  - lo de diseño se le pregunta con opciones y la recomendada;
  - al tercer intento fallido, se detiene y pregunta.
- **Autónomo:**
  - no pregunta: decide lo más simple que respete los principios, actualiza el archivo y lo anota en decisiones autónomas en el momento;
  - sigue de parte en parte y de fase en fase, y se detiene donde Bruno diga o ante un bloqueo real;
  - antes de parar, deja todo en verde y anotado.

## Trabajo en paralelo

Solo donde el trabajo se parte en pedazos que no tocan los mismos archivos.

- **Sí:** los departamentos de la fase 19, los flujos de la fase 21, las revisiones y la investigación (que solo leen).
- **No:** los cimientos ni los módulos. Dependen unos de otros y todos agregan tablas a la misma base. Ahí escribe un solo agente.

**Cómo, sin que choquen:**

1. **El capataz es la sesión principal.** Reparte las partes, junta el trabajo y cierra la fase.
2. **Cada trabajador trabaja en su propio worktree,** que sale de la rama de la fase. Usa el subagente [trabajador](../../.claude/agents/trabajador.md).
3. **Cada parte dice de qué carpetas es dueña.** Antes de juntar, un script revisa que el trabajador solo tocó las suyas; si tocó otra, su trabajo no entra.
4. **Lo compartido solo lo toca el capataz:** migraciones, dependencias, componentes del sistema de diseño y el registro de rutas. Si un trabajador necesita algo ahí, se lo pide al capataz.
5. **No hay listas centrales editadas a mano:** módulos, rutas y permisos se registran solos por carpeta (ver [estructura](../cimientos/ESTRUCTURA.md)).
6. **Cada trabajador entrega en verde,** con su propia base de prueba.
7. **El capataz junta de uno en uno** y corre la revisión rápida después de cada uno.
8. **La fase se cierra igual que siempre:** una sola revisión completa y la auditoría sobre lo ya junto.

## El código

Las reglas completas están en la [regla de código](../../.claude/rules/codigo.md). Lo principal:

- **La escalera antes de escribir:** ¿lo pide el archivo de creación? ¿Ya existe en el repositorio (un módulo, una acción interna, un componente, un cálculo del paquete compartido)? ¿Lo resuelve la plataforma (Postgres, Node, el navegador, la impresora)? ¿Lo resuelve una librería que ya está en [ARQUITECTURA.md](../cimientos/ARQUITECTURA.md)? Solo entonces, el mínimo código que cumple el criterio. Una librería nueva es una decisión que se anota.
- **Flojo con la solución, nunca con la lectura:** antes de escribir, se lee el archivo de creación y el código que se toca.
- **Nunca se recorta:** la validación de los contratos, los permisos, la idempotencia, la bitácora, los errores que evitan perder datos, el dinero en centavos ni la accesibilidad.
- **Estructurado:** cada cosa en su carpeta, sin espagueti, sin nada duplicado ni muerto.
- **Documentado en español:** cada archivo dice qué es, de qué fase es y qué archivo de creación lo describe; cada función, qué hace, qué recibe, qué regresa y por qué; cada bloque, qué hace y por qué. Describe lo que el código hace hoy, nunca su historia.
- **Atajos, solo los que permite la fase** en «Excepciones permitidas». Cualquier otro es una decisión autónoma.
- **Al cerrar cada parte,** se dice qué se dejó fuera o qué no se revisó.

## Reglas que no cambian

- **Documentación oficial primero:** antes de usar una librería o un servicio se lee su documentación oficial actual, luego el código del paquete instalado y luego sus ejemplos oficiales. Nada de memoria, blogs ni foros. Las versiones van exactas y cada lectura va en las Fuentes del plan.
- **Todo en local hasta lanzar:** cada servicio externo se prueba con un simulador sobre su interfaz oficial. Lo que solo se comprueba con el real va a «Verificación real pendiente». Una cuenta real solo con autorización de Bruno y con tope de gasto.
- **Nunca trampa para llegar al verde:** no se saltan, debilitan ni borran pruebas o revisiones, ni se baja un criterio.
- **Ningún secreto en el código;** solo en variables de entorno.
- **Una rama por fase;** un commit chico por parte; al cerrar, la revisión completa y un merge que conserva los commits.
- **Prohibido siempre:** reescribir la historia de la rama principal, saltarse los ganchos y tocar otros proyectos de la computadora.

## El encargo y el reporte

**El encargo** es un solo prompt completo, en un `.md`, cuando todo ya está aclarado. Nunca encargos a medias. Lleva:

- el contexto en dos líneas y el «sí» de Bruno al plan;
- lo que se dejó en el repositorio (archivos nuevos o cambiados);
- lo que hay que cerrar antes de empezar;
- cómo trabaja cada parte y, por parte, qué cambia, sus pruebas y los archivos de creación que se actualizan;
- qué hacer al terminar y lo que sigue igual.

**El reporte** de Claude Code dice, por parte: qué se hizo, qué se reusó y qué es nuevo (con rutas), las decisiones nuevas, los pendientes y la salida de las revisiones.

**La respuesta del chat** es un mensaje corto, listo para pegar: el visto bueno con los cambios que hagan falta y qué sigue.

## Cómo está hecho

**El sello** (fase 1, parte 2). `pnpm revision` corre sus pasos en orden y, en verde, guarda en `.revision/sello.json` la huella de lo revisado: cada archivo que se guardaría, con el hash de git de su contenido, sin `docs/registros/` (`scripts/sello.ts`). El gancho de git antes de cada commit y de cada merge (`.githooks/pre-commit` y `pre-merge-commit` → `scripts/gancho-git.ts`) deja pasar un commit de solo registros (los `.md` de `docs/registros/`), corre `pnpm docs:revisar` para uno de solo documentos (si no queda nada sin agregar) y, para uno con código, compara el sello con la huella del índice: si no es exactamente lo que se revisó, no entra. `pnpm install` lo deja activo con `core.hooksPath`. Cómo se calcula la huella está en [estructura](../cimientos/ESTRUCTURA.md#cómo-está-hecho). Lo prueban `scripts/sello.prueba.ts` y `scripts/gancho-git.prueba.ts`.

**Los ganchos de Claude Code** (fase 1, parte 4) están en `.claude/settings.json`, y cada uno llama a su script con `node "$CLAUDE_PROJECT_DIR/scripts/…"`:

| Gancho | Evento | Script | Qué hace |
|---|---|---|---|
| De inicio | `SessionStart` (`startup` y `resume`) | `scripts/gancho-inicio.ts` | Con `CLAUDE_CODE_REMOTE=true` (la nube), corre `pnpm install --frozen-lockfile`, que instala el lockfile tal cual y, con el `prepare`, deja `core.hooksPath` en `.githooks`; si `docker info` falla, arranca `dockerd` aparte y espera hasta un minuto a que responda. Fuera de la nube no hace nada |
| Después de editar | `PostToolUse` de `Edit`, `Write` y `NotebookEdit` | `scripts/gancho-edicion.ts` | Corre la revisión rápida; en rojo sale con el código 2 y Claude ve el final de la salida |
| De fin | `Stop` | `scripts/gancho-fin.ts` | Corre la revisión rápida y cuenta los intentos por problema (abajo) |

**El conteo de intentos.** Cada revisión en rojo tiene una firma: el paso que falló y su primer error, sin renglón ni columna, así que el mismo error movido de lugar sigue siendo el mismo problema. El conteo por firma vive en `.claude/estado/intentos.json`, fuera de git, y un verde lo borra. En rojo, el gancho no deja terminar el turno (código 2) y dice el número de intento. Al tercero sobre el mismo problema pide el protocolo del modo; si el turno ya sigue por el propio gancho (`stop_hook_active`) y el problema sigue, deja terminar para no dar vueltas.

**El interruptor de modo** es `.claude/modo`: una palabra, `supervisado` o `autonomo`. El gancho de fin lo lee al tercer intento; cualquier otra cosa cuenta como `supervisado`.

**Los worktrees:** `worktree.baseRef: "head"` en `.claude/settings.json` hace que cada worktree salga de la rama de la fase, y `.worktreeinclude` copia `.env`. `.claude/worktrees/` está en `.gitignore`.

**Las pruebas:** `scripts/gancho-inicio.prueba.ts` instala de verdad en un repositorio temporal con y sin `CLAUDE_CODE_REMOTE=true`; `scripts/gancho-fin.prueba.ts` usa salidas de revisión simuladas con los dos modos; `scripts/gancho-edicion.prueba.ts` edita un archivo con un error de tipos.

*El script que revisa las carpetas de cada trabajador se agrega en la fase 19.*
