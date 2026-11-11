/**
 * El módulo `ventas` de prueba: solo la lectura `ventas.documentos_abiertos` que pregunta el cuadre (paso 6).
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El cuadre de la noche», paso 6)
 *
 * Los documentos abiertos son los que la prueba pone en `documentosAbiertosDePrueba`. Lo quita la fase 16, cuando
 * llega el módulo `ventas` de verdad (decisión 498).
 */

import { z } from "zod";
import { definirModulo } from "../../../modulos.ts";

/** Los PE- y NV- que la prueba dice que siguen abiertos. */
export const documentosAbiertosDePrueba = new Set<string>();

/** Lo que recibe la lectura. */
const pedido = z.object({
	pedido_ids: z.array(z.uuid()).optional(),
	nota_entrega_ids: z.array(z.uuid()).optional(),
});

export default definirModulo({
	nombre: "ventas",
	lecturas: {
		documentos_abiertos: async (_contexto, datos) => {
			const { pedido_ids, nota_entrega_ids } = pedido.parse(datos);
			const abiertos = (ids: readonly string[] = []) => ids.filter((id) => documentosAbiertosDePrueba.has(id));
			return { pedido_ids: abiertos(pedido_ids), nota_entrega_ids: abiertos(nota_entrega_ids) };
		},
	},
});
