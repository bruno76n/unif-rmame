/**
 * Cómo mandan sus acciones las pestañas, los cajones y las ventanas de Personal: con `useEnvio` de lo común, volviendo a
 * leer las consultas de Personal y el armazón (la pastilla).
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Todas las consultas que cambian con una acción de Personal. */
export const consultasDePersonal = [
	"personal.asistencia",
	"personal.personas",
	"personal.persona",
	"personal.pines",
	"personal.tarifas",
	"admin.armazon",
] as const;

/**
 * Una acción de Personal lista para una pestaña, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDePersonal);
}
