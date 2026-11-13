# Sistema de diseño

> **Qué cubre:** el sistema de diseño de las pantallas sobre Tailwind y shadcn/ui: los colores, la paleta de escuelas, la tipografía, las medidas, los componentes, los estados en cuadro sólido y los íconos; la muestra (versión 36) como referencia visual y lo que no se construye de ella.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../fases/19-web-principal.md).
> **Se conecta con:** [textos](TEXTOS.md) · [lo común de las pantallas](comunes.md) · [regla de pantallas](../../.claude/rules/react.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md) · [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md) · [estructura](../cimientos/ESTRUCTURA.md) · [arquitectura](../cimientos/ARQUITECTURA.md) · [pantallas de la tablet](tablet.md) · [fase 19](../fases/19-web-principal.md)

## Para qué sirve

Que cada pantalla se vea como la muestra que aprobó Bruno sin copiar su código, y que todas se vean iguales entre sí. Ejemplo: la tabla de Pendientes de Bodega y la de Contaduría son el mismo componente, con los mismos renglones de 54 px, el mismo encabezado gris y el mismo cuadro de estado; solo cambian sus columnas.

## Reglas

1. **La muestra es la referencia visual,** no el código: `docs/interfaz/muestra/sistema-alameda.html` (versión 36). Cada pantalla se compara contra su captura (ver [revisor de diseño](../../.claude/agents/revisor-diseno.md)). La muestra es un solo HTML con datos de juguete: no se copia su código ni su lógica.
2. **Todo sale de `packages/interfaz`:** los componentes de shadcn/ui (sobre Base UI) se copian ahí y se ajustan a estos valores. Un departamento nunca define botones, tablas ni colores propios (ver [estructura](../cimientos/ESTRUCTURA.md#las-pantallas-por-dentro)).
3. **Un valor, un token:** cada color, radio, sombra y medida vive una vez en `packages/interfaz/src/tokens.css`, como tema de Tailwind 4 (`@theme`). Nada escrito a mano en una pantalla.
4. **Siempre modo claro.**
5. **Los estados van en cuadro de color sólido,** con texto blanco en negritas y sin punto (decisión de Bruno, que reemplaza la cápsula con punto). Qué estado lleva qué color está en [textos](TEXTOS.md#el-color-de-cada-estado).
6. **Íconos de lucide-react,** de 18 px (17 en botones y 13 dentro de la barra de indicadores), con trazo de 1.9. El ícono de un tipo de pendiente va sobre un cuadro claro de su color.
7. **Las cifras van con números tabulares,** y el dinero y las cantidades, alineados a la derecha.
8. **Accesible:** foco visible con el anillo de la marca, cada campo con su etiqueta, contraste suficiente, todo se usa con teclado, y respeta «reducir movimiento».
9. **Es una aplicación, no una página** (decisión 747): el armazón ocupa justo la pantalla y la página nunca se desplaza entera. El menú y la barra superior se quedan quietos, y cada zona se desplaza por su cuenta: el menú, el panel de contenido, una tabla larga y el cuerpo de un cajón. Desplazar una no mueve a las otras.
10. **El teléfono también:** hasta 980 px el menú se esconde y se abre con su botón; hasta 700 px la barra de indicadores pone dos cifras por renglón, las tablas se desplazan de lado y el cajón ocupa toda la pantalla.

## Los colores

### Base

| Token | Valor | Para qué |
|---|---|---|
| `fondo` | #F3F4F7 | El fondo de la página |
| `panel` | #FFFFFF | Menú, tarjetas, tablas, cajones y ventanas |
| `suave` | #F5F6F9 | Encabezado de tabla, pie del cajón, cuadros de datos |
| `riel` | #E8EAF1 | El fondo de las pestañas y los selectores |
| `tinta` | #17181C | Texto principal y botón principal |
| `tinta2` | #41444D | Texto secundario |
| `tinta3` | #6F737E | Etiquetas, migas y lo apagado |
| `linea` · `linea2` | #E6E8EE · #D6D9E1 | Separadores y bordes |
| `marca` | #C2367A | Foco, enlaces, seleccionado y el departamento activo (fondo #FBEAF2, texto #8E2160) |

### Los de cada tipo

Para el ícono de un tipo de pendiente, de una cifra o de un departamento: `azul` #3B6FE0 · `verde` #23955A · `ambar` #D48A12 · `rojo` #D23F35 · `violeta` #7457DB · `verde azulado` #14928F · `pizarra` #5B6271 · `rosa` #C2367A.

### Los colores de estado

Saturados, sin pasteles:

| Token | Valor | Lleva |
|---|---|---|
| `estado-rojo` | #D5443B | Vencido o bloqueado |
| `estado-ambar` | #E9A03F | Por hacer |
| `estado-azul` | #4B7BE5 | Informativo |
| `estado-verde` | #3FAF6E | Resuelto |
| `estado-gris` | #A3A9B4 | Depende de otra área, en borrador o sin empezar |
| `estado-morado` | #8B6AD6 | Listo en aduana · Por despachar |
| `estado-verde-azulado` | #35A7A1 | Entrega parcial |
| `estado-naranja` | #EE8648 | Reservado para etapas que lo pidan |

El texto de error junto a un campo va en #C23A31; el de una advertencia dentro de la pantalla, en ámbar #B3690C; el de algo bien hecho, en #1F8A52. El aviso de abajo es otra cosa: oscuro, con su ícono de color (ver «Aviso» en los componentes).

## La paleta de escuelas

El servidor le da a cada escuela nueva el siguiente color de esta lista, en orden, y al acabarse vuelve a empezar (ver [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md)):

| Orden | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Color | #0F7C6B | #C0432B | #5B4BA8 | #2A6FA3 | #9A7B14 | #8C3F6B |

Es la muestra de color de la escuela en Catálogo, en los filtros y en los grupos por cliente. La lista vive en el paquete compartido, porque la usan el servidor y las pantallas.

## Tipografía

- La letra del sistema: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Sin letras descargadas.
- Base de 14 px con interlineado de 1.45, en pesos 500, 600 y 700.
- Título del departamento: 36 px (28 en teléfono). Título de sección: 22 px. Título dentro del cajón: 32 px (26 en teléfono). Subtítulo de bloque: 18 px. Etiquetas de columna: 12.5 px.
- Folios y cifras en negritas, con números tabulares; los códigos de barras, en letra de ancho fijo.

## Medidas

| Qué | Medida |
|---|---|
| Menú lateral | 244 px de ancho, de alto completo, blanco con borde a la derecha |
| Barra superior | 64 px de alto, fija |
| Página | Hasta 1,440 px de ancho, con 32 px a los lados (16 en teléfono) |
| Radios | 6 px (chico), 10 px (mediano) y 12 px (grande) |
| Renglón de tabla | 54 px de alto; encabezado de 48 px |
| Botón | 44 px de alto (34 el chico), redondeado de 10 px |
| Campo de captura | 48 px de alto (44 dentro de una ventana) |
| Cajón | 620 px de ancho, 860 el ancho; entra por la derecha a 12 px de las orillas |
| Ventana | 470 px de ancho, 580 la ancha |
| Cuadro de estado | 136 px de ancho como mínimo y 30 px de alto, radio de 6 px, letra de 12.5 px en negritas |
| Aviso de abajo | Al centro, a 26 px de la orilla, por 3 segundos; fondo `tinta`, texto blanco de 13.5 px y radio de 10 px |

## Los componentes

Todos viven en `packages/interfaz`, cada familia en su carpeta (`botones/`, `captura/`, `estados/`, `contenedores/`, `tablas/`, `pagina/`, `avance/` y `graficas/`; el árbol está en [estructura](../cimientos/ESTRUCTURA.md#el-sistema-de-diseño-por-dentro)), con su historia de uso escrita en su TSDoc:

| Componente | Qué es |
|---|---|
| `Armazon` | El menú lateral, la barra superior, la búsqueda «¿Dónde está?», la cuenta y la campana (ver [lo común](comunes.md)) |
| `PaginaDepartamento` | El título del departamento con sus pestañas abajo y la acción principal arriba a la derecha |
| `BarraIndicadores` | La franja de cifras de Pendientes: ícono y nombre, número con su unidad, una línea de contexto, una gráfica chica si cabe, y la barra repartida por estado. Cada cifra lleva a su pestaña |
| `PanelPendientes` | Los filtros por grupo con su conteo y la tabla de pendientes |
| `Tabla` | La tabla de datos, con TanStack Table: orden por columna, selección, renglón de suma, renglón «agregar», y TanStack Virtual con muchos renglones |
| `Estado` | El cuadro sólido de un estado, con su línea de abajo si la lleva |
| `Cajon` · `Ventana` | El panel de la derecha y el recuadro del centro, con su encabezado, su cuerpo y su pie |
| `BotonConCifra` | Arriba del cuerpo del cajón, lleva a lo relacionado en otro departamento |
| `Aviso` | El mensaje de abajo: oscuro, con texto blanco y un ícono redondo que dice cómo salió, verde con palomita (#3FCB7E) o ámbar con «!» (`estado-ambar`) |
| `Boton` | Principal (negro), secundario (blanco con borde), fantasma (solo texto) y de peligro (texto rojo) |
| `Campo` · `Selector` · `Interruptor` · `Casilla` · `Filtros` | La captura, con su etiqueta, su mensaje de error abajo y su foco |
| `Hilo` | Las seis paradas del pedido con sus piezas y su línea corta |
| `BarraAvance` | La barra de avance por etapa, en los colores de cada etapa |
| `Pasos` | Los pasos de un documento, con el actual marcado |
| `GraficaChica` · `Grafica` | Las gráficas de las cifras y de Indicadores, con Recharts |
| `EstadoDePantalla` | Cargando, vacío, error, sin permiso, sin conexión y choque de versión (ver [lo común](comunes.md#los-estados-de-una-pantalla)) |

## Lo que no se construye de la muestra

- **Lo de juguete:** el cambiador de cuenta del menú (cada persona entra con su Google), «Quitar el internet» y la orientación de la tablet, la fecha fija del 11 de octubre, los datos de ejemplo y lo que solo daba el aviso (PDF, impresoras, guía, paquete del contador): el sistema lo hace de verdad.
- **El punto dentro del estado** y la cápsula suave: el estado es el cuadro sólido de la regla 5.
- **El dibujo de la tela** (lisa, rayas o cuadros) en la muestra de cada escuela: la escuela solo guarda su color.
- **Los errores de la muestra:** cada archivo de pantallas dice los de su departamento; en todas, los plurales y las unidades van bien escritos (ver [textos](TEXTOS.md#reglas)) y cerrar con cambios sin guardar pregunta antes.

## Cómo está hecho

**Fase 19, parte 1 (el sistema de diseño).**

- **Los tokens** están en `packages/interfaz/src/tokens.css`, como tema de Tailwind 4 (`@theme`): los colores de esta página, la letra, los radios, las medidas (`h-boton`, `h-renglon`, `w-menu`, `max-w-cajon`…), las sombras y los dos cortes (`max-menu:` hasta 980 px y `max-telefono:` hasta 700). La hoja de la web los importa después de `tailwindcss`.
- **Los componentes** van por familias, cada una en su carpeta (decisión 743; el árbol en [estructura](../cimientos/ESTRUCTURA.md#el-sistema-de-diseño-por-dentro)). No reciben clases sueltas: cada uno pinta con los tokens, y quien lo usa solo pasa datos.
- **El color de cada estado** sale de `estados/colores.ts`, la tabla de [textos](TEXTOS.md#el-color-de-cada-estado) más las formas con datos (decisión 745); la lista de colores es una sola, `coloresDeEstado` del paquete compartido, la misma de los contratos (decisión 753).
- **Lo que repetían los departamentos** pasó al sistema de diseño (decisión 758): `pagina/seccion.tsx` (`Seccion`, `TituloDeBloque`), `pagina/dato.tsx`, `estados/recuadro.tsx` (el aviso de color dentro de un cajón), `estados/textos-con-tono.tsx` (`TextoConTono`, `LineaDeAviso`), `estados/muestra-de-color.tsx` (el color de la escuela de un cliente), `captura/buscador.tsx` y `puntoDelEstado` en `estados/colores.ts`; `BotonConCifra` va también sin cifra; `contenedores/tarjeta.tsx`, el panel con su orilla roja o ámbar (decisión 766); `contenedores/grupo-plegable.tsx`, el grupo de una pestaña con su punto de color, su casilla y cuántos trae (decisión 768); `pagina/panel.tsx`, el panel con su título (decisión 770); y `tablas/dos-renglones.tsx`, la celda con su dato y su detalle (decisión 772).
- **Lo que pidieron las pantallas** (decisiones 754 y 774): el `tono` del número de una cifra, la fecha roja, el botón negro y el botón apagado de un pendiente, y el `nombre` de una parada del hilo. La barra de cifras pone sus columnas con clases, y en el teléfono quedan dos por renglón.
- **Lo interactivo:** el interruptor, la casilla, el cajón y la ventana son de Base UI; el selector es el `select` del navegador (decisión 746). La tabla usa TanStack Table 9 (orden, selección) y, desde 100 renglones, TanStack Virtual. Las gráficas, Recharts.
- **El armazón** mide el alto de la pantalla (`h-dvh`) y solo su panel de contenido (`data-panel="contenido"`) se desplaza; el menú lleva su propia área (decisión 747).
- **La prueba** es `muestra/componentes.prueba.ts`: abre el catálogo (`muestra/catalogo.tsx`, todos los componentes en todos sus estados) en Chromium, en escritorio y en teléfono, mide cada componente contra esta página y guarda las capturas en `.revision/capturas/componentes/` para el [revisor de diseño](../../.claude/agents/revisor-diseno.md).
