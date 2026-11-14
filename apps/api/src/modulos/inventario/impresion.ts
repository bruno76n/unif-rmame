/**
 * Los tipos de impresión de Inventario: la etiqueta de rollo (`rollo`, o la del retazo si el rollo quedó como retazo);
 * todas las etiquetas que lleva un A- al salir de aduana (`traspaso`): una de prenda por pieza que Aduana contó para
 * ese destino, talla por talla, o una de rollo por cada rollo del material de un proveedor; y la hoja del despacho
 * (`despacho`), que viaja con la mercancía y nunca lleva precios.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de rollo y la de retazo» y «Lo que lleva un A- al salir de
 * aduana»), docs/impresos/hojas.md («La hoja del despacho») y docs/modulos/inventario/surtido-y-despachos.md
 * (`inventario.marcar_etiquetas_impresas`)
 *
 * El tipo `traspaso` no dibuja nada propio: pide al registro el tipo `prenda` de Catálogo con sus variantes, una por
 * pieza, o dibuja las de rollo. Ninguna etiqueta de material lleva un costo.
 */

import { diaDeNegocio, textoDeDiaConAnio, textoDeHora, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { dibujarRollos, type EtiquetaDeMaterial } from "../../impresos/etiquetas/rollo.ts";
import { dibujarHojaDeDespacho, type TraspasoDelDespacho } from "../../impresos/hojas/despacho.ts";
import { nombreDeCuenta } from "../../nucleo/acciones/comunes.ts";
import { marcoDeLaHoja } from "../../nucleo/hojas.ts";
import { errorDeRegla, noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import { ordenDeTallas } from "../catalogo/dominio/tallas.ts";
import { piezasEscritas, tipoEscrito } from "./consultas/aduana-comun.ts";
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
			tela: rollo.tela,
			partida: rollo.partida === null ? "Sin partida" : `Partida ${rollo.partida}`,
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

/** Un despacho como lo lleva su hoja. */
const delDespacho = z.object({
	folio: z.string(),
	despachado: z.string(),
	despacho_por: z.uuid(),
	destino: z.string().nullable(),
	cliente: z.string().nullable(),
	nota: z.string().nullable(),
});

/** Un traspaso del despacho, con su documento de origen. */
const delTraspaso = z.object({
	id: z.uuid(),
	folio: z.string(),
	tipo: z.string(),
	lote: z.string().nullable(),
	reproceso: z.string().nullable(),
	nota: z.string().nullable(),
	orden: z.string().nullable(),
});

/** Un renglón de un traspaso del despacho: una prenda en una talla con sus piezas, o un material. */
const delRenglonDelDespacho = z.object({
	traspaso_id: z.uuid(),
	prenda: z.string().nullable(),
	talla: z.string().nullable(),
	piezas: z.coerce.number().nullable(),
	material: z.string().nullable(),
	rollo: z.string().nullable(),
	cantidad: z.string().nullable(),
	unidad: z.string().nullable(),
});

/** Cómo se dice el destino de un lote en la hoja del despacho. */
const destinoDeLote: Readonly<Record<string, string>> = {
	lote_cliente: "pedido",
	lote_reabasto: "reabasto",
	lote_temporada: "temporada",
	lote_pedido_especial: "pedido especial",
};

/**
 * De qué es un traspaso del despacho: «L-2026-124 · reabasto», «NV-0151», «OC-0225 · material».
 * @param traspaso El traspaso.
 */
function deQueEs(traspaso: z.infer<typeof delTraspaso>): string {
	if (traspaso.lote !== null && traspaso.tipo in destinoDeLote)
		return `${traspaso.lote} · ${destinoDeLote[traspaso.tipo]}`;
	if (traspaso.reproceso !== null) return traspaso.reproceso;
	if (traspaso.nota !== null) return traspaso.nota;
	if (traspaso.orden !== null) return `${traspaso.orden} · material`;
	return tipoEscrito(traspaso.tipo);
}

/**
 * El PDF de la hoja de un despacho.
 * @param contexto El contexto de quien la pide.
 * @param despachoId El despacho.
 * @throws `404` si no existe.
 */
async function hojaDelDespacho(contexto: ContextoDeConsulta, despachoId: string): Promise<Uint8Array> {
	const { rows } = await contexto.base.execute(sql`
		SELECT d.folio, d.despachado_en::text AS despachado, d.despachado_por AS despacho_por, u.nombre AS destino,
			tc.nombre AS cliente, nv.folio AS nota
		FROM despachos d LEFT JOIN ubicaciones u ON u.id = d.destino_ubicacion_id
		LEFT JOIN notas_entrega nv ON nv.id = d.nota_entrega_id
		LEFT JOIN clientes c ON c.id = coalesce(d.cliente_id, nv.cliente_id) LEFT JOIN terceros tc ON tc.id = c.tercero_id
		WHERE d.id = ${despachoId}::uuid`);
	const despacho = delDespacho.optional().parse(rows[0]);
	if (despacho === undefined) throw noExiste();
	const { rows: traspasos } = await contexto.base.execute(sql`
		SELECT tr.id, tr.folio, tr.tipo, lo.folio AS lote, rp.folio AS reproceso, nv.folio AS nota, oc.folio AS orden
		FROM traspasos tr LEFT JOIN lotes lo ON lo.id = tr.lote_id LEFT JOIN reprocesos rp ON rp.id = tr.reproceso_id
		LEFT JOIN notas_entrega nv ON nv.id = tr.nota_entrega_id LEFT JOIN ordenes_compra oc ON oc.id = tr.orden_compra_id
		WHERE tr.despacho_id = ${despachoId}::uuid ORDER BY tr.folio`);
	const { rows: renglones } = await contexto.base.execute(sql`
		SELECT tr.id AS traspaso_id, p.nombre AS prenda, t.nombre AS talla,
			coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas AS piezas, m.nombre AS material,
			r.folio AS rollo, (coalesce(l.cantidad_recibida_aduana, 0) - l.cantidad_repartida)::text AS cantidad, m.unidad
		FROM traspasos tr JOIN traspaso_lineas l ON l.traspaso_id = tr.id
		LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN tallas t ON t.id = v.talla_id LEFT JOIN materiales m ON m.id = l.material_id
		LEFT JOIN rollos r ON r.id = l.rollo_id
		WHERE tr.despacho_id = ${despachoId}::uuid ORDER BY tr.folio, p.nombre, ${ordenDeTallas("t")}, l.renglon`);
	const todos = z.array(delRenglonDelDespacho).parse(renglones);
	const salio = Temporal.Instant.from(new Date(despacho.despachado).toISOString());
	const dia = diaDeNegocio(salio);
	const quien = await contexto.comoAccion((accion) => nombreDeCuenta(accion, despacho.despacho_por));
	const deTraspasos: TraspasoDelDespacho[] = z
		.array(delTraspaso)
		.parse(traspasos)
		.map((traspaso) => {
			const suyos = todos.filter((renglon) => renglon.traspaso_id === traspaso.id);
			const titulo = `${traspaso.folio} · ${deQueEs(traspaso)}`;
			if (suyos.every((renglon) => renglon.prenda === null)) {
				return {
					titulo,
					tipo: "material",
					renglones: suyos.map((renglon) => ({
						material: renglon.material ?? "",
						rollo: renglon.rollo ?? "—",
						cantidad: `${metrosEscritos(renglon.cantidad ?? "0")} ${renglon.unidad ?? ""}`.trim(),
					})),
				};
			}
			return {
				titulo,
				tipo: "prendas",
				renglones: suyos
					.filter((renglon) => renglon.prenda !== null && (renglon.piezas ?? 0) > 0)
					.map((renglon) => ({
						prenda: renglon.prenda ?? "",
						talla: renglon.talla ?? "",
						piezas: String(renglon.piezas ?? 0),
					})),
			};
		});
	const piezas = todos.reduce((suma, renglon) => suma + (renglon.prenda === null ? 0 : (renglon.piezas ?? 0)), 0);
	const destino =
		despacho.nota === null
			? (despacho.destino ?? despacho.cliente ?? "")
			: `${despacho.cliente ?? ""} · ${despacho.nota}`;
	const marco = await marcoDeLaHoja(contexto, {
		nombre: "Despacho",
		folio: despacho.folio,
		fecha: textoDeDiaConAnio(dia),
	});
	return dibujarHojaDeDespacho(marco, {
		destino: `A ${destino}`,
		salio: `Salió el ${textoDeDiaConAnio(dia)} a las ${textoDeHora(salio)} · lo despachó ${quien}`,
		traspasos: deTraspasos,
		total: piezas === 0 ? null : `${piezasEscritas(piezas)} en total`,
	});
}

/** La hoja del despacho: la saca Aduana. */
export const tipoDespacho: TipoDeEtiqueta = {
	tipo: "despacho",
	departamentos: ["aduana"],
	dibujar: async (contexto, pedido) => {
		const [despachoId] = pedido.ids;
		if (despachoId === undefined) throw noExiste();
		return hojaDelDespacho(contexto, despachoId);
	},
};
