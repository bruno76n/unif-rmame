/**
 * Los tipos de impresión de Producción: la etiqueta de bulto (`bulto`), una por bulto al cerrar el corte, con su folio
 * B- (lo que lee la tablet), la prenda y la talla, las piezas, «{lote} · bulto {n} de {total}» y «{para quién} · entrega
 * {fecha}»; y la hoja del lote (`lote`), ya cortado, con sus bultos y su flujo. Las dibujan
 * `impresos/etiquetas/bulto.ts` e `impresos/hojas/lote.ts`; ninguna lleva precios, costos ni tarifas.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de bulto»), docs/impresos/hojas.md («La hoja del lote») y
 * docs/modulos/produccion/corte-y-bultos.md (`produccion.imprimir_etiquetas_bulto`)
 */

import { textoDeDiaConAnio } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dibujarBultos, type EtiquetaDeBulto } from "../../impresos/etiquetas/bulto.ts";
import { dibujarHojaDeLote } from "../../impresos/hojas/lote.ts";
import { marcoDeLaHoja } from "../../nucleo/hojas.ts";
import { errorDeRegla, noExiste } from "../../nucleo/http/errores.ts";
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
			prenda: bulto.prenda,
			talla: `Talla ${bulto.talla}`,
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

/** El lote y su corte, como los lleva su hoja. */
const delLote = z.object({
	folio: z.string(),
	orden: z.string(),
	prenda: z.string(),
	corte: z.string().nullable(),
	corto: z.string().nullable(),
	receta: z.coerce.number().nullable(),
	tela: z.string().nullable(),
	...deParaQuien,
});

/**
 * Las partidas de la tela, escritas: «Partida P-2224», o «Partida P-2224 y P-2231: el tono puede variar entre piezas».
 * @param partidas Los folios de las partidas.
 */
function partidasEscritas(partidas: readonly string[]): string {
	if (partidas.length === 0) return "Sin partida";
	if (partidas.length === 1) return `Partida ${partidas[0]}`;
	const juntas = `${partidas.slice(0, -1).join(", ")} y ${partidas.at(-1)}`;
	return `Partida ${juntas}: el tono puede variar entre piezas`;
}

/**
 * El PDF de la hoja de un lote cortado.
 * @param contexto El contexto de quien la pide.
 * @param loteId El lote.
 * @throws `404` si no existe; `422 lote_sin_cortar` si todavía no se corta.
 */
async function hojaDelLote(contexto: ContextoDeConsulta, loteId: string): Promise<Uint8Array> {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.folio, op.folio AS orden, p.nombre AS prenda, c.fecha::text AS corte, pe_corte.nombre AS corto,
			rv.numero AS receta, m.nombre AS tela, ${columnasDeParaQuien}
		FROM lotes l JOIN ordenes_produccion op ON op.id = l.orden_produccion_id JOIN productos p ON p.id = l.producto_id
		LEFT JOIN cortes c ON c.lote_id = l.id LEFT JOIN personas pe_corte ON pe_corte.id = c.corto_persona_id
		LEFT JOIN receta_versiones rv ON rv.id = l.receta_version_id
		LEFT JOIN corte_telas ct ON ct.corte_id = c.id AND ct.papel = 'tela_principal'
		LEFT JOIN materiales m ON m.id = ct.material_id
		${unionesDeParaQuien}
		WHERE l.id = ${loteId}::uuid`);
	const lote = delLote.optional().parse(rows[0]);
	if (lote === undefined) throw noExiste();
	if (lote.corte === null) throw errorDeRegla("lote_sin_cortar", `${lote.folio} todavía no se corta.`);
	const { rows: partidas } = await contexto.base.execute(sql`
		SELECT DISTINCT pt.folio FROM cortes c JOIN apartados_rollo ar ON ar.corte_id = c.id
		JOIN rollos r ON r.id = ar.rollo_id JOIN corte_telas ct ON ct.corte_id = c.id AND ct.papel = 'tela_principal'
			AND ct.material_id = r.material_id
		JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		WHERE c.lote_id = ${loteId}::uuid ORDER BY pt.folio`);
	const { rows: bultos } = await contexto.base.execute(sql`
		SELECT b.folio, t.nombre AS talla, b.piezas FROM bultos b JOIN variantes v ON v.id = b.variante_id
		JOIN tallas t ON t.id = v.talla_id WHERE b.lote_id = ${loteId}::uuid ORDER BY b.numero`);
	const { rows: flujo } = await contexto.base.execute(sql`
		SELECT fo.orden, o.nombre AS operacion, pb.nombre AS la_hace FROM lotes l
		JOIN flujo_operaciones fo ON fo.flujo_id = l.flujo_id AND fo.baja_en IS NULL
		JOIN operaciones o ON o.id = fo.operacion_id LEFT JOIN personas pb ON pb.id = fo.persona_base_id
		WHERE l.id = ${loteId}::uuid ORDER BY fo.orden`);
	const deBultos = z.array(z.object({ folio: z.string(), talla: z.string(), piezas: z.coerce.number() })).parse(bultos);
	const marco = await marcoDeLaHoja(contexto, {
		nombre: "Lote",
		folio: lote.folio,
		fecha: lote.orden,
	});
	return dibujarHojaDeLote(marco, {
		prenda: lote.prenda,
		paraQuien: `${escribirParaQuien(lote).nombre} · entrega ${textoDeDiaConAnio(lote.fecha_entrega)}`,
		cortado: `Cortado el ${textoDeDiaConAnio(lote.corte)} por ${lote.corto ?? "—"}${lote.receta === null ? "" : ` · receta versión ${lote.receta}`}`,
		tela: `${lote.tela ?? "Sin tela principal"} · ${partidasEscritas(
			z
				.array(z.object({ folio: z.string() }))
				.parse(partidas)
				.map((fila) => fila.folio),
		)}`,
		bultos: deBultos.map((bulto) => ({ folio: bulto.folio, talla: bulto.talla, piezas: String(bulto.piezas) })),
		totalPiezas: plural(
			deBultos.reduce((suma, bulto) => suma + bulto.piezas, 0),
			"pieza",
			"piezas",
		),
		flujo: z
			.array(z.object({ orden: z.coerce.number(), operacion: z.string(), la_hace: z.string().nullable() }))
			.parse(flujo)
			.map((paso) => ({ orden: String(paso.orden), operacion: paso.operacion, laHace: paso.la_hace ?? "—" })),
	});
}

/** La hoja del lote: la saca Producción, ya cortado. */
export const tipoLote: TipoDeEtiqueta = {
	tipo: "lote",
	departamentos: ["produccion"],
	dibujar: async (contexto, pedido) => {
		const [loteId] = pedido.ids;
		if (loteId === undefined) throw noExiste();
		return hojaDelLote(contexto, loteId);
	},
};
