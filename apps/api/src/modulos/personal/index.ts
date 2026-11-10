/**
 * El módulo `personal`: por ahora, las personas.
 * Fase 7 · docs/modulos/personal/personas.md
 *
 * El PIN del taller, la asistencia y las tarifas llegan en las partes 3 y 5 de la fase.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionDarAltaPersona } from "./acciones/dar-alta-persona.ts";
import { accionDarBajaPersona } from "./acciones/dar-baja-persona.ts";
import { accionEditarPersona } from "./acciones/editar-persona.ts";
import { accionReactivarPersona } from "./acciones/reactivar-persona.ts";
import { consultaPersona } from "./consultas/persona.ts";
import { entraAlSistema } from "./lecturas/entra-al-sistema.ts";
import { camposDeSueldoDePersonal, lectoresDePersonal } from "./permisos.ts";

export default definirModulo({
	nombre: "personal",
	acciones: [accionDarAltaPersona, accionEditarPersona, accionDarBajaPersona, accionReactivarPersona],
	consultas: [consultaPersona],
	lecturas: { entra_al_sistema: entraAlSistema },
	lectores: lectoresDePersonal,
	camposDeSueldo: camposDeSueldoDePersonal,
});
