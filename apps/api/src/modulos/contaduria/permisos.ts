/**
 * Los permisos de `contaduria`: cuáles de sus campos son sueldo.
 * Fase 17 · docs/modulos/contaduria/nomina.md («Permisos») y decisión 370
 */

/**
 * Los montos de la nómina y de los descuentos: solo los ve quien tiene «ven sueldos y tarifas», y la bitácora que los
 * trae es sensible (`sensible_sueldos`).
 */
export const camposDeSueldoDeContaduria: readonly string[] = [
	"descuento_semanal_centavos",
	"total_nomina_centavos",
	"total_tiempo_nomina_centavos",
	"total_piezas_nomina_centavos",
	"total_correcciones_nomina_centavos",
	"total_descontado_nomina_centavos",
];
