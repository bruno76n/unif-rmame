/**
 * El módulo `direccion`: las autorizaciones y el trabajo de las alertas cruzadas.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md
 * Fase 18 · docs/modulos/direccion/alertas-e-indicadores.md
 *
 * Las pantallas de Pendientes, Indicadores y Alertas cruzadas, con sus consultas, llegan en la fase 19.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionDecidirAutorizacion } from "./acciones/decidir-autorizacion.ts";
import { alEventoDeDireccion } from "./al-evento.ts";
import { consultaAutorizaciones } from "./consultas/autorizaciones.ts";
import { cancelarAutorizacion } from "./internas/cancelar-autorizacion.ts";
import { pedirAutorizacion } from "./internas/pedir-autorizacion.ts";
import { semillaDeParametrosDeDireccion } from "./parametros.ts";
import { alertasDireccion } from "./trabajos/alertas-direccion.ts";

export default definirModulo({
	nombre: "direccion",
	acciones: [accionDecidirAutorizacion],
	consultas: [consultaAutorizaciones],
	internas: { pedir_autorizacion: pedirAutorizacion, cancelar_autorizacion: cancelarAutorizacion },
	semillas: [semillaDeParametrosDeDireccion],
	trabajos: [alertasDireccion],
	// Las autorizaciones y las alertas las ve Dirección (la dueña las ve todas).
	lectores: { autorizaciones: ["direccion"], alertas_direccion_vistas: ["direccion"] },
	alEvento: alEventoDeDireccion,
});
