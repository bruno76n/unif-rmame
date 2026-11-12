/**
 * `produccion.lotes_atorados`: los lotes en proceso atorados hoy (regla 7), con su operación, sus días o la máquina
 * parada, su pedido y su fecha de entrega. Sin tarifas ni costos.
 * Fase 18 · docs/modulos/produccion/lotes.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 * Fase 19 · `produccion.salud_de_lotes`, la salud de cada lote en proceso para el hilo del pedido
 */

import type { SaludDeLote } from "@uniformame/compartido/calculos/salud-lote";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { lotesAtoradosDeHoy, saludDeLotesEnProceso } from "../dominio/lotes-atorados.ts";

/**
 * Los lotes atorados, como los ve el trabajo que avisa a la dueña.
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 */
export async function lotesAtorados(contexto: ContextoDeAccion) {
	return { lotes: await lotesAtoradosDeHoy(contexto) };
}

/**
 * La salud como la dice la pantalla (ver docs/interfaz/TEXTOS.md, «Las etapas»).
 * @param salud La salud calculada.
 */
export function textoDeSalud(salud: SaludDeLote): string {
	switch (salud.tipo) {
		case "en_tiempo":
			return "En tiempo";
		case "en_riesgo":
			return "En riesgo de atraso";
		case "atrasado":
			return "Atrasado";
		case "sin_datos":
			return "Sin datos de la tablet";
		case "atorado":
			return `Atorado en ${salud.operacion ?? "su primera operación"}`;
		case "atorado_maquina":
			return `Atorado en ${salud.operacion}`;
	}
}

/**
 * `produccion.salud_de_lotes`: la salud de hoy de los lotes en proceso, como texto de la pantalla, para el hilo del
 * pedido.
 * @param contexto El contexto de quien lee.
 * @param datos `pedido_id`, opcional: solo los de ese pedido.
 * @returns Por lote en proceso, su salud y si está atorado.
 */
export async function saludDeLotes(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = z.object({ pedido_id: z.uuid().optional() }).strict().parse(datos);
	const saludes = await saludDeLotesEnProceso(contexto);
	return {
		lotes: saludes
			.filter(({ lote }) => pedido_id === undefined || lote.pedido_id === pedido_id)
			.map(({ lote, salud }) => ({
				lote_id: lote.id,
				salud: textoDeSalud(salud),
				tono:
					salud.tipo === "en_tiempo" || salud.tipo === "sin_datos"
						? "normal"
						: salud.tipo === "en_riesgo"
							? "ambar"
							: "rojo",
				atorado: salud.tipo === "atorado" || salud.tipo === "atorado_maquina",
			})),
	};
}
