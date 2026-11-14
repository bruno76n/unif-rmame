/**
 * Cómo mandan sus acciones las pantallas de Aduana: con `useEnvio` de lo común, volviendo a leer las consultas que
 * cambian con ellas.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Todas las consultas que cambian con una acción de Aduana. */
export const consultasDeAduana = [
	"inventario.anden",
	"inventario.aduana_recepcion",
	"inventario.en_camino_aduana",
	"inventario.aduana_despacho",
	"inventario.inventario_en_aduana",
	"inventario.en_transito",
	"inventario.aduana_historial",
	"inventario.detalle_recibir_taller",
	"inventario.detalle_recibir_material",
	"inventario.detalle_recibir_en_camino",
	"inventario.detalle_despachar",
	"inventario.pastillas_menu",
	"linea.pedidos",
	"admin.armazon",
] as const;

/**
 * Una acción de Aduana lista para un botón, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeAduana);
}
