/**
 * El módulo `admin`: cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, folios, archivos,
 * avisos, eventos, impresión, empresa y respaldos.
 * Fase 3 · docs/cimientos/MODULOS.md
 *
 * Hoy solo tiene la tabla `comandos_recibidos` (`tablas.ts`), que usa el corredor de acciones. Sus
 * acciones, internas y lecturas llegan en las fases 4 y 5.
 */

import { definirModulo } from "../../nucleo/modulos.ts";

export default definirModulo({ nombre: "admin" });
