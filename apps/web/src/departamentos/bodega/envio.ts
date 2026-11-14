/**
 * Cómo mandan sus acciones las pantallas de Bodega: con `useEnvio` de lo común, volviendo a leer las consultas que
 * cambian con ellas.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Todas las consultas que cambian con una acción de Bodega. */
export const consultasDeBodega = [
	"inventario.bodega_pendientes",
	"inventario.existencias",
	"inventario.materiales",
	"inventario.reabasto",
	"inventario.diferencias",
	"inventario.conteos_y_ajustes",
	"inventario.excepciones",
	"inventario.detalle_variante",
	"inventario.detalle_entrega_corte",
	"inventario.detalle_llegada_aduana",
	"inventario.detalle_conteo",
	"admin.armazon",
] as const;

/**
 * Una acción de Bodega lista para un botón, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeBodega);
}
