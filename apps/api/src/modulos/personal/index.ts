/**
 * El módulo `personal`: las personas y el PIN del taller.
 * Fase 7 · docs/modulos/personal/personas.md y docs/modulos/personal/pin-del-taller.md
 *
 * La asistencia y las tarifas llegan en la parte 5 de la fase.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionDarAltaPersona } from "./acciones/dar-alta-persona.ts";
import { accionDarBajaPersona } from "./acciones/dar-baja-persona.ts";
import { accionEditarPersona } from "./acciones/editar-persona.ts";
import { accionAsignarPin, accionDesbloquearPin, accionRestablecerPin } from "./acciones/pin.ts";
import { accionReactivarPersona } from "./acciones/reactivar-persona.ts";
import { alEventoDePersonal } from "./al-evento.ts";
import { bajadaDePersonal } from "./bajada.ts";
import { consultaPersona } from "./consultas/persona.ts";
import { anularPin, anularPinesUbicacion, bloquearPin } from "./internas/pin.ts";
import { entraAlSistema } from "./lecturas/entra-al-sistema.ts";
import { resumenPin } from "./lecturas/resumen-pin.ts";
import { semillaDeParametrosDePersonal } from "./parametros.ts";
import { camposDeSueldoDePersonal, lectoresDePersonal } from "./permisos.ts";

export default definirModulo({
	nombre: "personal",
	acciones: [
		accionDarAltaPersona,
		accionEditarPersona,
		accionDarBajaPersona,
		accionReactivarPersona,
		accionAsignarPin,
		accionRestablecerPin,
		accionDesbloquearPin,
	],
	consultas: [consultaPersona],
	internas: {
		anular_pin: anularPin,
		anular_pines_ubicacion: anularPinesUbicacion,
		bloquear_pin: bloquearPin,
	},
	lecturas: { entra_al_sistema: entraAlSistema, resumen_pin: resumenPin },
	semillas: [semillaDeParametrosDePersonal],
	alEvento: alEventoDePersonal,
	bajada: bajadaDePersonal,
	lectores: lectoresDePersonal,
	camposDeSueldo: camposDeSueldoDePersonal,
});
