/**
 * Los permisos de `personal`: quién lee sus tablas y cuáles de sus campos son sueldo.
 * Fase 7 · docs/modulos/personal/personas.md («Permisos»)
 */

/** Qué departamentos leen cada tabla de `personal`, para los avisos en vivo. */
export const lectoresDePersonal: Record<string, readonly string[]> = {
	personas: ["personal", "admin"],
};

/** Los campos de sueldo: solo los ve quien tiene «ven sueldos y tarifas». */
export const camposDeSueldoDePersonal: readonly string[] = ["pago_dia_centavos"];
