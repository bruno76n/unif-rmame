/**
 * `inventario.minimos_vigentes`: los mínimos de existencia para las casillas de Configuración en Administración del
 * sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración») y docs/modulos/inventario/minimos-y-reabasto.md
 *
 * Lee con la lectura del mismo nombre, la que ya usa Administración (decisión 237): por ubicación con mínimo, los dos
 * vigentes con su versión. Aquí solo se juntan por ubicación.
 */

import { minimosVigentes } from "@uniformame/compartido/contratos/inventario/minimos-vigentes";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Lo que regresa la lectura. */
const vigentesLeidos = z.object({
	minimos: z.array(
		z.object({
			ubicacion_id: z.uuid(),
			ubicacion: z.string(),
			nivel: z.enum(["mayor_venta", "demas"]),
			piezas: z.number().int(),
			version: z.number().int(),
		}),
	),
});

export const consultaMinimosVigentes = implementarConsulta(minimosVigentes, async (contexto) => {
	const { minimos } = vigentesLeidos.parse(await contexto.lectura("inventario.minimos_vigentes", {}));
	// Una ubicación por renglón, en el orden en que llegan (el de las ubicaciones), con sus dos niveles.
	const ubicaciones = new Map<
		string,
		{ ubicacion_id: string; ubicacion: string; mayor_venta: Vigente | null; demas: Vigente | null }
	>();
	for (const minimo of minimos) {
		const suya = ubicaciones.get(minimo.ubicacion_id) ?? {
			ubicacion_id: minimo.ubicacion_id,
			ubicacion: minimo.ubicacion,
			mayor_venta: null,
			demas: null,
		};
		suya[minimo.nivel] = { piezas: minimo.piezas, version: minimo.version };
		ubicaciones.set(minimo.ubicacion_id, suya);
	}
	return { resultado: { ubicaciones: [...ubicaciones.values()] } };
});

/** Un mínimo vigente: sus piezas y su versión. */
interface Vigente {
	piezas: number;
	version: number;
}
