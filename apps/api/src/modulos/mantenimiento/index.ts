/**
 * El módulo `mantenimiento`: las máquinas, sus fallas, los servicios y los técnicos.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionGuardarNotaSeguimiento,
	accionMandarAReparacion,
	accionRegistrarServicio,
	accionReportarFalla,
} from "./acciones/fallas.ts";
import { accionAltaMaquina, accionBajaMaquina, accionCambiarAsignacionMaquina } from "./acciones/maquinas.ts";
import { bajadaDeMantenimiento } from "./bajada.ts";
import { soltarMaquinasDePersona } from "./internas/maquinas.ts";
import { fallasQueDetienen } from "./lecturas/fallas.ts";
import { semillaDeParametrosDeMantenimiento } from "./parametros.ts";
import { semillaDeAreasTaller, semillaDeMotivosFalla } from "./siembra.ts";

export default definirModulo({
	nombre: "mantenimiento",
	acciones: [
		accionAltaMaquina,
		accionBajaMaquina,
		accionCambiarAsignacionMaquina,
		accionReportarFalla,
		accionMandarAReparacion,
		accionGuardarNotaSeguimiento,
		accionRegistrarServicio,
	],
	internas: { soltar_maquinas_de_persona: soltarMaquinasDePersona },
	lecturas: { fallas_que_detienen: fallasQueDetienen },
	bajada: bajadaDeMantenimiento,
	semillas: [semillaDeMotivosFalla, semillaDeAreasTaller, semillaDeParametrosDeMantenimiento],
	// Mantenimiento ve todo lo suyo; Producción, las máquinas y sus fallas (el atorado); Dirección, las fallas y servicios.
	lectores: {
		tipos_maquina: ["mantenimiento", "produccion"],
		maquinas: ["mantenimiento", "produccion", "direccion"],
		motivos_falla: ["mantenimiento", "produccion"],
		fallas: ["mantenimiento", "produccion", "direccion"],
		servicios: ["mantenimiento", "direccion", "contaduria"],
		tecnicos: ["mantenimiento", "contaduria"],
	},
});
