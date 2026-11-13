/**
 * Cómo mandan sus acciones los cajones y las ventanas de Ventas a externos: con `useEnvio` de lo común, volviendo a
 * leer las consultas de Ventas; los errores de una regla llegan a la pantalla campo por campo.
 * Fase 19 · docs/interfaz/fabrica/ventas.md y docs/interfaz/comunes.md («Los estados de una pantalla»)
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvioConCampos } from "../../comun/envio.ts";

/** Todas las consultas de Ventas: una acción de Ventas puede cambiar cualquiera. */
export const consultasDeVentas = [
	"ventas.pendientes",
	"ventas.pedidos",
	"ventas.pedido",
	"ventas.editor_pedido",
	"ventas.revision_mandar",
	"ventas.notas_entrega",
	"ventas.nota_entrega",
	"ventas.armar_nota",
	"ventas.clientes",
	"ventas.cliente",
	"contaduria.estado_pago_notas",
	"produccion.hilo_pedido",
	"admin.historial_entidad",
	"admin.armazon",
] as const;

/**
 * Una acción de Ventas lista para un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvioConCampos` de lo común: `enviar(peticion, alCampos)` entrega los errores de la regla por campo.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioConCampos(contrato, consultasDeVentas);
}
