/**
 * Las fechas del negocio: el día de negocio en hora de México, las semanas que empiezan en lunes y
 * los días hábiles.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Fechas y horas»)
 *
 * Puro: «ahora» y los días de trabajo llegan como parámetros. Los días de trabajo son el parámetro
 * `general.dias_de_trabajo` ya leído (lunes a sábado al inicio, ver docs/modulos/admin/configuracion.md).
 */

import type { DiaNegocio, Momento } from "../tipos/base.ts";

/** La zona del negocio: siempre la hora de México, nunca la hora local del servidor. */
export const zonaDelNegocio = "America/Mexico_City";

/** Un día de la semana como lo numera ISO 8601 y Temporal: 1 es lunes y 7 es domingo. */
export type DiaDeLaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * El día de negocio de un momento: la fecha en hora de México.
 * @param momento Cuándo pasó: el `ocurrido_en` de un aparato o la hora del servidor.
 * @returns La fecha en México. Una venta de las 23:30 es de ese día, no del siguiente.
 */
export function diaDeNegocio(momento: Momento): DiaNegocio {
	return momento.toZonedDateTimeISO(zonaDelNegocio).toPlainDate();
}

/**
 * El lunes de la semana de un día; las semanas se nombran por su lunes.
 * @param dia Cualquier día.
 * @returns Ese mismo día si es lunes, o el lunes anterior.
 */
export function inicioDeSemana(dia: DiaNegocio): DiaNegocio {
	return dia.subtract({ days: dia.dayOfWeek - 1 });
}

/**
 * Revisa que haya días de trabajo con los cuales contar.
 * @throws RangeError si la lista está vacía o trae un número que no es día de la semana.
 */
function revisarDiasDeTrabajo(diasDeTrabajo: readonly DiaDeLaSemana[]): Set<number> {
	const dias = new Set<number>(diasDeTrabajo);
	if (dias.size === 0 || [...dias].some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 7)) {
		throw new RangeError("los días de trabajo tienen que ser al menos uno, del 1 (lunes) al 7 (domingo)");
	}
	return dias;
}

/**
 * Cuenta los días hábiles después de un día y hasta otro, incluido el último.
 * @param desde El día de partida, que no se cuenta.
 * @param hasta El último día, que sí se cuenta si es de trabajo.
 * @param diasDeTrabajo Los días de trabajo de `general.dias_de_trabajo`.
 * @returns Cuántos días de trabajo hay en ese tramo; cero si `hasta` no es posterior a `desde`.
 * Así se mide, por ejemplo, el «lote atorado» de 2 días hábiles sin piezas reportadas.
 */
export function diasHabilesEntre(
	desde: DiaNegocio,
	hasta: DiaNegocio,
	diasDeTrabajo: readonly DiaDeLaSemana[],
): number {
	const dias = revisarDiasDeTrabajo(diasDeTrabajo);
	const largo = desde.until(hasta, { largestUnit: "days" }).days;
	if (largo <= 0) return 0;
	// Cada semana completa trae todos los días de trabajo; lo que sobra se cuenta día por día.
	const semanas = Math.floor(largo / 7);
	let cuenta = semanas * dias.size;
	for (let dia = desde.add({ days: semanas * 7 + 1 }); dia.until(hasta).days >= 0; dia = dia.add({ days: 1 })) {
		if (dias.has(dia.dayOfWeek)) cuenta++;
	}
	return cuenta;
}

/**
 * Avanza un número de días hábiles, saltando los días que no son de trabajo.
 * @param dia El día de partida.
 * @param cuantos Cuántos días hábiles avanzar, de cero en adelante.
 * @param diasDeTrabajo Los días de trabajo de `general.dias_de_trabajo`.
 * @returns El día de trabajo al que se llega; con cero, el mismo día.
 * @throws RangeError si `cuantos` no es un entero de cero en adelante o no hay días de trabajo.
 */
export function sumarDiasHabiles(
	dia: DiaNegocio,
	cuantos: number,
	diasDeTrabajo: readonly DiaDeLaSemana[],
): DiaNegocio {
	const dias = revisarDiasDeTrabajo(diasDeTrabajo);
	if (!Number.isSafeInteger(cuantos) || cuantos < 0) throw new RangeError(`${cuantos} no es un número de días hábiles`);
	let resultado = dia;
	for (let faltan = cuantos; faltan > 0; ) {
		resultado = resultado.add({ days: 1 });
		if (dias.has(resultado.dayOfWeek)) faltan--;
	}
	return resultado;
}
