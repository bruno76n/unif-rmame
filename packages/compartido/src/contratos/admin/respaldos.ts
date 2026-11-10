/**
 * Los contratos de los respaldos.
 * Fase 4 · docs/modulos/admin/respaldos.md («`admin.registrar_restauracion`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** La dueña registra una prueba de restauración con su evidencia. */
export const registrarRestauracion = definirAccion({
	nombre: "admin.registrar_restauracion",
	descripcion: "Registra una prueba de restauración hecha en el ambiente de pruebas, con su evidencia",
	entrada: z.object({
		tipo: z.enum(["semanal_externo", "punto_en_el_tiempo"]).describe("Qué se restauró"),
		respaldo_id: z.uuid().optional().describe("El respaldo semanal que se restauró"),
		punto_restaurado_en: z.iso.datetime({ offset: true }).optional().describe("El momento al que se regresó"),
		probada_en: z.iso.datetime({ offset: true }).describe("Cuándo se hizo la prueba"),
		conteos_cuadraron: z.boolean().describe("Si los conteos y el cuadre de inventario dieron igual"),
		conteos: z
			.array(
				z.object({
					tabla: z.string().describe("La tabla"),
					esperados: z.number().int().describe("Los renglones esperados"),
					encontrados: z.number().int().describe("Los renglones encontrados"),
				}),
			)
			.optional()
			.describe("Por tabla, los renglones esperados y encontrados"),
		evidencia_archivo_id: z.uuid().optional().describe("La evidencia ya subida"),
		nota: z.string().trim().max(200).optional().describe("Una nota"),
	}),
	salida: z.object({ restauracion_id: z.uuid().describe("La prueba registrada") }),
	permiso: { departamento: "admin", soloDuena: true },
	errores: [{ codigo: "respaldo_fallido", mensaje: "Ese respaldo falló: escoge uno correcto." }],
});
