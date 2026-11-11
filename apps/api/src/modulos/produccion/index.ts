/**
 * El módulo `produccion`: las operaciones del taller y el flujo de cada prenda.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionAgregarOperacionFlujo, accionCrearFlujo, accionQuitarOperacionFlujo } from "./acciones/flujos.ts";
import { bajadaDeProduccion } from "./bajada.ts";
import { flujoVigente } from "./lecturas/flujos.ts";
import { semillaDeParametrosDeProduccion } from "./parametros.ts";
import { lectoresDeProduccion } from "./permisos.ts";
import { semillaDeCorte } from "./siembra.ts";

export default definirModulo({
	nombre: "produccion",
	acciones: [accionCrearFlujo, accionAgregarOperacionFlujo, accionQuitarOperacionFlujo],
	lecturas: { flujo_vigente: flujoVigente },
	semillas: [semillaDeCorte, semillaDeParametrosDeProduccion],
	lectores: lectoresDeProduccion,
	bajada: bajadaDeProduccion,
});
