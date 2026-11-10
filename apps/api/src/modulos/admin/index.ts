/**
 * El módulo `admin`: cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, folios, archivos,
 * avisos, eventos, impresión, empresa y respaldos.
 * Fase 3 · docs/cimientos/MODULOS.md
 * Fase 4 · docs/fases/04-servicios-comunes.md
 *
 * Lo que tiene hoy: `comandos_recibidos` (que usa el corredor de acciones), la bandeja de `eventos` con
 * `admin.guardar_evento` y las vueltas de los trabajos programados. Lo demás llega con las partes de la
 * fase 4 y con la fase 5.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { guardarEvento } from "./internas/guardar-evento.ts";

export default definirModulo({
	nombre: "admin",
	internas: { guardar_evento: guardarEvento },
});
