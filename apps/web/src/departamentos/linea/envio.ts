/**
 * Cómo mandan sus acciones las pantallas de Tienda en línea: con `useEnvio` de lo común, volviendo a leer las consultas
 * de Tienda en línea, la disponibilidad, el historial y el armazón (la pastilla cambia con cada W-).
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";

/** Las consultas que puede cambiar una acción de Tienda en línea. */
export const consultasDeLinea = [
	"linea.pendientes",
	"linea.pedidos",
	"linea.pedido",
	"inventario.disponibilidad_linea",
	"admin.historial_entidad",
	"admin.armazon",
] as const;

/**
 * Una acción de Tienda en línea lista para un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común: `enviar(peticion, alFallar)`, `enviando` y `choco`.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeLinea);
}
