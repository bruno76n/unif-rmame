/**
 * Lo que guarda la persona desde las pantallas, por la cola: registrar una operación, reportar una falla de máquina y
 * tomar consumibles. El registro y la falla nacen también en la copia, «guardada aquí», para que la pantalla los vea al
 * momento: el registro baja el tope y suma a «Hoy llevas»; la máquina queda «Reportada desde hoy».
 * Fase 20 · docs/interfaz/tablet.md («Registrar una operación», «Falla de máquina» y «Tomar consumible»)
 */

import { v7 as uuidv7 } from "uuid";
import type { BaseDeLaTablet } from "../copia/base.ts";
import { encolar } from "./cola.ts";

/**
 * Guarda `produccion.registrar_operacion` y su registro en la copia.
 * @param base La base local.
 * @param registro La persona, el bulto con su lote, la operación del flujo, las piezas y si fue sin internet.
 */
export async function registrarOperacion(
	base: BaseDeLaTablet,
	registro: {
		personaId: string;
		bultoId: string;
		loteId: string;
		flujoOperacionId: string;
		buenas: number;
		danadas: number;
		sinInternet: boolean;
	},
): Promise<void> {
	const id = uuidv7();
	const piezas = {
		bulto_id: registro.bultoId,
		flujo_operacion_id: registro.flujoOperacionId,
		piezas_buenas: registro.buenas,
		piezas_danadas: registro.danadas,
	};
	await encolar(base, {
		accion: "produccion.registrar_operacion",
		datos: { id, ...piezas, sin_internet: registro.sinInternet },
		persona_id: registro.personaId,
		renglones: [
			{
				tabla: "registros_operacion",
				renglon: {
					id,
					...piezas,
					lote_id: registro.loteId,
					persona_id: registro.personaId,
					hecho_en: new Date().toISOString(),
					estado: "vigente",
					origen: "tablet",
				},
			},
		],
	});
}

/**
 * Guarda `mantenimiento.reportar_falla` y la falla en la copia.
 * @param base La base local.
 * @param falla La persona, la máquina, el motivo y si fue sin internet.
 */
export async function reportarFalla(
	base: BaseDeLaTablet,
	falla: { personaId: string; maquinaId: string; motivoId: string; sinInternet: boolean },
): Promise<void> {
	const id = uuidv7();
	await encolar(base, {
		accion: "mantenimiento.reportar_falla",
		datos: { id, maquina_id: falla.maquinaId, motivo_falla_id: falla.motivoId, sin_internet: falla.sinInternet },
		persona_id: falla.personaId,
		renglones: [
			{
				tabla: "fallas",
				renglon: {
					id,
					maquina_id: falla.maquinaId,
					motivo_falla_id: falla.motivoId,
					estado: "reportada",
					hecho_en: new Date().toISOString(),
				},
			},
		],
	});
}

/**
 * Guarda `produccion.tomar_consumible` con lo que lleva más de cero.
 * @param base La base local.
 * @param toma La persona y cuántos de cada consumible, en su unidad de la tablet.
 */
export async function tomarConsumible(
	base: BaseDeLaTablet,
	toma: { personaId: string; renglones: { materialId: string; cantidad: number }[] },
): Promise<void> {
	await encolar(base, {
		accion: "produccion.tomar_consumible",
		datos: {
			id: uuidv7(),
			renglones: toma.renglones
				.filter((renglon) => renglon.cantidad > 0)
				.map((renglon) => ({ material_id: renglon.materialId, cantidad: renglon.cantidad })),
		},
		persona_id: toma.personaId,
	});
}
