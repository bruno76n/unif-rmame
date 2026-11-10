---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Reglas para el código

> **Qué cubre:** cómo se escribe todo archivo de código de Unifórmame: TypeScript estricto, nombres en español, la escalera antes de escribir, estructura, documentación y lo que nunca se recorta.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../../docs/fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../../AGENTS.md) · [CLAUDE.md](../../CLAUDE.md) · [forma de trabajo](../../docs/trabajo/FORMA-DE-TRABAJO.md) · [paquete compartido](../../docs/cimientos/PAQUETE-COMPARTIDO.md) · [estructura](../../docs/cimientos/ESTRUCTURA.md) · [configuración](../../docs/modulos/admin/configuracion.md)

1. **TypeScript estricto** (`strict`, sin `any` ni `as` para callar errores). Un error de tipos se ve al compilar, no en la fábrica.
2. **Nombres en español, sin acentos ni ñ:** `confirmarPedido`, `piezasPorTalla`, `anio`. Variables y funciones en camelCase; tipos y componentes en PascalCase (`CajonPedido`); tablas, columnas y acciones en snake_case, igual que en el esquema y el contrato (`ventas.confirmar_pedido`, `pedido_renglones`). Lo que impone el lenguaje o una librería se queda como viene, como los hooks de React, que empiezan con `use` (`usePedido`). El negocio se habla en español, y así nada se traduce.
3. **La escalera antes de escribir:**
   1. ¿Lo pide el archivo de creación? Si no, no se escribe.
   2. ¿Ya existe en el repositorio: un módulo, una acción interna, un componente, un cálculo del paquete compartido? Se reusa.
   3. ¿Lo resuelve la plataforma: Postgres, Node, el navegador (`Intl`, Temporal, Web Crypto, BarcodeDetector) o la impresora (ZPL)? Se usa.
   4. ¿Lo resuelve una librería que ya está en [ARQUITECTURA.md](../../docs/cimientos/ARQUITECTURA.md)? Se usa.
   5. Solo entonces, el mínimo código que cumple el criterio. Una librería nueva es una decisión que se anota.

   El mejor código es el que no hubo que escribir.
4. **Flojo con la solución, nunca con la lectura.** Antes de escribir se lee el archivo de creación de la parte y el código que se va a tocar.
5. **Limpio:** funciones chicas, nada duplicado ni muerto, lo más simple que cumpla. Nada de espagueti: si una función hace dos cosas, son dos funciones.
6. **Cada cosa en su carpeta,** según [ESTRUCTURA.md](../../docs/cimientos/ESTRUCTURA.md). Un archivo que no sabe dónde va es una pregunta para el plan, no un archivo en `utils/`.
7. **Todo documentado en español, con TSDoc:**
   - cada archivo empieza diciendo qué es, de qué fase es y qué archivo de creación lo describe;
   - cada función dice qué hace, qué recibe, qué regresa y por qué existe;
   - cada bloque con lógica lleva encima qué hace y por qué;
   - la documentación dice lo que el código hace hoy. Si el código cambia, se reescribe; nunca «antes hacía esto». La historia vive en git y en los registros.

   ```ts
   /**
    * Cuenta de material de un lote.
    * Fase 10 · docs/modulos/patronaje/cuenta-de-material.md
    */

   /**
    * Calcula lo que lleva un lote de cada material, en su unidad de inventario.
    * @param receta La versión de la receta con la que se corta.
    * @param piezasPorTalla Cuántas piezas de cada talla lleva el lote.
    * @returns Por material, la cantidad redondeada hacia arriba.
    * Es la única cuenta de material del sistema: la usan Ventas, Compras, Bodega y el corte.
    */
   ```
8. **Nunca se recorta:** la validación de los contratos, los permisos, la idempotencia, la bitácora, los errores que evitan perder datos, el dinero en centavos ni la accesibilidad.
9. **Ningún dato del negocio en la lógica.** Un plazo, un porcentaje o una opción de operación es un parámetro con su valor inicial (ver [configuración](../../docs/modulos/admin/configuracion.md)).
10. **Ningún secreto en el código.** Solo en variables de entorno, que se leen en un solo lugar al arrancar.

**Quién lo vigila:** Biome y el chequeo de tipos, en la revisión rápida (1, 5 en parte y 10 con la revisión de secretos); la auditoría de fase, lo demás.
