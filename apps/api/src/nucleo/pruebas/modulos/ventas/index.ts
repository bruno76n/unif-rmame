/**
 * El módulo `ventas` de prueba: la lectura `ventas.documentos_abiertos` que pregunta el cuadre (paso 6) y
 * `ventas.folios_de_documentos`, con la que Contaduría nombra las notas y las notas de crédito en sus mensajes.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El cuadre de la noche», paso 6)
 * Fase 15 · docs/modulos/ventas/pedidos.md («`ventas.folios_de_documentos`»)
 *
 * Los documentos abiertos son los que la prueba pone en `documentosAbiertosDePrueba`, y los folios, los que pone en
 * `foliosDePrueba` (un documento sin folio sale con su id). Lo quita la fase 16, cuando llega el módulo `ventas` de
 * verdad (decisión 498).
 */

import { z } from "zod";
import { definirModulo } from "../../../modulos.ts";

/** Los PE- y NV- que la prueba dice que siguen abiertos. */
export const documentosAbiertosDePrueba = new Set<string>();

/** Los folios de los PE-, NV- y NC- que la prueba dio de alta. */
export const foliosDePrueba = new Map<string, string>();

/** Lo que reciben las lecturas. */
const pedido = z.object({
	pedido_ids: z.array(z.uuid()).optional(),
	nota_entrega_ids: z.array(z.uuid()).optional(),
	nota_credito_ids: z.array(z.uuid()).optional(),
});

export default definirModulo({
	nombre: "ventas",
	lecturas: {
		documentos_abiertos: async (_contexto, datos) => {
			const { pedido_ids, nota_entrega_ids } = pedido.parse(datos);
			const abiertos = (ids: readonly string[] = []) => ids.filter((id) => documentosAbiertosDePrueba.has(id));
			return { pedido_ids: abiertos(pedido_ids), nota_entrega_ids: abiertos(nota_entrega_ids) };
		},
		folios_de_documentos: async (_contexto, datos) => {
			const { pedido_ids = [], nota_entrega_ids = [], nota_credito_ids = [] } = pedido.parse(datos);
			const ids = [...pedido_ids, ...nota_entrega_ids, ...nota_credito_ids];
			return { folios: Object.fromEntries(ids.map((id) => [id, foliosDePrueba.get(id) ?? id])) };
		},
	},
});
