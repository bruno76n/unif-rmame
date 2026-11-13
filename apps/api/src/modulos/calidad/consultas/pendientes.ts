/**
 * `calidad.pendientes` y la pastilla de Calidad: las tres cifras de arriba (Por revisar, Defectos y Reclamos) y la
 * cola de trabajo, cada renglón ya escrito con su estado y lo que su botón necesita: los lotes por revisar («Por revisar
 * hoy» en rojo), los reprocesos en el taller (con «Aprobar» solo si Aduana ya recibió su lote), las devoluciones de
 * clientes que esperan a Calidad y los reclamos por resolver. Sin precios, importes, tarifas ni sueldos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Pendientes» y «Quién entra»: la pastilla)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	pendientesDeCalidad,
	type renglonDePendientesDeCalidad,
} from "@uniformame/compartido/contratos/calidad/pendientes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { escribirParaQuien } from "../../produccion/dominio/para-quien.ts";
import {
	defectosDelPeriodo,
	devolucionesPorRevisar,
	type LoteParaRevisar,
	leerReprocesos,
	lotesParaRevisar,
	type Reproceso,
} from "./comun.ts";

/** Un renglón de Pendientes. */
type Renglon = z.infer<typeof renglonDePendientesDeCalidad>;

/**
 * El renglón de un lote por revisar: «Por revisar hoy» (rojo) o «Por revisar» (ámbar).
 * @param lote El lote.
 */
function renglonDeLote(lote: LoteParaRevisar): Renglon {
	return {
		tipo: "lote",
		clave: `lote-${lote.id}`,
		titulo: `${lote.folio} · ${lote.prenda}`,
		detalle: escribirParaQuien(lote).nombre,
		fecha: `Entrega ${textoDeDiaCorto(lote.fecha_entrega)}`,
		fecha_orden: lote.fecha_entrega,
		fecha_roja: lote.urgente,
		cifra: `${lote.listas} pz`,
		estado: lote.urgente ? "Por revisar hoy" : "Por revisar",
		color: lote.urgente ? "rojo" : "ambar",
		lote_id: lote.id,
		urgente: lote.urgente,
	};
}

/**
 * El renglón de un reproceso en el taller: «{operación} · {persona}» y, si es de un pedido, «· {PE}, {cliente}».
 * @param reproceso El reproceso.
 */
function renglonDeReproceso(reproceso: Reproceso): Renglon {
	const delPedido = reproceso.pedido_folio === null ? "" : ` · ${reproceso.pedido_folio}, ${reproceso.cliente ?? ""}`;
	return {
		tipo: "reproceso",
		clave: `reproceso-${reproceso.id}`,
		titulo: `${reproceso.folio} · ${reproceso.prenda}`,
		detalle: `${reproceso.operacion} · ${reproceso.persona}${delPedido}`,
		fecha: null,
		fecha_orden: null,
		fecha_roja: false,
		cifra: `${reproceso.piezas} pz`,
		estado: "En reproceso",
		color: "azul",
		reproceso_id: reproceso.id,
		version: reproceso.version,
		puede_aprobar: reproceso.lote_en_aduana,
	};
}

/**
 * Los renglones de las devoluciones que esperan a Calidad: lo que trae cada una («{n} {prenda} talla {t}: {defecto}»).
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeDevoluciones(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	return (await devolucionesPorRevisar(contexto)).map((devolucion) => {
		const piezas = devolucion.renglones.reduce((suma, renglon) => suma + renglon.por_decidir, 0);
		return {
			tipo: "devolucion",
			clave: `devolucion-${devolucion.id}`,
			titulo: `${devolucion.folio} · ${devolucion.cliente}`,
			detalle: devolucion.renglones
				.map(
					(renglon) =>
						`${renglon.por_decidir} ${renglon.prenda} talla ${renglon.talla}${renglon.defecto === null ? "" : `: ${renglon.defecto}`}`,
				)
				.join(" · "),
			fecha: devolucion.llego === null ? null : `Llegó ${textoDeDiaCorto(devolucion.llego)}`,
			fecha_orden: devolucion.llego,
			fecha_roja: false,
			cifra: `${piezas} pz`,
			estado: "Por revisar",
			color: "ambar",
			traspaso_id: devolucion.id,
		};
	});
}

/** Un reclamo por resolver, como sale de la base. */
const deReclamo = z.object({
	id: z.uuid(),
	folio: z.string(),
	fecha: z.string(),
	cliente: z.string(),
	que_dice: z.string(),
	lote: z.string(),
	operacion: z.string(),
	piezas: z.number(),
});

/**
 * Los renglones de los reclamos por resolver: lo que reclamó y «{L}, {operación}».
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeReclamos(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT rc.id, rc.folio, rc.fecha::text AS fecha, coalesce(ter.nombre, u.nombre, '') AS cliente,
			rc.que_dice_cliente AS que_dice, l.folio AS lote, o.nombre AS operacion, rc.piezas
		FROM reclamos rc JOIN lotes l ON l.id = rc.lote_id
		JOIN flujo_operaciones f ON f.id = rc.flujo_operacion_id JOIN operaciones o ON o.id = f.operacion_id
		LEFT JOIN clientes cli ON cli.id = rc.cliente_id LEFT JOIN terceros ter ON ter.id = cli.tercero_id
		LEFT JOIN ubicaciones u ON u.id = rc.ubicacion_id
		WHERE rc.estado = 'por_resolver' ORDER BY rc.fecha, rc.folio`);
	return z
		.array(deReclamo)
		.parse(rows)
		.map((reclamo) => ({
			tipo: "reclamo",
			clave: `reclamo-${reclamo.id}`,
			titulo: `${reclamo.folio} · ${reclamo.cliente}`,
			detalle: `${reclamo.que_dice} · ${reclamo.lote}, ${reclamo.operacion}`,
			fecha: textoDeDiaCorto(reclamo.fecha),
			fecha_orden: reclamo.fecha,
			fecha_roja: false,
			cifra: `${reclamo.piezas} pz`,
			estado: "Por resolver",
			color: "rojo",
			reclamo_id: reclamo.id,
		}));
}

/**
 * Todos los renglones de Pendientes, con los lotes y los reprocesos que leyó.
 * @param contexto El contexto de la consulta.
 */
async function armarPendientes(contexto: ContextoDeConsulta) {
	const lotes = await lotesParaRevisar(contexto);
	const reprocesos = await leerReprocesos(contexto, sql`rp.estado = 'en_reproceso'`);
	const renglones = [
		...lotes.map(renglonDeLote),
		...reprocesos.map(renglonDeReproceso),
		...(await renglonesDeDevoluciones(contexto)),
		...(await renglonesDeReclamos(contexto)),
	];
	return { lotes, reprocesos, renglones };
}

/**
 * Las tres cifras de arriba.
 * @param contexto El contexto de la consulta.
 * @param lotes Los lotes por revisar.
 * @param reprocesos Los reprocesos en el taller.
 */
async function indicadores(
	contexto: ContextoDeConsulta,
	lotes: readonly LoteParaRevisar[],
	reprocesos: readonly Reproceso[],
) {
	const periodo = await defectosDelPeriodo(contexto);
	const { rows } = await contexto.base.execute(sql`
		SELECT count(*) FILTER (WHERE estado = 'por_resolver')::int AS por_resolver,
			count(*) FILTER (WHERE extract(year FROM fecha) = ${contexto.diaDeNegocio.year})::int AS en_el_anio
		FROM reclamos`);
	return {
		por_revisar: {
			lotes: lotes.length,
			piezas: lotes.reduce((suma, lote) => suma + lote.listas, 0),
			en_reproceso: reprocesos.reduce((suma, reproceso) => suma + reproceso.piezas, 0),
		},
		defectos: { dias: periodo.dias, porcentaje: periodo.porcentaje, comunes: periodo.delPeriodo.slice(0, 3) },
		reclamos: z.object({ por_resolver: z.number(), en_el_anio: z.number() }).parse(rows[0]),
	};
}

/** El grupo (filtro) de cada tipo de renglón: los reprocesos van con los lotes. */
const grupoDe: Readonly<Record<Renglon["tipo"], "lotes" | "devoluciones" | "reclamos">> = {
	lote: "lotes",
	reproceso: "lotes",
	devolucion: "devoluciones",
	reclamo: "reclamos",
};

export const consultaPendientes = implementarConsulta(pendientesDeCalidad, async (contexto, parametros) => {
	const { lotes, reprocesos, renglones } = await armarPendientes(contexto);
	const grupo = parametros.grupo ?? "todos";
	const cuantos = (cual: string) => renglones.filter((renglon) => grupoDe[renglon.tipo] === cual).length;
	return {
		resultado: {
			indicadores: await indicadores(contexto, lotes, reprocesos),
			conteos: {
				todos: renglones.length,
				lotes: cuantos("lotes"),
				devoluciones: cuantos("devoluciones"),
				reclamos: cuantos("reclamos"),
			},
			hay_rojo: renglones.some((renglon) => renglon.color === "rojo"),
			renglones: grupo === "todos" ? renglones : renglones.filter((renglon) => grupoDe[renglon.tipo] === grupo),
		},
	};
});

/**
 * La pastilla de Calidad en el menú: los lotes por revisar, las devoluciones por revisar y los reprocesos que ya se
 * pueden aprobar; roja si hay un lote «Por revisar hoy».
 * @param contexto El contexto de quien pregunta.
 */
export async function pastillaCalidad(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const lotes = await lotesParaRevisar(contexto);
	const aprobables = await leerReprocesos(contexto, sql`rp.estado = 'en_reproceso' AND l.estado = 'en_aduana'`);
	const devoluciones = await devolucionesPorRevisar(contexto);
	return {
		conteo: lotes.length + aprobables.length + devoluciones.length,
		rojo: lotes.some((lote) => lote.urgente),
	};
}
