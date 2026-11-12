/**
 * El módulo `personal`: las personas, el PIN del taller, la asistencia y las tarifas por operación.
 * Fase 7 · docs/modulos/personal/ (personas.md, pin-del-taller.md, asistencia.md y tarifas.md)
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCambiarDiaAsistencia,
	accionCerrarSemanaAsistencia,
	accionReabrirSemanaAsistencia,
} from "./acciones/asistencia.ts";
import { accionDarAltaPersona } from "./acciones/dar-alta-persona.ts";
import { accionDarBajaPersona } from "./acciones/dar-baja-persona.ts";
import { accionEditarPersona } from "./acciones/editar-persona.ts";
import { accionAsignarPin, accionDesbloquearPin, accionRestablecerPin } from "./acciones/pin.ts";
import { accionPonerTarifaOperacion } from "./acciones/poner-tarifa-operacion.ts";
import { accionReactivarPersona } from "./acciones/reactivar-persona.ts";
import { alEventoDePersonal } from "./al-evento.ts";
import { bajadaDePersonal } from "./bajada.ts";
import { consultaPersona } from "./consultas/persona.ts";
import { consultaPersonas } from "./consultas/personas.ts";
import { anularPin, anularPinesUbicacion, bloquearPin } from "./internas/pin.ts";
import { copiarTarifasFlujo, tocarTarifasOperacion } from "./internas/tarifas.ts";
import { datosDePersona } from "./lecturas/datos-de-persona.ts";
import { diasDeSemana } from "./lecturas/dias-de-semana.ts";
import { entraAlSistema } from "./lecturas/entra-al-sistema.ts";
import { asistenciaParaNomina, fichasParaNomina } from "./lecturas/nomina.ts";
import { resumenPin } from "./lecturas/resumen-pin.ts";
import { tarifaVigente } from "./lecturas/tarifa-vigente.ts";
import { semillaDeParametrosDePersonal } from "./parametros.ts";
import { camposDeSueldoDePersonal, lectoresDePersonal } from "./permisos.ts";
import { abrirSemanaAsistencia } from "./trabajos/abrir-semana-asistencia.ts";

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
		accionCambiarDiaAsistencia,
		accionCerrarSemanaAsistencia,
		accionReabrirSemanaAsistencia,
		accionPonerTarifaOperacion,
	],
	consultas: [consultaPersona, consultaPersonas],
	internas: {
		anular_pin: anularPin,
		anular_pines_ubicacion: anularPinesUbicacion,
		bloquear_pin: bloquearPin,
		copiar_tarifas_flujo: copiarTarifasFlujo,
		tocar_tarifas_operacion: tocarTarifasOperacion,
	},
	lecturas: {
		entra_al_sistema: entraAlSistema,
		resumen_pin: resumenPin,
		datos_de_persona: datosDePersona,
		dias_de_semana: diasDeSemana,
		tarifa_vigente: tarifaVigente,
		asistencia_para_nomina: asistenciaParaNomina,
		fichas_para_nomina: fichasParaNomina,
	},
	trabajos: [abrirSemanaAsistencia],
	semillas: [semillaDeParametrosDePersonal],
	alEvento: alEventoDePersonal,
	bajada: bajadaDePersonal,
	lectores: lectoresDePersonal,
	camposDeSueldo: camposDeSueldoDePersonal,
});
