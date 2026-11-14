/**
 * El tipo de impresión de Producción: la etiqueta de bulto (`bulto`), una por bulto al cerrar el corte, con su folio B-
 * (lo que lee la tablet), la prenda y la talla, las piezas, «{lote} · bulto {n} de {total}» y «{para quién} · entrega
 * {fecha}». La dibuja `impresos/etiquetas/bulto.ts`.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de bulto») y docs/modulos/produccion/corte-y-bultos.md
 * (`produccion.imprimir_etiquetas_bulto`)
 */

import { textoDeDiaConAnio } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dibujarBultos, type EtiquetaDeBulto } from "../../impresos/etiquetas/bulto.ts";
import { noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import { columnasDeParaQuien, deParaQuien, escribirParaQuien, unionesDeParaQuien } from "./dominio/para-quien.ts";

/** Un bulto como se lee para su etiqueta. */
const delBulto = z.object({
	id: z.uuid(),
	folio: z.string(),
	numero: z.coerce.number(),
	piezas: z.coerce.number(),
	total: z.coerce.number(),
	prenda: z.string(),
	talla: z.string(),
	lote: z.string(),
	...deParaQuien,
});

/**
 * Lo de cada etiqueta de bulto, en el orden de los ids.
 * @param contexto El contexto de quien la pide.
 * @param ids Los bultos.
 * @throws `404` si un bulto no existe.
 */
export async function etiquetasDeBulto(
	contexto: ContextoDeConsulta,
	ids: readonly string[],
): Promise<EtiquetaDeBulto[]> {
	const unicos = [...new Set(ids)];
	if (unicos.length === 0) return [];
	const { rows } = await contexto.base.execute(sql`
		SELECT b.id, b.folio, b.numero, b.piezas, (SELECT count(*) FROM bultos o WHERE o.lote_id = b.lote_id) AS total,
			p.nombre AS prenda, t.nombre AS talla, l.folio AS lote, ${columnasDeParaQuien}
		FROM bultos b JOIN lotes l ON l.id = b.lote_id JOIN variantes v ON v.id = b.variante_id
		JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id
		${unionesDeParaQuien}
		WHERE b.id IN (${sql.join(
			unicos.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})`);
	const bultos = new Map(
		z
			.array(delBulto)
			.parse(rows)
			.map((bulto) => [bulto.id, bulto]),
	);
	return ids.map((id) => {
		const bulto = bultos.get(id);
		if (bulto === undefined) throw noExiste();
		return {
			folio: bulto.folio,
			prendaYTalla: `${bulto.prenda} · Talla ${bulto.talla}`,
			piezas: plural(bulto.piezas, "pieza", "piezas"),
			lote: `${bulto.lote} · bulto ${bulto.numero} de ${bulto.total}`,
			paraQuien: `${escribirParaQuien(bulto).nombre} · entrega ${textoDeDiaConAnio(bulto.fecha_entrega)}`,
		};
	});
}

/** La etiqueta de bulto: la pide Producción, en la Zebra del taller o en PDF. */
export const tipoBulto: TipoDeEtiqueta = {
	tipo: "bulto",
	departamentos: ["produccion"],
	dibujar: async (contexto, pedido) =>
		dibujarBultos(await etiquetasDeBulto(contexto, pedido.ids), pedido.formato, pedido.copias),
};
