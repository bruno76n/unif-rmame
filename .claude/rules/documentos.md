---
paths:
  - "docs/**/*.md"
  - "AGENTS.md"
  - "CLAUDE.md"
  - ".claude/**/*.md"
---

# Reglas para los documentos

> **Qué cubre:** cómo se escribe y se mantiene cada archivo de creación: el encabezado, lo decidido, un dato en un solo lugar, enlaces que funcionan y «Cómo está hecho».
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../../docs/fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [forma de trabajo](../../docs/trabajo/FORMA-DE-TRABAJO.md) · [índice](../../docs/INDICE.md)

1. **Encabezado de cuatro líneas,** justo después del título:

   ```markdown
   # Tema

   > **Qué cubre:** qué dice este archivo, en una frase.
   > **Estado:** Decidido | En diseño | Por investigar | Para después.
   > **Se construye en:** [fase N](ruta al archivo de la fase).
   > **Se conecta con:** [archivo](ruta relativa) · [archivo](ruta relativa)
   ```

   `CLAUDE.md` empieza con `@AGENTS.md` y lleva su encabezado después. Las reglas y los agentes de `.claude/` llevan antes su bloque de configuración. Los archivos de fase llevan el encabezado de su plantilla: **Etapa**, **Estado**, **Antes de empezar** y **Se conecta con**. Así cada archivo dice de entrada qué es y con qué se conecta.
2. **Solo lo decidido.** Lo que falta decidir va a «Pendientes» de `REGISTROS.md`, no al texto con un «quizás».
3. **Cada archivo se entiende solo.** Lo que necesita de otro lo dice completo para su caso, con la regla y los números que usa, y enlaza al dueño para el detalle.
4. **Cada dato vive en un solo archivo.** Los demás lo resumen para su caso y lo enlazan; nunca copian la regla entera. Así nada se contradice.
5. **Enlaces relativos que funcionan, y conexiones en los dos sentidos:** si A dice que se conecta con B, B dice que se conecta con A.
6. **Los nombres del código, igual que en el código:** en español, sin acentos ni ñ, entre comillas invertidas (`inventario.reservar`, `pedido_renglones`).
7. **Corto y directo,** en español claro y sin relleno. Listas y tablas cuando ayudan a leer; un ejemplo con datos reales cuando aclara.
8. **«Cómo está hecho»:** al terminar su parte, Claude Code llena esa sección del archivo con dónde vive en el código, qué reglas cumple y qué pruebas lo demuestran.
9. **Cada archivo nuevo entra al [índice](../../docs/INDICE.md)** con una línea de qué cubre.
10. **Un archivo desactualizado nunca es error del código.** Se pone al día y ya; lo mismo los registros.

**Quién lo vigila:** `pnpm docs:revisar` (1, 5 y 9: encabezados, enlaces, anclas, conexiones en los dos sentidos y que todo esté en el índice); la auditoría de fase, lo demás.
