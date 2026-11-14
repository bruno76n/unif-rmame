/**
 * La etiqueta de la receta de un lote, con su color: la misma en Lotes («Verificada») y en la captura del corte
 * («Receta verificada»), para que Producción la pinte igual en todas sus pestañas.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes», «Corte») y docs/interfaz/TEXTOS.md («Sin + lo que falta»)
 */

/** Cómo se dice la receta de un lote y su color: en una tabla (`texto`) y en el encabezado de la captura. */
export const estadosDeReceta = {
	verificada: { texto: "Verificada", enLaCaptura: "Receta verificada", color: "verde" },
	sin_verificar: { texto: "Sin verificar", enLaCaptura: "Sin verificar", color: "ambar" },
	sin_receta: { texto: "Sin receta", enLaCaptura: "Sin receta", color: "rojo" },
} as const;
