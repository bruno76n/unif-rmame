/**
 * Lo que comparten las consultas de las pantallas de Aduana: lo que está en aduana (con su título, su detalle, su
 * destino, su antigüedad, su «Sale hoy» y su botón), lo que espera entrar, y cómo se escriben la antigüedad, lo que
 * no se confirma y las cantidades.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Andén»: lo que puede estar en aduana; «Recepción») y
 * docs/modulos/inventario/traspasos.md («La partida en aduana», «La antigüedad en aduana y lo que no se confirma»)
 *
 * El color de la antigüedad y el «Sale hoy» salen de la vista `partidas_aduana`, que los calcula con los parámetros;
 * lo que espera entrar de un proveedor sale de `compras.ordenes_por_recibir`, y lo del taller de
 * `produccion.lote_para_aduana` y `calidad.aprobadas_del_lote`.
 */

import { diasHasta, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { coloresDeEstado } from "@uniformame/compartido/contratos/estados";
import type { loQueAbre, partidaEnAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { tiposConEtiquetas } from "../dominio/despachos.ts";
import { datosDeDevolucion } from "../dominio/devoluciones.ts";
import { leerLoteParaAduana } from "../dominio/taller.ts";
import { traspasos } from "../tablas.ts";
import { metrosEscritos } from "./bodega-comun.ts";

/** Un color de estado. */
type Color = (typeof coloresDeEstado)[number];

/** Un texto con su color. */
export interface TextoConColor {
	texto: string;
	color: Color;
}

/** Lo que está en aduana, como lo mandan las consultas. */
export type PartidaEnAduana = z.infer<typeof partidaEnAduana>;

/** Lo que abre una tarjeta o un renglón. */
export type LoQueAbre = z.infer<typeof loQueAbre>;

/**
 * Unas piezas como las escribe la pantalla: «1 pieza», «58 piezas».
 * @param piezas Cuántas.
 */
export function piezasEscritas(piezas: number): string {
	return plural(piezas, "pieza", "piezas");
}

/**
 * Cuántos días de negocio pasaron desde un día.
 * @param hoy El día de negocio.
 * @param dia El día, en ISO.
 */
export function diasDesde(hoy: Temporal.PlainDate, dia: string): number {
	return Math.max(0, -diasHasta(hoy, dia));
}

/**
 * La antigüedad en aduana como la dice la pantalla: «Llegó hoy», «1 día en aduana», «{n} días en aduana».
 * @param dias Los días desde que llegó.
 */
export function antiguedadEscrita(dias: number): string {
	if (dias === 0) return "Llegó hoy";
	return `${plural(dias, "día", "días")} en aduana`;
}

/**
 * Lo que lleva sin confirmar lo que va en camino o en tránsito: «Salió hoy» (verde), «1 día» (ámbar) y, desde
 * `inventario.dias_sin_confirmar_rojo`, en rojo.
 * @param dias Los días desde que salió.
 * @param diasRojo `inventario.dias_sin_confirmar_rojo`.
 */
export function sinConfirmar(dias: number, diasRojo: number): TextoConColor {
	if (dias === 0) return { texto: "Salió hoy", color: "verde" };
	return { texto: plural(dias, "día", "días"), color: dias >= diasRojo ? "rojo" : "ambar" };
}

/**
 * Una cantidad de material: «300 m», «500 pza»; con varios materiales, «{n} materiales».
 * @param materiales Lo de cada material: su cantidad y su unidad.
 */
export function materialEscrito(materiales: readonly { cantidad: number; unidad: string }[]): string {
	const unidades = new Set(materiales.map((material) => material.unidad));
	if (unidades.size !== 1) return plural(materiales.length, "material", "materiales");
	const total = materiales.reduce((suma, material) => suma + material.cantidad, 0);
	return `${metrosEscritos(total)} ${[...unidades][0]}`;
}

/** Lo que se lee de cada cosa en aduana, antes de escribirla. */
const filaEnAduana = z.object({
	id: z.uuid(),
	folio: z.string(),
	version: z.coerce.number(),
	tipo: z.string(),
	estado: z.string(),
	es_hijo: z.boolean(),
	destino_externo: z.string().nullable(),
	destino_codigo: z.string().nullable(),
	destino_nombre: z.string().nullable(),
	origen_nombre: z.string().nullable(),
	llego: z.string(),
	llego_dia: z.string(),
	salida: z.string().nullable(),
	color: z.enum(["verde", "ambar", "rojo"]).nullable(),
	sale: z.string().nullable(),
	impresas: z.boolean(),
	orden_compra_id: z.uuid().nullable(),
	pedido_id: z.uuid().nullable(),
	pedido: z.string().nullable(),
	nota: z.string().nullable(),
	cliente: z.string().nullable(),
	lote: z.string().nullable(),
	reproceso: z.string().nullable(),
	orden: z.string().nullable(),
	proveedor: z.string().nullable(),
	prendas: z.string().nullable(),
	piezas: z.coerce.number(),
	materiales: z
		.array(z.object({ nombre: z.string(), unidad: z.string(), cantidad: z.coerce.number() }))
		.nullable()
		.transform((materiales) => materiales ?? []),
	rollos: z.coerce.number(),
	defectos: z.string().nullable(),
	pedidos_linea: z.string().nullable(),
});

/** Una cosa en aduana como se leyó. */
export type FilaEnAduana = z.infer<typeof filaEnAduana>;

/**
 * Lee lo que está en aduana: los traspasos `en_aduana` y lo de más que espera regresar al proveedor desde aduana, con
 * lo que queda de cada renglón (lo recibido menos lo repartido), sus documentos y el color y el «sale» de la vista
 * `partidas_aduana`. Lo de más que espera toma la llegada y el color del A- de su orden, donde están sus rollos.
 * @param contexto El contexto de la lectura.
 * @param soloTraspaso Si se pide, solo ese traspaso.
 */
export async function leerEnAduana(contexto: ContextoDeAccion, soloTraspaso?: string): Promise<FilaEnAduana[]> {
	const solo = soloTraspaso === undefined ? sql`` : sql`AND t.id = ${soloTraspaso}::uuid`;
	const { rows } = await contexto.transaccion.execute(sql`
	SELECT t.id, t.folio, t.version, t.tipo, t.estado, t.traspaso_padre_id IS NOT NULL AS es_hijo, t.destino_externo,
		ud.codigo AS destino_codigo, ud.nombre AS destino_nombre, uo.nombre AS origen_nombre,
		coalesce(pa.llego_aduana_en, t.llego_aduana_en, t.creado_en)::text AS llego,
		(coalesce(pa.llego_aduana_en, t.llego_aduana_en, t.creado_en) AT TIME ZONE 'America/Mexico_City')::date::text AS llego_dia,
		t.fecha_salida_esperada::text AS salida, pa.color,
		CASE WHEN t.estado = 'en_aduana' THEN pa.sale END AS sale,
		t.etiquetas_impresas_en IS NOT NULL AS impresas, t.orden_compra_id, t.pedido_id,
		pe.folio AS pedido, nv.folio AS nota, coalesce(tcn.nombre, tcp.nombre) AS cliente, lo.folio AS lote,
		rp.folio AS reproceso, oc.folio AS orden, tpr.nombre AS proveedor,
		x.prendas, coalesce(x.piezas, 0) AS piezas, x.materiales, coalesce(x.rollos, 0) AS rollos, x.defectos,
		x.pedidos_linea
	FROM traspasos t
	LEFT JOIN ubicaciones ud ON ud.id = t.destino_ubicacion_id
	LEFT JOIN ubicaciones uo ON uo.id = t.origen_ubicacion_id
	LEFT JOIN pedidos pe ON pe.id = t.pedido_id
	LEFT JOIN clientes cp ON cp.id = pe.cliente_id LEFT JOIN terceros tcp ON tcp.id = cp.tercero_id
	LEFT JOIN notas_entrega nv ON nv.id = t.nota_entrega_id
	LEFT JOIN clientes cn ON cn.id = nv.cliente_id LEFT JOIN terceros tcn ON tcn.id = cn.tercero_id
	LEFT JOIN lotes lo ON lo.id = t.lote_id
	LEFT JOIN reprocesos rp ON rp.id = t.reproceso_id
	LEFT JOIN ordenes_compra oc ON oc.id = t.orden_compra_id
	LEFT JOIN proveedores pr ON pr.id = oc.proveedor_id LEFT JOIN terceros tpr ON tpr.id = pr.tercero_id
	LEFT JOIN LATERAL (
		SELECT pa.color, pa.sale, pa.llego_aduana_en FROM partidas_aduana pa
		WHERE pa.traspaso_id = t.id OR (t.estado = 'esperado' AND pa.traspaso_id IN (
			SELECT a.id FROM traspasos a WHERE a.orden_compra_id = t.orden_compra_id AND a.tipo = 'material_proveedor'))
		ORDER BY pa.llego_aduana_en LIMIT 1
	) pa ON true
	LEFT JOIN LATERAL (
		SELECT string_agg(DISTINCT p.nombre, ', ') AS prendas,
			sum(CASE WHEN t.estado = 'esperado' THEN l.piezas_enviadas
				ELSE coalesce(l.piezas_recibidas_aduana, 0) - l.piezas_repartidas END)::int AS piezas,
			json_agg(json_build_object('nombre', m.nombre, 'unidad', m.unidad, 'cantidad',
				CASE WHEN t.estado = 'esperado' THEN l.cantidad_enviada
					ELSE coalesce(l.cantidad_recibida_aduana, 0) - l.cantidad_repartida END))
				FILTER (WHERE l.material_id IS NOT NULL) AS materiales,
			count(l.rollo_id) AS rollos,
			string_agg(DISTINCT d.nombre, ', ') AS defectos,
			string_agg(DISTINCT w.folio, ', ') AS pedidos_linea
		FROM traspaso_lineas l
		LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN materiales m ON m.id = l.material_id
		LEFT JOIN defectos d ON d.id = l.defecto_id
		LEFT JOIN pedidos_linea w ON w.id = l.pedido_linea_id
		WHERE l.traspaso_id = t.id
	) x ON true
	WHERE (t.estado = 'en_aduana' OR (t.estado = 'esperado' AND t.tipo = 'devolucion_proveedor'
		AND t.origen_ubicacion_id = (SELECT id FROM ubicaciones WHERE tipo = 'aduana')))
		${solo}
	ORDER BY llego, t.folio`);
	return z.array(filaEnAduana).parse(rows);
}

/** El destino de lo que está en aduana: su carril y cómo se llama. */
export function destinoDe(fila: FilaEnAduana): { carril: string; destino: string } {
	if (fila.tipo === "devolucion_proveedor") return { carril: "proveedor", destino: fila.proveedor ?? "El proveedor" };
	if (fila.tipo === "pedido_linea" || fila.destino_externo === "cliente_linea") {
		return { carril: "linea", destino: "En línea" };
	}
	if (fila.destino_externo === "cliente_externo") {
		return { carril: "externos", destino: fila.cliente ?? "Clientes externos" };
	}
	if (fila.destino_codigo !== null) return { carril: fila.destino_codigo, destino: fila.destino_nombre ?? "" };
	return { carril: "calidad", destino: "Calidad decide" };
}

/**
 * El título y el detalle de lo que está en aduana, según lo que es (la tabla «Lo que puede estar en aduana»).
 * @param fila Lo que se leyó.
 */
export function tituloYDetalle(fila: FilaEnAduana): { titulo: string; detalle: string } {
	const prenda = fila.prendas ?? "";
	const { destino } = destinoDe(fila);
	const materiales = fila.materiales.map((material) => material.nombre);
	switch (fila.tipo) {
		case "lote_cliente":
			return { titulo: prenda, detalle: `${fila.cliente ?? ""} · ${fila.pedido ?? ""} · sin nota` };
		case "quitado_de_pedido":
			return { titulo: prenda, detalle: `Se quitó de ${fila.pedido ?? fila.lote ?? ""} · a bodega` };
		case "excedente_pedido":
			return { titulo: prenda, detalle: `Sobró de ${fila.lote ?? ""} · a bodega` };
		case "lote_reabasto":
		case "lote_pedido_especial":
			return { titulo: prenda, detalle: `Reabasto de ${destino}` };
		case "lote_temporada":
			return { titulo: prenda, detalle: "Temporada" };
		case "reproceso":
			return { titulo: prenda, detalle: `${fila.reproceso ?? ""} · ${destino}` };
		case "nota_entrega":
			return { titulo: `Nota ${fila.nota ?? ""} · ${prenda}`, detalle: `${fila.cliente ?? ""} · ${fila.pedido ?? ""}` };
		case "solicitud_tienda":
			return {
				titulo: `Solicitud de ${destino}`,
				detalle: `${plural(fila.piezas, "prenda", "prendas")}, surtido de bodega`,
			};
		case "reabasto":
			return {
				titulo: `Reabasto de bodega para ${destino}`,
				detalle: `${plural(fila.piezas, "prenda", "prendas")}, de bodega`,
			};
		case "surtido_pedido_externo":
			return { titulo: `Pedido ${fila.pedido ?? ""} · ${fila.cliente ?? ""}`, detalle: "Surtido de bodega" };
		case "material_proveedor":
			return {
				titulo: [...new Set(materiales)].join(", "),
				detalle: `${fila.proveedor ?? ""} · ${plural(fila.rollos, "rollo", "rollos")}`,
			};
		case "devolucion_cliente_externo":
		case "devolucion_linea":
		case "devolucion_defecto":
			return {
				titulo: `Devolución de ${fila.cliente ?? fila.origen_nombre ?? "un cliente"}`,
				detalle: [prenda, fila.defectos].filter((parte) => parte !== null && parte !== "").join(" · "),
			};
		case "regresa":
			return {
				titulo: `Regresa a ${destino} · ${prenda}`,
				detalle: `${fila.pedido ?? fila.pedidos_linea ?? ""} cancelado`,
			};
		case "devolucion_proveedor":
			return { titulo: `Regresa a ${destino}`, detalle: `${fila.orden ?? ""} · lo de más que rechazó Dirección` };
		case "pedido_linea":
			return { titulo: `Pedido en línea ${fila.pedidos_linea ?? ""}`, detalle: prenda };
		default:
			return { titulo: prenda === "" ? [...new Set(materiales)].join(", ") : prenda, detalle: fila.folio };
	}
}

/**
 * Cuánto es lo que está en aduana: sus piezas o su material.
 * @param fila Lo que se leyó.
 */
export function cantidadDe(fila: FilaEnAduana): string {
	if (fila.materiales.length > 0 && fila.piezas === 0) return materialEscrito(fila.materiales);
	return piezasEscritas(fila.piezas);
}

/**
 * El botón de lo que está en aduana: «Ver pedido» en un pedido en línea, «Ver» si lo revisa Calidad, «Devolver al
 * proveedor» en lo que regresa, «Sin nota» si va a un cliente sin su nota de entrega y «Despachar» en lo demás.
 * @param fila Lo que se leyó.
 */
export function botonDe(fila: FilaEnAduana): PartidaEnAduana["boton"] {
	const { carril } = destinoDe(fila);
	if (carril === "linea") return "ver_pedido";
	if (carril === "calidad") return "ver";
	if (carril === "proveedor") return "devolver";
	if (carril === "externos" && fila.tipo !== "nota_entrega") return "sin_nota";
	return "despachar";
}

/**
 * Lo de más que regresa a un proveedor, para su ventana: lo que dice Compras, lo que regresa y, si es tela, los rollos
 * de esa orden que están en aduana.
 * @param contexto El contexto de la lectura.
 * @param fila La devolución.
 */
async function devolucionDe(contexto: ContextoDeAccion, fila: FilaEnAduana): Promise<PartidaEnAduana["devolucion"]> {
	const [devolucion] = await contexto.transaccion.select().from(traspasos).where(sql`${traspasos.id} = ${fila.id}`);
	if (devolucion === undefined) return null;
	const datos = await datosDeDevolucion(contexto, devolucion);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.id AS rollo_id, r.folio, em.cantidad::text AS metros FROM rollos r
		JOIN existencias_material em ON em.rollo_id = r.id
		JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'aduana'
		WHERE r.material_id = ${datos.materialId}::uuid AND r.orden_compra_id = ${devolucion.ordenCompraId}::uuid
			AND r.estado <> 'devuelto' AND em.cantidad > 0
		ORDER BY r.folio`);
	const rollos = z
		.array(z.object({ rollo_id: z.uuid(), folio: z.string(), metros: z.string() }))
		.parse(rows)
		.map((rollo) => ({ ...rollo, metros: metrosEscritos(rollo.metros) }));
	const cantidad = fila.materiales.reduce((suma, material) => suma + material.cantidad, 0);
	return {
		proveedor: datos.proveedor,
		material: datos.material,
		orden: datos.folioOrden,
		cantidad: metrosEscritos(cantidad),
		unidad: datos.unidad,
		es_tela: datos.esTela,
		rollos: datos.esTela ? rollos : [],
	};
}

/**
 * Escribe lo que está en aduana como lo mandan las consultas.
 * @param contexto El contexto de la lectura.
 * @param fila Lo que se leyó.
 */
export async function partidaDe(contexto: ContextoDeAccion, fila: FilaEnAduana): Promise<PartidaEnAduana> {
	const { carril, destino } = destinoDe(fila);
	const dias = diasDesde(contexto.diaDeNegocio, fila.llego_dia);
	return {
		traspaso_id: fila.id,
		folio: fila.folio,
		version: fila.version,
		...tituloYDetalle(fila),
		cantidad: cantidadDe(fila),
		piezas: fila.piezas,
		carril,
		destino,
		llego: textoDeDiaCorto(fila.llego_dia),
		antiguedad: { texto: antiguedadEscrita(dias), color: fila.color ?? "verde" },
		sale: fila.sale === "hoy" ? "Sale hoy" : fila.sale === "manana" ? "Sale mañana" : null,
		fecha_salida: fila.salida,
		etiquetas_por_imprimir: tiposConEtiquetas.has(fila.tipo) && !fila.impresas,
		boton: botonDe(fila),
		devolucion: fila.tipo === "devolucion_proveedor" ? await devolucionDe(contexto, fila) : null,
	};
}

/**
 * Todo lo que está en aduana, escrito, de lo más viejo a lo más nuevo.
 * @param contexto El contexto de la lectura.
 */
export async function partidasEnAduana(contexto: ContextoDeAccion): Promise<PartidaEnAduana[]> {
	const filas = await leerEnAduana(contexto);
	const partidas: PartidaEnAduana[] = [];
	for (const fila of filas) partidas.push(await partidaDe(contexto, fila));
	return partidas;
}

/** Lo que espera entrar, con su grupo de Recepción. */
export interface PorRecibir {
	grupo: "taller" | "bodega" | "proveedores" | "clientes";
	clave: string;
	titulo: string;
	detalle: string;
	cantidad: string;
	carril: string;
	destino: string;
	/** «Atrasada {n} días», si es una orden atrasada. */
	etiqueta: TextoConColor | null;
	/** De dónde viene o cuándo llega. */
	marca: { texto: string; color: Color | null };
	abre: LoQueAbre;
	atrasada: boolean;
}

/** Lo que regresa `calidad.aprobadas_del_lote`, en lo que se usa aquí. */
const aprobadasDelLote = z
	.object({ tallas: z.array(z.object({ variante_id: z.uuid(), piezas_aprobadas: z.number() })) })
	.passthrough()
	.nullable();

/**
 * El destino de un lote, como lo dice Aduana: su tienda, Bodega o el cliente de su pedido; con «y Bodega» si parte va a
 * Bodega.
 * @param contexto El contexto de la lectura.
 * @param loteId El lote.
 */
export async function destinoDelLote(contexto: ContextoDeAccion, loteId: string) {
	const lote = await leerLoteParaAduana(contexto, loteId);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT (SELECT codigo FROM ubicaciones WHERE id = ${lote.ubicacion_destino_id}::uuid) AS codigo,
			(SELECT nombre FROM ubicaciones WHERE id = ${lote.ubicacion_destino_id}::uuid) AS tienda,
			(SELECT t.nombre FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN terceros t ON t.id = c.tercero_id
				WHERE p.id = ${lote.pedido_id}::uuid) AS cliente`);
	const leido = z
		.object({ codigo: z.string().nullable(), tienda: z.string().nullable(), cliente: z.string().nullable() })
		.parse(rows[0] ?? {});
	const conBodega = lote.destino === "pedido" && lote.tallas.some((talla) => talla.piezas_a_bodega > 0);
	const base =
		lote.destino === "pedido"
			? { carril: "externos", destino: leido.cliente ?? "Clientes externos" }
			: lote.destino === "tienda"
				? { carril: leido.codigo ?? "", destino: leido.tienda ?? "" }
				: { carril: "BOD", destino: "Bodega" };
	return { lote, ...base, vaA: conBodega ? `${base.destino} y Bodega` : base.destino };
}

/**
 * Lo que espera entrar del taller: los lotes revisados y los reprocesos aprobados sin recibir, con lo que aprobó
 * Calidad (solo la lista lo dice; el cajón cuenta a ciegas).
 * @param contexto El contexto de la lectura.
 */
async function delTaller(contexto: ContextoDeAccion): Promise<PorRecibir[]> {
	const { rows: lotes } = await contexto.transaccion.execute(
		sql`SELECT id FROM lotes WHERE estado = 'revisado' ORDER BY revisado_en, folio`,
	);
	const { rows: reprocesos } = await contexto.transaccion.execute(sql`
		SELECT r.id, r.folio, r.lote_id, r.piezas_aprobadas FROM reprocesos r
		WHERE r.estado = 'listo' AND NOT EXISTS (SELECT 1 FROM recepciones rc WHERE rc.reproceso_id = r.id)
		ORDER BY r.aprobado_en, r.folio`);
	const marca = { texto: "Del taller", color: null };
	const entradas: PorRecibir[] = [];
	for (const { id } of z.array(z.object({ id: z.uuid() })).parse(lotes)) {
		const { lote, carril, vaA } = await destinoDelLote(contexto, id);
		const aprobadas = aprobadasDelLote.parse(await contexto.lectura("calidad.aprobadas_del_lote", { lote_id: id }));
		const piezas = (aprobadas?.tallas ?? []).reduce((suma, talla) => suma + talla.piezas_aprobadas, 0);
		entradas.push({
			grupo: "taller",
			clave: id,
			titulo: lote.prenda,
			detalle: `${lote.folio} · revisado por calidad`,
			cantidad: piezasEscritas(piezas),
			carril,
			destino: vaA,
			etiqueta: null,
			marca,
			abre: { a: "taller", id },
			atrasada: false,
		});
	}
	const deReprocesos = z
		.array(z.object({ id: z.uuid(), folio: z.string(), lote_id: z.uuid(), piezas_aprobadas: z.coerce.number() }))
		.parse(reprocesos);
	for (const reproceso of deReprocesos) {
		const { lote, carril, vaA } = await destinoDelLote(contexto, reproceso.lote_id);
		entradas.push({
			grupo: "taller",
			clave: reproceso.id,
			titulo: lote.prenda,
			detalle: `${reproceso.folio} · reproceso aprobado`,
			cantidad: piezasEscritas(reproceso.piezas_aprobadas),
			carril,
			destino: vaA,
			etiqueta: null,
			marca,
			abre: { a: "reproceso", id: reproceso.id },
			atrasada: false,
		});
	}
	return entradas;
}

/** El tipo de lo que viene en camino, como lo dice Aduana. */
export function tipoEscrito(tipo: string): string {
	const tipos: Readonly<Record<string, string>> = {
		solicitud_tienda: "Solicitud de tienda",
		reabasto: "Reabasto",
		pedido_linea: "Pedido en línea",
		surtido_pedido_externo: "Surtido para un pedido",
		devolucion_proveedor: "Regresa al proveedor",
		devolucion_cliente_externo: "Devolución de un cliente",
		devolucion_linea: "Devolución en línea",
	};
	return tipos[tipo] ?? "Surtido de bodega";
}

/** Lo que se lee de lo que viene en camino o se espera. */
const filaEnCamino = z.object({
	id: z.uuid(),
	folio: z.string(),
	tipo: z.string(),
	estado: z.string(),
	origen_tipo: z.string().nullable(),
	origen_nombre: z.string().nullable(),
	destino_externo: z.string().nullable(),
	destino_codigo: z.string().nullable(),
	destino_nombre: z.string().nullable(),
	enviado_dia: z.string().nullable(),
	cliente: z.string().nullable(),
	nota_credito: z.string().nullable(),
	pedido: z.string().nullable(),
	pedidos_linea: z.string().nullable(),
	prendas: z.string().nullable(),
	piezas: z.coerce.number(),
	materiales: z
		.array(z.object({ nombre: z.string(), unidad: z.string(), cantidad: z.coerce.number() }))
		.nullable()
		.transform((materiales) => materiales ?? []),
});

/** Lo que viene en camino o se espera, como se leyó. */
export type FilaEnCamino = z.infer<typeof filaEnCamino>;

/**
 * Lee lo que viene en camino a aduana (de Bodega o de una tienda) y las devoluciones de los clientes que se esperan, lo
 * más viejo primero, con lo que mandaron.
 * @param contexto El contexto de la lectura.
 * @param filtro `soloEnCamino` (sin las devoluciones esperadas) o un solo traspaso.
 */
export async function leerEnCamino(
	contexto: ContextoDeAccion,
	filtro: { soloEnCamino?: boolean; traspasoId?: string } = {},
): Promise<FilaEnCamino[]> {
	const estados =
		filtro.soloEnCamino === true
			? sql`t.estado = 'en_camino_aduana'`
			: sql`(t.estado = 'en_camino_aduana'
		OR (t.estado = 'esperado' AND t.tipo IN ('devolucion_cliente_externo', 'devolucion_linea')))`;
	const solo = filtro.traspasoId === undefined ? sql`` : sql`AND t.id = ${filtro.traspasoId}::uuid`;
	const { rows } = await contexto.transaccion.execute(sql`
	SELECT t.id, t.folio, t.tipo, t.estado, uo.tipo AS origen_tipo, uo.nombre AS origen_nombre, t.destino_externo,
		ud.codigo AS destino_codigo, ud.nombre AS destino_nombre,
		(t.enviado_en AT TIME ZONE 'America/Mexico_City')::date::text AS enviado_dia,
		coalesce(tnc.nombre, tpe.nombre) AS cliente, nc.folio AS nota_credito, pe.folio AS pedido,
		x.prendas, coalesce(x.piezas, 0) AS piezas, x.materiales, x.pedidos_linea
	FROM traspasos t
	LEFT JOIN ubicaciones uo ON uo.id = t.origen_ubicacion_id
	LEFT JOIN ubicaciones ud ON ud.id = t.destino_ubicacion_id
	LEFT JOIN pedidos pe ON pe.id = t.pedido_id
	LEFT JOIN clientes cpe ON cpe.id = pe.cliente_id LEFT JOIN terceros tpe ON tpe.id = cpe.tercero_id
	LEFT JOIN notas_credito nc ON nc.id = t.nota_credito_id
	LEFT JOIN clientes cnc ON cnc.id = nc.cliente_id LEFT JOIN terceros tnc ON tnc.id = cnc.tercero_id
	LEFT JOIN LATERAL (
		SELECT string_agg(DISTINCT p.nombre, ', ') AS prendas, sum(l.piezas_enviadas)::int AS piezas,
			json_agg(json_build_object('nombre', m.nombre, 'unidad', m.unidad, 'cantidad', l.cantidad_enviada))
				FILTER (WHERE l.material_id IS NOT NULL) AS materiales,
			string_agg(DISTINCT w.folio, ', ') AS pedidos_linea
		FROM traspaso_lineas l
		LEFT JOIN variantes v ON v.id = l.variante_id LEFT JOIN productos p ON p.id = v.producto_id
		LEFT JOIN materiales m ON m.id = l.material_id
		LEFT JOIN pedidos_linea w ON w.id = l.pedido_linea_id
		WHERE l.traspaso_id = t.id
	) x ON true
	WHERE ${estados} ${solo}
	ORDER BY coalesce(t.enviado_en, t.creado_en), t.folio`);
	return z.array(filaEnCamino).parse(rows);
}

/**
 * A dónde va lo que viene en camino: su carril y cómo se llama.
 * @param fila Lo que se leyó.
 */
export function destinoEnCamino(fila: FilaEnCamino): { carril: string; destino: string } {
	if (fila.tipo === "pedido_linea" || fila.destino_externo === "cliente_linea") {
		return { carril: "linea", destino: "En línea" };
	}
	if (fila.tipo === "devolucion_proveedor") return { carril: "proveedor", destino: "El proveedor" };
	if (fila.destino_externo === "cliente_externo") {
		return { carril: "externos", destino: fila.cliente ?? "Clientes externos" };
	}
	if (fila.destino_codigo !== null) return { carril: fila.destino_codigo, destino: fila.destino_nombre ?? "" };
	return { carril: "calidad", destino: "Calidad o Bodega" };
}

/**
 * Lo que es lo que viene en camino, en una línea.
 * @param fila Lo que se leyó.
 */
export function queViene(fila: FilaEnCamino): string {
	if (fila.tipo === "pedido_linea") return `Pedido en línea ${fila.pedidos_linea ?? ""}`;
	if (fila.tipo === "surtido_pedido_externo") return `Pedido ${fila.pedido ?? ""} · ${fila.cliente ?? ""}`;
	if (fila.tipo === "devolucion_cliente_externo" || fila.tipo === "devolucion_linea") {
		return `Devolución de ${fila.cliente ?? "un cliente"}`;
	}
	const nombres = fila.prendas ?? [...new Set(fila.materiales.map((material) => material.nombre))].join(", ");
	return nombres;
}

/**
 * Cuánto mandaron de lo que viene en camino.
 * @param fila Lo que se leyó.
 */
export function cuantoViene(fila: FilaEnCamino): string {
	if (fila.materiales.length > 0 && fila.piezas === 0) return materialEscrito(fila.materiales);
	return piezasEscritas(fila.piezas);
}

/**
 * Quién manda lo que viene en camino, y responde por ello: Bodega, la tienda o el cliente.
 * @param fila Lo que se leyó.
 */
export function quienLoManda(fila: FilaEnCamino): string {
	return fila.origen_nombre ?? fila.cliente ?? "El cliente";
}

/**
 * Lo que viene en camino o se espera, como entrada de Recepción: de Bodega, o de las tiendas y de los clientes.
 * @param fila Lo que se leyó.
 */
function entradaEnCamino(fila: FilaEnCamino): PorRecibir {
	const deBodega = fila.origen_tipo === "bodega";
	const deCliente = fila.origen_tipo === null;
	const detalle = deCliente
		? [fila.folio, fila.nota_credito].filter((parte) => parte !== null).join(" · ")
		: `${fila.folio} · ${tipoEscrito(fila.tipo)}`;
	return {
		grupo: deBodega ? "bodega" : "clientes",
		clave: fila.id,
		titulo: queViene(fila),
		detalle,
		cantidad: cuantoViene(fila),
		...destinoEnCamino(fila),
		etiqueta: null,
		marca: { texto: deBodega ? "De bodega" : deCliente ? "Del cliente" : "De la tienda", color: null },
		abre: { a: "camino", id: fila.id },
		atrasada: false,
	};
}

/** Lo que regresa `compras.ordenes_por_recibir`, en lo que usa Aduana (nunca un precio). */
const ordenesPorRecibir = z.object({
	ordenes: z.array(
		z
			.object({
				orden_compra_id: z.uuid(),
				folio: z.string(),
				proveedor: z.string(),
				se_puede_recibir: z.boolean(),
				llegada_esperada: z.string().nullable(),
				atrasada: z.boolean(),
				dias_atraso: z.number().int(),
				lineas: z.array(
					z
						.object({
							orden_compra_linea_id: z.uuid(),
							material: z.string(),
							unidad: z.string(),
							tipo: z.string(),
							se_cuenta_entera: z.boolean(),
							falta: z.string(),
						})
						.passthrough(),
				),
			})
			.passthrough(),
	),
});

/**
 * Las órdenes de compra como las dice Compras, sin precios: todas las que se pueden recibir, o las que se pidan.
 * @param contexto El contexto de la lectura.
 * @param ordenIds Las órdenes, o ninguna para todas las enviadas y recibidas en parte.
 */
export async function ordenesPorRecibirDeCompras(contexto: ContextoDeAccion, ordenIds?: readonly string[]) {
	return ordenesPorRecibir.parse(
		await contexto.lectura("compras.ordenes_por_recibir", ordenIds === undefined ? {} : { orden_compra_ids: ordenIds }),
	).ordenes;
}

/**
 * Lo que espera entrar de los proveedores: las órdenes enviadas o recibidas en parte con algo por recibir, de la que
 * llega antes a la que llega después (una atrasada, como si llegara en `compras.dias_espera_orden_atrasada` días).
 * @param contexto El contexto de la lectura.
 * @param todas Si van también las que no entran en `inventario.dias_ventana_ordenes`.
 * @returns Las de la lista y cuántas quedaron fuera.
 */
async function deProveedores(contexto: ContextoDeAccion, todas: boolean) {
	const ordenes = await ordenesPorRecibirDeCompras(contexto);
	const ventana = await parametroNumero(contexto, "inventario.dias_ventana_ordenes");
	const hoy = contexto.diaDeNegocio;
	const porRecibir = ordenes
		.filter((orden) => orden.se_puede_recibir && orden.lineas.some((linea) => Number(linea.falta) > 0))
		.map((orden) => ({ orden, dias: orden.llegada_esperada === null ? 0 : diasHasta(hoy, orden.llegada_esperada) }))
		.sort((una, otra) => una.dias - otra.dias || una.orden.folio.localeCompare(otra.orden.folio));
	const enVentana = porRecibir.filter(({ dias }) => dias <= ventana);
	const lista = todas ? porRecibir : enVentana;
	const entradas = lista.map(({ orden, dias }): PorRecibir => {
		const faltan = orden.lineas.filter((linea) => Number(linea.falta) > 0);
		const [unica] = faltan;
		const cantidad =
			faltan.length > 1 || unica === undefined
				? plural(faltan.length, "material", "materiales")
				: `${metrosEscritos(unica.falta)} ${unica.unidad}`;
		const atrasoEscrito = `Atrasada ${plural(orden.dias_atraso, "día", "días")}`;
		const marca = orden.atrasada
			? `Debía llegar el ${textoDeDiaCorto(hoy.subtract({ days: orden.dias_atraso }))}`
			: dias <= 0
				? "hoy"
				: dias === 1
					? "mañana"
					: `en ${plural(dias, "día", "días")}`;
		return {
			grupo: "proveedores",
			clave: orden.orden_compra_id,
			titulo: orden.proveedor,
			detalle: `${orden.folio} · ${faltan.map((linea) => linea.material).join(", ")}`,
			cantidad,
			carril: "BOD",
			destino: "Bodega",
			etiqueta: orden.atrasada ? { texto: atrasoEscrito, color: "rojo" } : null,
			marca: { texto: marca, color: orden.atrasada ? "rojo" : null },
			abre: { a: "material", id: orden.orden_compra_id },
			atrasada: orden.atrasada,
		};
	});
	return { entradas, fuera: porRecibir.length - enVentana.length };
}

/**
 * Todo lo que espera entrar a aduana, por grupo de Recepción: del taller, de bodega, de los proveedores y de las
 * tiendas y los clientes.
 * @param contexto El contexto de la lectura.
 * @param todasLasOrdenes Si van también las órdenes fuera de la ventana de días.
 */
export async function leerPorRecibir(contexto: ContextoDeAccion, todasLasOrdenes = false) {
	const taller = await delTaller(contexto);
	const enCamino = (await leerEnCamino(contexto)).map(entradaEnCamino);
	const proveedores = await deProveedores(contexto, todasLasOrdenes);
	return {
		entradas: [...taller, ...enCamino, ...proveedores.entradas],
		ordenesFuera: proveedores.fuera,
	};
}

/**
 * Los parámetros de la antigüedad y de lo que no se confirma.
 * @param contexto El contexto de la lectura.
 */
export async function parametrosDeAduana(contexto: ContextoDeAccion) {
	return {
		horasParado: await parametroNumero(contexto, "inventario.horas_aduana_parado"),
		diasSinConfirmarRojo: await parametroNumero(contexto, "inventario.dias_sin_confirmar_rojo"),
	};
}
