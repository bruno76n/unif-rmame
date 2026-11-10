/**
 * Un módulo `contaduria` de prueba: solo la lectura `contaduria.estado_nomina_semana`, para probar que una
 * semana con la nómina pagada no se reabre. Lo registran solo las pruebas; el módulo de verdad llega en la
 * fase 17, y entonces este se quita.
 * Fase 7 · docs/modulos/personal/asistencia.md (regla 5, «`personal.reabrir_semana_asistencia`»)
 */

import { z } from "zod";
import { definirModulo } from "../../../modulos.ts";

/** Las semanas cuya nómina la prueba da por pagada. */
export const nominasPagadasDePrueba = new Set<string>();

export default definirModulo({
	nombre: "contaduria",
	lecturas: {
		estado_nomina_semana: async (_contexto, datos) => {
			const { asistencia_semana_id } = z.object({ asistencia_semana_id: z.uuid() }).parse(datos);
			return { pagada: nominasPagadasDePrueba.has(asistencia_semana_id) };
		},
	},
});
