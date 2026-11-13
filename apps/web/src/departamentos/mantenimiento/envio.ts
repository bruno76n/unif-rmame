/**
 * Cómo mandan sus acciones los cajones y las ventanas de Mantenimiento: con `useEnvio` de lo común, volviendo a leer
 * las consultas de Mantenimiento.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Todas las consultas que cambian con una acción de Mantenimiento. */
export const consultasDeMantenimiento = [
	"mantenimiento.pendientes",
	"mantenimiento.maquinas",
	"mantenimiento.fallas",
	"mantenimiento.servicios",
	"mantenimiento.costo_por_maquina",
	"mantenimiento.falla",
	"mantenimiento.maquina",
	"mantenimiento.opciones",
	"admin.armazon",
] as const;

/**
 * Una acción de Mantenimiento lista para un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeMantenimiento);
}
