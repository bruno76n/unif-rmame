/**
 * La salud de un lote en proceso: atorado por máquina, sin datos de la tablet, atorado por falta de avance,
 * atrasado, en riesgo de atraso o en tiempo, en ese orden.
 * Fase 12 · docs/modulos/produccion/lotes.md (reglas 7 y 8)
 *
 * Puro: la tablet la calcula sin internet con lo que le bajó, y la API la vuelve a calcular con lo mismo. Los días
 * de trabajo son `general.dias_de_trabajo`; los días en que la tablet no subió nada de ningún lote no cuentan para el
 * atorado.
 */

import { Temporal } from "temporal-polyfill";
import type { DiaNegocio } from "../tipos/base.ts";
import { type DiaDeLaSemana, diasHabilesEntre } from "./fechas.ts";

/** Lo que dice la salud de un lote. */
export type SaludDeLote =
	| { tipo: "atorado_maquina"; operacion: string; falla: string }
	| { tipo: "sin_datos"; desde: DiaNegocio | null }
	| { tipo: "atorado"; operacion: string | null; dias: number }
	| { tipo: "atrasado" }
	| { tipo: "en_riesgo" }
	| { tipo: "en_tiempo" };

/** Lo que necesita la salud de un lote en proceso. */
export interface DatosDeSalud {
	/** El día de hoy, en hora de México. */
	hoy: DiaNegocio;
	fechaEntrega: DiaNegocio;
	/** Las piezas que le faltan: cortadas − merma − listas. */
	faltan: number;
	/** El día de su último registro vigente o, sin registros, el de su corte. */
	ultimoAvance: DiaNegocio;
	/** El día de la última sincronización de las tablets del taller; sin ninguna, vacío. */
	ultimaSincronizacion: DiaNegocio | null;
	/** Los días en que la tablet no subió nada de ningún lote: no cuentan para el atorado. */
	diasSinSubir: readonly DiaNegocio[];
	/** La operación del cuello de botella («Se junta»), si la hay. */
	cuelloDeBotella: string | null;
	/** Si una falla abierta detuvo la máquina de quien hace una operación con piezas esperando (fase 13). */
	atoradoPorMaquina: { operacion: string; falla: string } | null;
	diasDeTrabajo: readonly DiaDeLaSemana[];
	/** `produccion.lote_atorado_dias`. */
	loteAtoradoDias: number;
	/** `produccion.riesgo_atraso_dias`. */
	riesgoAtrasoDias: number;
}

/**
 * Los días de trabajo sin avance de un lote: los de trabajo después de su último avance y hasta hoy, menos los días
 * de trabajo de ese tramo en que la tablet no subió nada.
 * @returns Cuántos días de trabajo lleva sin avanzar.
 */
export function diasSinAvance(datos: DatosDeSalud): number {
	const habiles = diasHabilesEntre(datos.ultimoAvance, datos.hoy, datos.diasDeTrabajo);
	const enElTramo = new Set(
		datos.diasSinSubir
			.filter(
				(dia) =>
					Temporal.PlainDate.compare(dia, datos.ultimoAvance) > 0 &&
					Temporal.PlainDate.compare(dia, datos.hoy) <= 0 &&
					datos.diasDeTrabajo.some((deTrabajo) => deTrabajo === dia.dayOfWeek),
			)
			.map((dia) => dia.toString()),
	);
	return Math.max(0, habiles - enElTramo.size);
}

/**
 * La salud de un lote en proceso: gana la primera que aplica (regla 7).
 * @param datos Lo que se sabe del lote y de las tablets.
 * @returns Su salud, con lo que la pantalla dice de ella.
 */
export function saludDeLote(datos: DatosDeSalud): SaludDeLote {
	if (datos.atoradoPorMaquina !== null) return { tipo: "atorado_maquina", ...datos.atoradoPorMaquina };
	const sinSincronizar =
		datos.ultimaSincronizacion === null
			? Number.POSITIVE_INFINITY
			: diasHabilesEntre(datos.ultimaSincronizacion, datos.hoy, datos.diasDeTrabajo);
	if (sinSincronizar >= datos.loteAtoradoDias) return { tipo: "sin_datos", desde: datos.ultimaSincronizacion };
	const dias = diasSinAvance(datos);
	if (dias >= datos.loteAtoradoDias) return { tipo: "atorado", operacion: datos.cuelloDeBotella, dias };
	const faltanDias = datos.hoy.until(datos.fechaEntrega).days;
	if (faltanDias < 0) return { tipo: "atrasado" };
	if (datos.faltan > 0 && faltanDias <= datos.riesgoAtrasoDias) return { tipo: "en_riesgo" };
	return { tipo: "en_tiempo" };
}
