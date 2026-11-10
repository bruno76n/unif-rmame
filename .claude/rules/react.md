---
paths:
  - "apps/web/**/*.tsx"
  - "apps/tablet/**/*.tsx"
  - "packages/interfaz/**/*.tsx"
---

# Reglas para las pantallas

> **Qué cubre:** cómo se escribe cada pantalla en React: componentes del sistema de diseño, textos de la guía, todos sus estados y ninguna regla del negocio.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../docs/fases/19-web-principal.md).
> **Se conecta con:** [diseño](../../docs/interfaz/DISENO.md) · [textos](../../docs/interfaz/TEXTOS.md) · [revisor de diseño](../agents/revisor-diseno.md)

1. **Solo componentes del sistema de diseño** (`packages/interfaz`). Nada de estilos sueltos ni colores escritos a mano: así todo se ve igual que la muestra.
2. **Los textos salen de la [guía de textos](../../docs/interfaz/TEXTOS.md),** con los estados en su forma fija (Por…, Esperando…, Sin…, En…).
3. **Todos los estados:** cargando, vacío, error, sin permiso, sin conexión y choque de versión. Ninguna pantalla se queda en blanco.
4. **Ninguna regla del negocio en la pantalla.** La pantalla pide y muestra; las reglas viven en la API. Una pantalla nunca pide datos que la cuenta no debe ver.
5. **Los datos con TanStack Query y el cliente del paquete compartido;** las pestañas, los filtros y el cajón abierto, en la dirección con TanStack Router. Así un enlace abre la pantalla tal como estaba, y otro departamento abre un cajón con un enlace, sin importar su componente.
6. **Los formularios con React Hook Form y el mismo esquema Zod del contrato:** la pantalla valida igual que la API.
7. **Se ve bien en el teléfono** y se usa con teclado: etiquetas, foco y orden.
8. **Cada pantalla se prueba con su captura contra la muestra** y comprobando que cada botón llame a su acción.

**Quién lo vigila:** el revisor de diseño y el auditor en la revisión de la fase de interfaz.
