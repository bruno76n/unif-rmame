/**
 * Los permisos de `produccion`: quién lee sus tablas, para los avisos en vivo.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («Permisos»)
 *
 * Personal lee los flujos para poner sus tarifas; Calidad, las operaciones, a las que apuntan sus defectos.
 */

/** Qué departamentos leen cada tabla de `produccion`, para los avisos en vivo. */
export const lectoresDeProduccion: Record<string, readonly string[]> = {
	operaciones: ["produccion", "personal", "calidad"],
	flujos: ["produccion", "personal", "catalogo"],
	flujo_operaciones: ["produccion", "personal"],
};
