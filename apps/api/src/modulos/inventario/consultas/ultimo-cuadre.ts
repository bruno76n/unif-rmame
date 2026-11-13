/**
 * `inventario.ultimo_cuadre`: el último cuadre de inventario, para Dirección y Bodega.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas», «`inventario.ultimo_cuadre`»)
 *
 * Regresa lo mismo que la lectura del mismo nombre, que usan las alertas de Dirección: así la pantalla y la alerta
 * leen el mismo cuadre.
 */

import { ultimoCuadre } from "@uniformame/compartido/contratos/inventario/ultimo-cuadre";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

export const consultaUltimoCuadre = implementarConsulta(ultimoCuadre, async ({ lectura }) => ({
	resultado: ultimoCuadre.resultado.parse(await lectura("inventario.ultimo_cuadre", {})),
}));
