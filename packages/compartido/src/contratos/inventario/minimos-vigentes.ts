/**
 * El contrato de `inventario.minimos_vigentes`: los mínimos de existencia de Bodega y de cada tienda, los dos de cada
 * una con su versión, para las casillas de Configuración en Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración»: los mínimos de existencia) y
 * docs/modulos/inventario/minimos-y-reabasto.md («`inventario.minimos_vigentes()`»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Un mínimo vigente: sus piezas y su versión, para cambiarlo. */
const minimoVigente = z
	.object({ piezas: z.number().int(), version: z.number().int() })
	.nullable()
	.describe("Nulo si esa ubicación no tiene ese mínimo");

export const minimosVigentes = definirConsulta({
	nombre: "inventario.minimos_vigentes",
	descripcion: "Los mínimos de existencia vigentes de cada ubicación que lleva mínimo, en el orden de las ubicaciones",
	entrada: z.object({}),
	salida: z.object({
		ubicaciones: z.array(
			z.object({
				ubicacion_id: z.uuid(),
				ubicacion: z.string(),
				mayor_venta: minimoVigente.describe("Tallas de mayor venta"),
				demas: minimoVigente.describe("Demás tallas"),
			}),
		),
	}),
	permiso: { departamento: "admin" },
});
