/**
 * El módulo `direccion`: por ahora, las autorizaciones.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md
 *
 * Los pendientes, los indicadores y las alertas cruzadas llegan en la fase 18.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionDecidirAutorizacion } from "./acciones/decidir-autorizacion.ts";
import { alEventoDeDireccion } from "./al-evento.ts";
import { consultaAutorizaciones } from "./consultas/autorizaciones.ts";
import { cancelarAutorizacion } from "./internas/cancelar-autorizacion.ts";
import { pedirAutorizacion } from "./internas/pedir-autorizacion.ts";
import { semillaDeParametrosDeDireccion } from "./parametros.ts";

export default definirModulo({
	nombre: "direccion",
	acciones: [accionDecidirAutorizacion],
	consultas: [consultaAutorizaciones],
	internas: { pedir_autorizacion: pedirAutorizacion, cancelar_autorizacion: cancelarAutorizacion },
	semillas: [semillaDeParametrosDeDireccion],
	// Las autorizaciones las ve Dirección (la dueña las ve todas).
	lectores: { autorizaciones: ["direccion"] },
	alEvento: alEventoDeDireccion,
});
