/**
 * `produccion.ordenes`: la pestaña Órdenes de producción. Arriba, las sugerencias de Bodega por decidir (una por prenda
 * y ubicación); abajo, una tarjeta por pedido (junta sus órdenes) y una por cada orden de reabasto o de temporada, con
 * su estado, su plazo y un renglón por prenda con su hilo chico. Primero las que siguen en el taller, por entrega; las
 * que ya salieron (todos sus lotes en aduana), por páginas. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Órdenes de producción»)
 *
 * El hilo de un pedido es el de `produccion.hilo_pedido`; el de un lote de reabasto o de temporada, `hiloDelLote`.
 */

import { diasHasta, textoDeDiaCorto, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import { ordenesDeProduccion } from "@uniformame/compartido/contratos/produccion/ordenes-de-produccion";
import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	escribirParaQuien,
	hiloDelLote,
	type LoteLeido,
	leerLotes,
	parametroNumero,
	type SaludEscrita,
	saludDeLosLotes,
} from "./comun.ts";
import { consultaHiloPedido } from "./hilo-pedido.ts";

/** Cuántas tarjetas de las que ya salieron del taller van por página. */
const salieronPorPagina = 10;

/** Cómo se dice el motivo de una orden en su tarjeta. */
const motivos: Readonly<Record<string, string>> = {
	cliente_externo: "Pedido de cliente",
	reabasto: "Reabasto",
	temporada: "Temporada",
	pedido_especial: "Pedido especial",
};

/**
 * «{motivo} · {quién la levantó}», o solo el motivo si no se sabe quién.
 * @param motivo El motivo, ya escrito.
 * @param quien Quién la levantó.
 */
function conQuien(motivo: string, quien: string | null): string {
	return quien === null ? motivo : `${motivo} · ${quien}`;
}

/** Una orden, como sale de la base. */
const deOrden = z.object({
	id: z.uuid(),
	folio: z.string(),
	motivo: z.string(),
	pedido_id: z.uuid().nullable(),
	referencia: z.string().nullable(),
	fecha_entrega: z.string(),
	levanto: z.string().nullable(),
});

/** Lo que regresa `ventas.avance_pedido`, lo que se usa para la etapa del pedido. */
const deAvance = z.object({
	tallas: z.array(z.object({ pedido: z.number(), entregado: z.number(), listo: z.number(), por_mandar: z.number() })),
});

/** Lo que regresa `produccion.hilo_pedido`. */
const deHilo = z.object({
	prendas: z.array(
		z.object({
			prenda: z.string(),
			paradas: z.array(
				z.object({
					parada: z.enum(["pedido", "corte", "costura", "calidad", "aduana", "entrega"]),
					piezas: z.number(),
					linea: z.string(),
					tono: z.enum(["normal", "ambar", "rojo"]),
				}),
			),
			lotes: z.array(z.object({ lote_id: z.uuid(), folio: z.string(), estado: z.string() })),
		}),
	),
});

/** Una tarjeta ya armada, con lo que la ordena. */
interface TarjetaArmada {
	enTaller: boolean;
	entrega: string;
	tarjeta: Record<string, unknown> & { clave: string; tipo: "pedido" | "reabasto" | "temporada" };
}

/**
 * El estado de una tarjeta de reabasto o de temporada: la peor salud de sus lotes.
 * @param lotes Sus lotes.
 * @param salud La salud de hoy.
 */
function estadoDeLaOrden(lotes: readonly LoteLeido[], salud: Map<string, SaludEscrita>) {
	const saludes = lotes.flatMap((lote) => {
		const suya = salud.get(lote.id);
		return suya === undefined ? [] : [suya];
	});
	const atorado = saludes.find((una) => una.atorado);
	if (atorado !== undefined) return { texto: atorado.salud, color: "rojo" as const, abajo: null };
	if (saludes.some((una) => una.salud === "Atrasado"))
		return { texto: "Atrasado", color: "rojo" as const, abajo: null };
	if (saludes.some((una) => una.tono === "ambar")) {
		return { texto: "En riesgo de atraso", color: "ambar" as const, abajo: null };
	}
	if (lotes.every((lote) => lote.estado === "por_cortar"))
		return { texto: "Por cortar", color: "gris" as const, abajo: null };
	if (lotes.every((lote) => lote.estado === "en_aduana"))
		return { texto: "En aduana", color: "verde" as const, abajo: null };
	return { texto: "En tiempo", color: "azul" as const, abajo: null };
}

/**
 * La etapa de un pedido y su alerta, con su avance: Entregado, Entrega parcial, Listo en aduana o En producción; y
 * abajo «Atrasado {n} días», «En riesgo de atraso», «Cambio por aplicar» o «{n} piezas por mandar».
 * @param contexto El contexto de la consulta.
 * @param pedido El pedido, su entrega y si tiene un cambio por aplicar.
 * @param diasEnRiesgo `ventas.dias_en_riesgo`.
 */
async function estadoDelPedido(
	contexto: ContextoDeConsulta,
	pedido: { id: string; fechaEntrega: string; cambioPorAplicar: boolean },
	diasEnRiesgo: number,
) {
	const avance = deAvance.parse(await contexto.lectura("ventas.avance_pedido", { pedido_id: pedido.id })).tallas;
	const suma = (campo: "pedido" | "entregado" | "listo" | "por_mandar") =>
		avance.reduce((total, talla) => total + talla[campo], 0);
	const falta = suma("pedido") - suma("entregado");
	const etapa =
		falta <= 0
			? { texto: "Entregado", color: "verde" as const }
			: suma("entregado") > 0
				? { texto: "Entrega parcial", color: "verde-azulado" as const }
				: suma("listo") >= falta
					? { texto: "Listo en aduana", color: "morado" as const }
					: { texto: "En producción", color: "ambar" as const };
	const dias = diasHasta(contexto.diaDeNegocio, pedido.fechaEntrega);
	const abajo =
		falta > 0 && dias < 0
			? `Atrasado ${-dias} ${dias === -1 ? "día" : "días"}`
			: falta > 0 && dias <= diasEnRiesgo
				? "En riesgo de atraso"
				: pedido.cambioPorAplicar
					? "Cambio por aplicar"
					: suma("por_mandar") > 0
						? `${suma("por_mandar")} piezas por mandar`
						: null;
	return { ...etapa, abajo };
}

/**
 * «hace {n} días» (rojo) o «en {n} días» (ámbar a los días de riesgo o menos).
 * @param hoy El día de negocio.
 * @param entrega La fecha de entrega.
 * @param riesgo Los días de riesgo que tocan.
 */
function plazo(hoy: Temporal.PlainDate, entrega: string, riesgo: number) {
	const dias = diasHasta(hoy, entrega);
	return {
		texto: textoEnDias(dias),
		tono: dias < 0 ? ("rojo" as const) : dias <= riesgo ? ("ambar" as const) : ("normal" as const),
	};
}

/**
 * Las sugerencias de Bodega por decidir, juntas por prenda y ubicación.
 * @param contexto El contexto de la consulta.
 */
async function sugerenciasPorDecidir(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT array_agg(s.id ORDER BY t.orden) AS sugerencia_ids, p.nombre AS prenda, u.nombre AS ubicacion,
			string_agg(t.nombre || ': ' || s.piezas, ' · ' ORDER BY t.orden) AS tallas, sum(s.piezas)::int AS piezas
		FROM sugerencias_reabasto s JOIN variantes v ON v.id = s.variante_id JOIN productos p ON p.id = v.producto_id
		JOIN tallas t ON t.id = v.talla_id JOIN ubicaciones u ON u.id = s.ubicacion_id
		WHERE s.estado = 'por_decidir'
		GROUP BY p.id, p.nombre, u.id, u.nombre ORDER BY p.nombre, u.nombre`);
	return z
		.array(
			z.object({
				sugerencia_ids: z.array(z.uuid()),
				prenda: z.string(),
				ubicacion: z.string(),
				tallas: z.string(),
				piezas: z.number(),
			}),
		)
		.parse(rows)
		.map(({ ubicacion, tallas, ...sugerencia }) => ({ ...sugerencia, detalle: `Para ${ubicacion} · ${tallas}` }));
}

export const consultaOrdenes = implementarConsulta(ordenesDeProduccion, async (contexto, parametros) => {
	const hoy = contexto.diaDeNegocio;
	const { rows } = await contexto.base.execute(sql`
		SELECT o.id, o.folio, o.motivo, o.pedido_id, o.referencia, o.fecha_entrega::text AS fecha_entrega,
			coalesce(u.nombre, p.nombre) AS levanto
		FROM ordenes_produccion o LEFT JOIN usuarios u ON u.id = o.creado_por LEFT JOIN personas p ON p.id = u.persona_id
		WHERE o.estado = 'abierta' ORDER BY o.fecha_entrega, o.folio`);
	const ordenes = z.array(deOrden).parse(rows);
	const lotes = await leerLotes(contexto, sql`l.estado <> 'cancelado'`);
	const { salud } = await saludDeLosLotes(contexto);
	const diasEnRiesgo = await parametroNumero(contexto, "ventas.dias_en_riesgo");
	const riesgoAtraso = await parametroNumero(contexto, "produccion.riesgo_atraso_dias");
	const { rows: conCambio } = await contexto.base.execute(
		sql`SELECT DISTINCT pedido_id FROM cambios_pedido WHERE estado = 'por_aplicar'`,
	);
	const cambios = new Set(
		z
			.array(z.object({ pedido_id: z.uuid() }))
			.parse(conCambio)
			.map((uno) => uno.pedido_id),
	);
	const tarjetas: TarjetaArmada[] = [];
	// Una tarjeta por pedido, que junta sus órdenes.
	const pedidos = [...new Set(ordenes.flatMap((orden) => (orden.pedido_id === null ? [] : [orden.pedido_id])))];
	for (const pedidoId of pedidos) {
		const suyas = ordenes.filter((orden) => orden.pedido_id === pedidoId);
		const suyos = lotes.filter((lote) => suyas.some((orden) => orden.id === lote.orden_id));
		const [primero] = suyos;
		if (primero === undefined) continue;
		const para = escribirParaQuien({ ...primero, destino: "pedido" });
		const hilo = deHilo.parse((await consultaHiloPedido.leer(contexto, { pedido_id: pedidoId })).resultado);
		const enTaller = suyos.some((lote) => lote.estado !== "en_aduana");
		tarjetas.push({
			enTaller,
			entrega: primero.fecha_entrega,
			tarjeta: {
				clave: pedidoId,
				tipo: "pedido",
				pedido_id: pedidoId,
				nombre: para.nombre,
				color: para.color,
				referencia: `${primero.pedido_folio ?? ""} · entrega ${textoDeDiaCorto(primero.fecha_entrega)}`,
				plazo: enTaller ? plazo(hoy, primero.fecha_entrega, diasEnRiesgo) : null,
				folios: suyas.map((orden) => orden.folio),
				levanto: conQuien(motivos.cliente_externo ?? "", suyas[0]?.levanto ?? null),
				estado: await estadoDelPedido(
					contexto,
					{ id: pedidoId, fechaEntrega: primero.fecha_entrega, cambioPorAplicar: cambios.has(pedidoId) },
					diasEnRiesgo,
				),
				renglones: hilo.prendas.map((prenda) => ({
					prenda: prenda.prenda,
					piezas: prenda.paradas[0]?.piezas ?? 0,
					lotes: prenda.lotes.map((lote) => lote.folio),
					lote_id: prenda.lotes.find((lote) => lote.estado !== "en_aduana")?.lote_id ?? null,
					hilo: prenda.paradas,
				})),
			},
		});
	}
	// Una tarjeta por cada orden de reabasto o de temporada.
	for (const orden of ordenes.filter((una) => una.pedido_id === null)) {
		const suyos = lotes.filter((lote) => lote.orden_id === orden.id);
		const [primero] = suyos;
		if (primero === undefined) continue;
		const para = escribirParaQuien(primero);
		const enTaller = suyos.some((lote) => lote.estado !== "en_aduana");
		tarjetas.push({
			enTaller,
			entrega: orden.fecha_entrega,
			tarjeta: {
				clave: orden.id,
				tipo: orden.motivo === "temporada" ? "temporada" : "reabasto",
				pedido_id: null,
				nombre: para.nombre,
				color: null,
				referencia: orden.referencia ?? orden.folio,
				plazo: enTaller ? plazo(hoy, orden.fecha_entrega, riesgoAtraso) : null,
				folios: [orden.folio],
				levanto: conQuien(motivos[orden.motivo] ?? orden.motivo, orden.levanto),
				estado: estadoDeLaOrden(suyos, salud),
				renglones: suyos.map((lote) => ({
					prenda: lote.prenda,
					piezas: lote.planeadas,
					lotes: [lote.folio],
					lote_id: lote.estado === "en_aduana" ? null : lote.id,
					hilo: hiloDelLote(lote, salud.get(lote.id), hoy),
				})),
			},
		});
	}
	const filtro = parametros.filtro ?? "todas";
	const delFiltro = (tarjeta: TarjetaArmada) =>
		filtro === "todas" ||
		(filtro === "clientes" && tarjeta.tarjeta.tipo === "pedido") ||
		tarjeta.tarjeta.tipo === filtro;
	const cuantas = (tipo: string) => tarjetas.filter((una) => una.tarjeta.tipo === tipo).length;
	// Las que ya salieron, de la entrega más reciente a la más vieja, por páginas.
	const desde = leerCursor(parametros.cursor);
	const salieron = tarjetas
		.filter((una) => !una.enTaller && delFiltro(una))
		.sort((una, otra) => otra.entrega.localeCompare(una.entrega) || otra.tarjeta.clave.localeCompare(una.tarjeta.clave))
		.filter(
			(una) =>
				desde === undefined ||
				`${una.entrega}|${una.tarjeta.clave}` < `${String(desde.entrega)}|${String(desde.clave)}`,
		);
	const pagina = paginar(salieron, salieronPorPagina, (una) => ({ entrega: una.entrega, clave: una.tarjeta.clave }));
	return {
		resultado: ordenesDeProduccion.resultado.parse({
			sugerencias: await sugerenciasPorDecidir(contexto),
			conteos: {
				todas: tarjetas.length,
				clientes: cuantas("pedido"),
				reabasto: cuantas("reabasto"),
				temporada: cuantas("temporada"),
			},
			en_taller: tarjetas
				.filter((una) => una.enTaller && delFiltro(una))
				.sort((una, otra) => una.entrega.localeCompare(otra.entrega))
				.map((una) => una.tarjeta),
			salieron: { ...pagina, renglones: pagina.renglones.map((una) => una.tarjeta) },
		}),
	};
});
