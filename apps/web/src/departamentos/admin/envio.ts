/**
 * Cómo mandan sus acciones las pantallas de Administración del sistema: con `useEnvioConCampos` de lo común, volviendo
 * a leer sus consultas y el armazón (los menús y la pastilla cambian con los accesos y las alertas).
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useEnvioConCampos } from "../../comun/envio.ts";

/** Todas las consultas que lee Administración del sistema: una acción suya puede cambiar cualquiera. */
export const consultasDeAdmin = [
	"admin.pendientes",
	"admin.usuarios",
	"admin.cuenta_nueva",
	"admin.alta_usuario",
	"admin.pantalla_acceso",
	"admin.dispositivos",
	"admin.codigo_registro",
	"admin.comandos_apartados",
	"admin.configuracion",
	"admin.historial_parametro",
	"inventario.minimos_vigentes",
	"admin.bitacora",
	"admin.respaldos",
	"admin.armazon",
] as const;

/**
 * Una acción de Administración del sistema lista para una pantalla, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvioConCampos` de lo común: `enviar(peticion, alCampos, alFallar)`, `enviando` y `choco`.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioConCampos(contrato, consultasDeAdmin);
}
