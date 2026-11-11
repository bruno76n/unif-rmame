/**
 * El tope de un bulto en una operación: cuántas piezas todavía se pueden registrar ahí.
 * Fase 12 · docs/modulos/produccion/lotes.md (regla 6) y registros-de-operacion.md (regla 3)
 *
 * Puro: la tablet lo calcula sin internet con lo que le bajó, para no dejar registrar de más, y la API lo vuelve a
 * calcular al aplicar; lo que pasa del tope se aplica igual y abre su excepción.
 */

/** Lo que se sabe del bulto en esa operación. */
export interface DatosDelTope {
	/** Las piezas del bulto (las cortadas que lleva). */
	piezasDelBulto: number;
	/** Las buenas vigentes de la operación anterior en ese bulto; vacío si la anterior es el corte. */
	buenasDeLaAnterior: number | null;
	/** Las buenas y dañadas vigentes de esta operación en ese bulto. */
	hechasEnEsta: number;
}

/**
 * El tope: lo que hizo la anterior en ese bulto (o las piezas del bulto, en la primera después del corte) menos lo
 * que esta operación ya registró ahí; nunca menos de cero.
 * @param datos Lo del bulto en esa operación.
 */
export function topeDelBulto(datos: DatosDelTope): number {
	const limite = datos.buenasDeLaAnterior ?? datos.piezasDelBulto;
	return Math.max(0, limite - datos.hechasEnEsta);
}

/**
 * Si un registro pasa del tope.
 * @param datos Lo del bulto en esa operación, antes del registro.
 * @param piezas Las buenas más las dañadas del registro.
 */
export function pasaDelTope(datos: DatosDelTope, piezas: number): boolean {
	return piezas > topeDelBulto(datos);
}
