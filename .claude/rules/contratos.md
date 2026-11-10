---
paths:
  - "packages/compartido/src/contratos/**"
---

# Reglas para los contratos

> **Qué cubre:** cómo se escribe el contrato de cada acción y cada consulta: una sola forma, en Zod, que usan la API, la web, la tablet y la documentación.
> **Estado:** Decidido.
> **Se construye en:** [fase 3](../../docs/fases/03-api-protocolo-e-idempotencia.md).
> **Se conecta con:** [API](../../docs/cimientos/API.md)

1. **Un contrato por acción o consulta,** en el paquete compartido, con su nombre exacto (`ventas.confirmar_pedido`). La API, la web, la tablet y la documentación salen del mismo contrato, así que nunca se desfasan.
2. **Entrada y salida en Zod,** estrictas: nada de campos de más ni tipos sueltos.
3. **Cada campo lleva su descripción en español** (`.describe()`), que sale en la documentación de la API.
4. **El contrato dice quién puede llamarla** (departamento y permiso fino) y **qué errores puede dar**, con su código.
5. **Dinero en centavos y fechas de negocio en hora de México,** con los tipos del paquete compartido.
6. **Un cambio que rompe un contrato** sube su versión y lo dice la revisión: una tablet o una caja con la versión vieja no puede quedarse a medias.

**Quién lo vigila:** el chequeo de tipos y la revisión completa (que compara `openapi.json` con el anterior); la auditoría de fase, lo demás. Todo el detalle está en [API.md](../../docs/cimientos/API.md).
