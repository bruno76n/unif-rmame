/**
 * `produccion.lotes_atorados`: los lotes en proceso atorados hoy (regla 7), con su operación, sus días o la máquina
 * parada, su pedido y su fecha de entrega. Sin tarifas ni costos.
 * Fase 18 · docs/modulos/produccion/lotes.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { lotesAtoradosDeHoy } from "../dominio/lotes-atorados.ts";

/**
 * Los lotes atorados, como los ve el trabajo que avisa a la dueña.
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 */
export async function lotesAtorados(contexto: ContextoDeAccion) {
	return { lotes: await lotesAtoradosDeHoy(contexto) };
}
