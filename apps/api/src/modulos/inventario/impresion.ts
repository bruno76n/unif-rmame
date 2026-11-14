/**
 * Los tipos de impresión de Inventario: la etiqueta de rollo (`rollo`, o la del retazo si el rollo quedó como retazo) y
 * todas las etiquetas que lleva un A- al salir de aduana (`traspaso`): una de prenda por pieza que Aduana contó para
 * ese destino, talla por talla, o una de rollo por cada rollo del material de un proveedor.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de rollo y la de retazo» y «Lo que lleva un A- al salir de
 * aduana») y docs/modulos/inventario/surtido-y-despachos.md (`inventario.marcar_etiquetas_impresas`)
 *
 * El tipo `traspaso` no dibuja nada propio: pide al registro el tipo `prenda` de Catálogo con sus variantes, una por
 * pieza, o dibuja las de rollo. Ninguna etiqueta de material lleva un costo.
 */

import { textoDeDiaConAnio, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dibujarRollos, type EtiquetaDeMaterial } from "../../impresos/etiquetas/rollo.ts";
import { errorDeRegla, noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import { ordenDeTallas } from "../catalogo/dominio/tallas.ts";
import { metrosEscritos } from "./consultas/bodega-comun.ts";
import { tiposConEtiquetas } from "./dominio/despachos.ts";

/** Un rollo como se lee para su etiqueta. */
const delRollo = z.object({
	id: z.uuid(),
	folio: z.string(),
	metros: z.string(),
	es_retazo: z.boolean(),
	tela: z.string(),
	partida: z.string().nullable(),
	codigo_proveedor: z.string().nullable(),
	proveedor: z.string().nullable(),
	llego: z.string().nullable(),
	retazo: z.string().nullable(),
	metros_retazo: z.string().nullable(),
	lote: z.string().nullable(),
	corte: z.string().nullable(),
});

/**
 * La etiqueta de un rollo leído, o la de su retazo.
 * @param rollo El rollo.
 */
function etiquetaDe(rollo: z.infer<typeof delRollo>): EtiquetaDeMaterial {
	const partida = rollo.partida === null ? "Sin partida" : `Partida ${rollo.partida} · ${rollo.codigo_proveedor ?? ""}`;
	if (rollo.es_retazo && rollo.retazo !== null) {
		return {
			tipo: "retazo",
			folio: rollo.retazo,
			delRollo: `del ${rollo.folio}`,
			telaYPartida: `${rollo.tela} · ${rollo.partida === null ? "Sin partida" : `Partida ${rollo.partida}`}`,
			metros: `${metrosEscritos(rollo.metros_retazo ?? "0")} m`,
			corte: `Corte ${rollo.lote ?? ""} · ${rollo.corte === null ? "" : textoDeDiaConAnio(rollo.corte)}`,
		};
	}
	return {
		tipo: "rollo",
		folio: rollo.folio,
		tela: rollo.tela,
		partida,
		metros: `${metrosEscritos(rollo.metros)} m`,
		origen:
			rollo.proveedor === null || rollo.llego === null
				? "Carga inicial"
				: `${rollo.proveedor} · ${textoDeDiaConAnio(rollo.llego)}`,
	};
}

/**
 * Lo de cada etiqueta de rollo, en el orden de los ids.
 * @param contexto El contexto de quien la pide.
 * @param ids Los rollos.
 * @throws `404` si un rollo no existe.
 */
export async function etiquetasDeRollo(
	contexto: ContextoDeConsulta,
	ids: readonly string[],
): Promise<EtiquetaDeMaterial[]> {
	const unicos = [...new Set(ids)];
	if (unicos.length === 0) return [];
	const { rows } = await contexto.base.execute(sql`
		SELECT r.id, r.folio, r.metros_iniciales::text AS metros, r.es_retazo, m.nombre AS tela, pt.folio AS partida,
			pt.codigo_proveedor, ter.nombre AS proveedor,
			(rc.recibido_en AT TIME ZONE ${zonaDelNegocio}::text)::date::text AS llego,
			rz.folio AS retazo, rz.metros::text AS metros_retazo, lo.folio AS lote, co.fecha::text AS corte
		FROM rollos r JOIN materiales m ON m.id = r.material_id
		LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		LEFT JOIN proveedores pr ON pr.id = r.proveedor_id LEFT JOIN terceros ter ON ter.id = pr.tercero_id
		LEFT JOIN recepciones rc ON rc.id = r.recepcion_id
		LEFT JOIN retazos rz ON rz.rollo_id = r.id
		LEFT JOIN lotes lo ON lo.id = rz.lote_id LEFT JOIN cortes co ON co.id = rz.corte_id
		WHERE r.id IN (${sql.join(
			unicos.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})`);
	const rollos = new Map(
		z
			.array(delRollo)
			.parse(rows)
			.map((rollo) => [rollo.id, rollo]),
	);
	return ids.map((id) => {
		const rollo = rollos.get(id);
		if (rollo === undefined) throw noExiste();
		return etiquetaDe(rollo);
	});
}

/** Un renglón de un A- que lleva etiquetas: una variante con sus piezas, o un rollo. */
const delRenglon = z.object({
	variante_id: z.uuid().nullable(),
	rollo_id: z.uuid().nullable(),
	piezas: z.coerce.number(),
});

/**
 * Lo que lleva un A-: las variantes, repetidas por cada pieza contada para su destino y talla por talla, o sus rollos.
 * @param contexto El contexto de quien la pide.
 * @param traspasoId El A-.
 * @throws `404` si no existe; `422 sin_etiquetas` si su tipo no lleva etiquetas.
 */
async function loQueLleva(
	contexto: ContextoDeConsulta,
	traspasoId: string,
): Promise<{ variantes: string[]; rollos: string[] }> {
	const { rows } = await contexto.base.execute(sql`SELECT folio, tipo FROM traspasos WHERE id = ${traspasoId}::uuid`);
	const traspaso = z.object({ folio: z.string(), tipo: z.string() }).optional().parse(rows[0]);
	if (traspaso === undefined) throw noExiste();
	if (!tiposConEtiquetas.has(traspaso.tipo)) {
		throw errorDeRegla("sin_etiquetas", `${traspaso.folio} no lleva etiquetas.`);
	}
	// Las piezas que contó Aduana para este destino: lo recibido menos lo que se repartió a otros A-.
	const { rows: filas } = await contexto.base.execute(sql`
		SELECT l.variante_id, l.rollo_id,
			coalesce(l.piezas_recibidas_aduana, l.piezas_enviadas, 0) - l.piezas_repartidas AS piezas
		FROM traspaso_lineas l LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN tallas t ON t.id = v.talla_id
		WHERE l.traspaso_id = ${traspasoId}::uuid AND (l.variante_id IS NOT NULL OR l.rollo_id IS NOT NULL)
		ORDER BY l.rollo_id IS NOT NULL, ${ordenDeTallas("t")}, l.renglon`);
	const renglones = z.array(delRenglon).parse(filas);
	return {
		variantes: renglones.flatMap(({ variante_id: varianteId, piezas }) =>
			varianteId === null ? [] : Array.from({ length: Math.max(piezas, 0) }, () => varianteId),
		),
		rollos: renglones.flatMap((renglon) => (renglon.rollo_id === null ? [] : [renglon.rollo_id])),
	};
}

/** La etiqueta de rollo o de retazo: la pide Bodega en PDF. */
export const tipoRollo: TipoDeEtiqueta = {
	tipo: "rollo",
	departamentos: ["bodega"],
	dibujar: async (contexto, pedido) =>
		dibujarRollos(await etiquetasDeRollo(contexto, pedido.ids), pedido.formato, pedido.copias),
};

/** Las etiquetas de un A- al salir de aduana: las pide Aduana, en su Zebra o en PDF. */
export const tipoTraspaso: TipoDeEtiqueta = {
	tipo: "traspaso",
	departamentos: ["aduana"],
	dibujar: async (contexto, pedido) => {
		const variantes: string[] = [];
		const rollos: string[] = [];
		for (const id of pedido.ids) {
			const lleva = await loQueLleva(contexto, id);
			variantes.push(...lleva.variantes);
			rollos.push(...lleva.rollos);
		}
		if (rollos.length > 0) {
			return dibujarRollos(await etiquetasDeRollo(contexto, rollos), pedido.formato, pedido.copias);
		}
		const prenda = contexto.registro.tiposDeEtiqueta.get("prenda");
		if (prenda === undefined) throw new Error("no está registrado el tipo de etiqueta prenda");
		return prenda.dibujar(contexto, { ids: variantes, formato: pedido.formato, copias: pedido.copias });
	},
};
