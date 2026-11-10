# Fase 22: Seguridad completa ●

> **Etapa:** Lanzamiento.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 21](21-pruebas-de-punta-a-punta.md) · [fase 23](23-puesta-en-marcha.md) · [seguridad](../cimientos/SEGURIDAD.md)

## Objetivo

Antes de salir a internet, el sistema entero se revisa como lo atacaría alguien: cada acción y cada consulta con cada tipo de cuenta y de aparato, cada respuesta con lo que no debe traer, cada límite, cada encabezado y cada secreto. Lo que dice [seguridad](../cimientos/SEGURIDAD.md) y todavía no existe se construye aquí, y lo que encuentren las pruebas se corrige en su módulo.

## Depende de

- [Fase 21](21-pruebas-de-punta-a-punta.md), terminada y en verde: el sistema completo funciona de punta a punta.

## Qué se construye

### Parte 1 · Lo que falta de seguridad

**Construye:** los encabezados de la API con @fastify/helmet y los del sitio estático de la web y de la tablet; CORS con su único origen; los límites por sesión o llave y los anónimos, con @fastify/rate-limit y su cuenta en la base; el límite del cuerpo; el tachado del registro técnico; y los parámetros `admin.peticiones_por_minuto` y `admin.peticiones_anonimas_por_minuto`.

**Leer:**
- [seguridad](../cimientos/SEGURIDAD.md) — todo.
- [acceso con Google](../modulos/admin/acceso-con-google.md#la-tabla-intentos_recientes) — la tabla de intentos que comparten las instancias.
- [API](../cimientos/API.md#los-errores) — la forma del `413` y del `429`.

### Parte 2 · La matriz de permisos

**Construye:** una prueba que sale de los contratos: por cada acción y cada consulta, la llama sin sesión, con una cuenta de cada departamento, sin el permiso fino, sin ser la dueña, sin «Confirmar con Google» reciente, con cada tipo de aparato y con la cuenta de soporte, y revisa que solo pase quien dice su contrato.

**Leer:**
- [acceso y permisos](../cimientos/ACCESO-Y-PERMISOS.md) — el orden de la revisión de cada llamada y la matriz que sale de los contratos.
- [permisos](../modulos/admin/permisos.md) — los departamentos y los permisos finos.
- [sincronización](../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato) — el alcance de cada aparato.

### Parte 3 · El recorte

**Construye:** una prueba por consulta que la pide con cada departamento que la puede leer y revisa que no viaje lo que no debe: precios a Aduana, Bodega, Producción, Calidad y Mantenimiento; saldos sin Contaduría; sueldos, tarifas y montos de nómina sin «ven sueldos y tarifas»; montos a la cuenta de soporte; y un registro ajeno como `404`. Lo mismo para las hojas y las etiquetas, para los avisos en vivo y para el historial de los cajones.

**Leer:**
- [permisos](../modulos/admin/permisos.md#qué-ve-cada-departamento) — qué no ve cada departamento.
- [API](../cimientos/API.md#el-recorte-según-la-cuenta) — cómo se recorta y qué dice `recortado`.
- [bitácora](../modulos/admin/bitacora.md) — el recorte de los sueldos en la bitácora.

### Parte 4 · Lo que intentaría alguien de fuera

**Construye:** las pruebas de ataque: ids de documentos ajenos en acciones, consultas, archivos y etiquetas; acciones con otro `Origin`; una sesión cerrada o vencida que se reusa; la cookie sin sus banderas; los avisos en vivo sin sesión; códigos de registro al azar; una dirección firmada vencida o de otro archivo; un archivo de otro tipo o más grande que lo declarado; y tandas de aparato mal formadas, de otra ubicación, de un aparato revocado o con comandos de más, generadas al azar con fast-check.

**Leer:**
- [seguridad](../cimientos/SEGURIDAD.md#lo-que-llega-de-los-aparatos-y-de-fuera) — qué se revisa de lo que llega.
- [acceso con Google](../modulos/admin/acceso-con-google.md), [dispositivos](../modulos/admin/dispositivos.md) y [archivos](../modulos/admin/archivos.md) — las sesiones, los códigos, las llaves y las direcciones firmadas.
- [sincronización](../cimientos/SINCRONIZACION.md#subir--post-v1syncsubir) — cómo se aparta lo que no cumple.

### Parte 5 · Secretos y dependencias

**Construye:** la búsqueda de secretos sobre toda la historia de git, no solo sobre lo nuevo; la revisión de que ningún secreto ni hash aparece en la bitácora, en los eventos, en las respuestas guardadas ni en el registro técnico de una corrida completa de los flujos; y `pnpm audit` sin vulnerabilidades altas ni críticas en lo que llega a producción.

**Leer:**
- [seguridad](../cimientos/SEGURIDAD.md#lo-que-nunca-se-registra) — lo que nunca se registra.
- [idempotencia y concurrencia](../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) — lo que guarda una respuesta para reintentos.

## Cómo se construye

- Un solo agente, una parte a la vez.
- **La matriz y el recorte salen de los contratos,** no de una lista escrita a mano: una acción nueva entra sola a la prueba.
- **Lo que se encuentra se corrige en su módulo,** con el bucle de resolución y su prueba en ese módulo; la prueba de esta fase solo lo vuelve a correr.
- **Las pruebas de ataque usan la API como la usaría alguien de fuera:** HTTP, sin entrar a la base ni llamar funciones por dentro.

## Excepciones permitidas

- Esta fase puede tocar el código de cualquier módulo, solo para corregir lo que encuentra, con su prueba.
- Lo que solo se comprueba con los servicios de verdad (el certificado del dominio, los encabezados de Render en producción) queda en la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente) de la [fase 23](23-puesta-en-marcha.md).

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Cada acción y cada consulta solo deja pasar a quien dice su contrato, y responde `401`, `403` o `404` como dice [acceso y permisos](../cimientos/ACCESO-Y-PERMISOS.md) | `pruebas/seguridad/matriz.prueba.ts` |
| Ninguna consulta, hoja, etiqueta, aviso en vivo ni historial manda lo que la cuenta no debe ver, y `recortado` dice qué faltó | `pruebas/seguridad/recorte.prueba.ts` |
| Un id ajeno responde `404` en acciones, consultas, archivos y etiquetas | `pruebas/seguridad/ajenos.prueba.ts` |
| Una acción con otro `Origin` responde `403 origen_no_valido`, y CORS no contesta a otro origen | `pruebas/seguridad/origen.prueba.ts` |
| Cada límite responde `429` al pasarse, también repartido entre dos instancias, y deja pasar al volver su ventana | `pruebas/seguridad/limites.prueba.ts` |
| La API y el sitio estático mandan sus encabezados de seguridad | `pruebas/seguridad/encabezados.prueba.ts` |
| Tandas al azar mal formadas, ajenas, de un aparato revocado o de más no aplican nada que no debían y no detienen la cola | `pruebas/seguridad/aparatos.prueba.ts` |
| Ningún secreto, PIN ni hash aparece en la bitácora, en los eventos, en las respuestas guardadas ni en el registro técnico de una corrida de los flujos | `pruebas/seguridad/secretos.prueba.ts` |
| La búsqueda de secretos no encuentra nada en toda la historia de git | La revisión completa |
| `pnpm audit` sin vulnerabilidades altas ni críticas | La revisión completa |

## Revisión de fase

Delicada ●: cuatro [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **permisos y datos personales** (la matriz completa, el recorte y los `404`);
- **secretos** (variables, llaves, cookies, registros y la historia de git);
- **sincronización** (lo que llega de los aparatos, el alcance y el aparato revocado);
- **dinero** (que ningún monto llegue a quien no lo debe ver, ni en una hoja).
