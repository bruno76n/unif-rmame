/**
 * El tipo de impresión de Catálogo: la etiqueta de prenda (`prenda`). Junta lo de cada variante (la prenda, su escuela
 * o «Básico», la talla, el código y, solo con `catalogo.etiqueta_lleva_precio`, el precio de mostrador de esa talla con
 * su recargo si es de pedido especial, de la lectura `catalogo.precio_talla`) y la dibuja en
 * `impresos/etiquetas/prenda.ts`.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de prenda») y docs/modulos/catalogo/variantes-codigos-y-etiquetas.md
 * (regla 5)
 *
 * Nunca lleva un costo, y el precio que puede llevar es el que ve el cliente: por eso Aduana la imprime con su A- aunque
 * en sus pantallas nunca ve pesos. Las piezas se piden repetidas (una por pieza), y salen en ese orden.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dibujarPrendas, type EtiquetaDePrenda } from "../../impresos/etiquetas/prenda.ts";
import { noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import { leerParametro } from "../../nucleo/parametros.ts";

/** Una variante como se lee para su etiqueta. */
const deLaVariante = z.object({
	id: z.uuid(),
	prenda: z.string(),
	escuela: z.string().nullable(),
	talla: z.string(),
	codigo: z.string(),
	es_pedido_especial: z.boolean(),
});

/**
 * El precio de Mostrador de cada talla, escrito, con la lectura del módulo (con su recargo si es de pedido especial).
 * @param contexto El contexto de quien la pide.
 * @param varianteIds Las tallas.
 * @returns Por variante, su precio escrito, o nada si no tiene precio.
 */
async function preciosDeMostrador(
	contexto: ContextoDeConsulta,
	varianteIds: readonly string[],
): Promise<Map<string, string | null>> {
	const { rows } = await contexto.base.execute(
		sql`SELECT id FROM listas_precios WHERE tipo = 'mostrador' AND baja_en IS NULL`,
	);
	const mostrador = z.object({ id: z.uuid() }).optional().parse(rows[0]);
	const precios = new Map<string, string | null>();
	for (const varianteId of varianteIds) {
		const { precio_centavos: precio } = z
			.object({ precio_centavos: z.number().nullable() })
			.parse(await contexto.lectura("catalogo.precio_talla", { lista_id: mostrador?.id, variante_id: varianteId }));
		precios.set(varianteId, precio === null ? null : enPesos(precio));
	}
	return precios;
}

/**
 * Lo de cada etiqueta de prenda, en el orden de los ids (uno por pieza).
 * @param contexto El contexto de quien la pide.
 * @param ids Las variantes, repetidas por pieza.
 * @throws `404` si una variante no existe.
 */
export async function etiquetasDePrenda(
	contexto: ContextoDeConsulta,
	ids: readonly string[],
): Promise<EtiquetaDePrenda[]> {
	const unicas = [...new Set(ids)];
	if (unicas.length === 0) return [];
	const { rows } = await contexto.base.execute(sql`
		SELECT v.id, p.nombre AS prenda, e.nombre AS escuela, t.nombre AS talla, v.codigo, v.es_pedido_especial
		FROM variantes v JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
		LEFT JOIN escuelas e ON e.id = p.escuela_id
		WHERE v.id IN (${sql.join(
			unicas.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})`);
	const variantes = new Map(
		z
			.array(deLaVariante)
			.parse(rows)
			.map((variante) => [variante.id, variante]),
	);
	const llevaPrecio = (await leerParametro(contexto.base, { clave: "catalogo.etiqueta_lleva_precio" })) === true;
	const precios = llevaPrecio ? await preciosDeMostrador(contexto, unicas) : new Map<string, string | null>();
	return ids.map((id) => {
		const variante = variantes.get(id);
		if (variante === undefined) throw noExiste();
		return {
			varianteId: variante.id,
			prenda: variante.prenda,
			escuela: variante.escuela ?? "Básico",
			talla: `Talla ${variante.talla}`,
			codigo: variante.codigo,
			precio: precios.get(variante.id) ?? null,
			pedidoEspecial: variante.es_pedido_especial,
		};
	});
}

/** La etiqueta de prenda: la pide Catálogo; Aduana la imprime con su A- por el tipo `traspaso` de Inventario. */
export const tipoPrenda: TipoDeEtiqueta = {
	tipo: "prenda",
	departamentos: ["catalogo"],
	dibujar: async (contexto, pedido) =>
		dibujarPrendas(await etiquetasDePrenda(contexto, pedido.ids), pedido.formato, pedido.copias),
};
