/**
 * Cómo mandan sus acciones las pantallas de Contaduría: con `useEnvioConCampos` de lo común, volviendo a leer las
 * consultas de Contaduría; los errores de una regla llegan a la pantalla campo por campo.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvioConCampos } from "../../comun/envio.ts";

/** Todas las consultas que lee Contaduría: una acción suya puede cambiar cualquiera. */
export const consultasDeContaduria = [
	"contaduria.pendientes",
	"contaduria.flujo_proximos_dias",
	"contaduria.antiguedad_saldos",
	"contaduria.pagos_recibidos",
	"contaduria.cliente",
	"contaduria.registrar_pago_opciones",
	"contaduria.cuentas_por_pagar",
	"contaduria.conciliacion_facturas",
	"contaduria.capturar_factura_opciones",
	"contaduria.terceros",
	"contaduria.tercero",
	"contaduria.gastos",
	"contaduria.nomina_semana",
	"contaduria.contador_externo",
	"contaduria.paquete_mes",
	"admin.armazon",
] as const;

/**
 * Una acción de Contaduría lista para una pantalla, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvioConCampos` de lo común: `enviar(peticion, alCampos)` entrega los errores de la regla por campo.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioConCampos(contrato, consultasDeContaduria);
}
