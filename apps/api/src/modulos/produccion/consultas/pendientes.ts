/**
 * `produccion.pendientes` y la pastilla de Producción: las cuatro cifras de arriba (Lotes, Corte, Órdenes de producción
 * y Producción) y la cola de trabajo, cada renglón ya escrito con su estado y lo que su botón necesita: los cambios de
 * pedido por aplicar (con lo que van a restar y a mandar a Bodega), los lotes atorados, atrasados o en riesgo, los
 * cortes de `inventario.dias_entrega_corte` días o menos (y los atrasados), las sugerencias de Bodega por decidir y las
 * excepciones del taller por resolver. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes» y «Quién entra»: la pastilla)
 */

import { diasHasta, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { renglonDePendientesDeProduccion } from "@uniformame/compartido/contratos/produccion/pendientes";
import { pendientesDeProduccion } from "@uniformame/compartido/contratos/produccion/pendientes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { ordenDeTallas } from "../../catalogo/dominio/tallas.ts";
import { escribirParaQuien } from "../dominio/para-quien.ts";
import { type LoteDelPedido, repartirPiezasDeMas } from "../dominio/reparto-de-cambio.ts";
import {
	datosDelEstado,
	estadoDelLote,
	type LoteLeido,
	leerLotes,
	loHechoPorOperacion,
	operacionAtorada,
	saludDeLosLotes,
	tiraDelLote,
	ultimaSincronizacion,
} from "./comun.ts";

/** Un renglón de Pendientes. */
type Renglon = z.infer<typeof renglonDePendientesDeProduccion>;

/** Cuántos días de trabajo lleva la gráfica de «Producción». */
const diasDeLaGrafica = 12;

/** Cómo se dice cada excepción del taller. */
const excepcionesDelTaller: Readonly<Record<string, string>> = {
	pasa_tope_bulto: "Pasa del tope del bulto",
	lote_no_en_proceso: "Registro de un lote ya revisado",
};

/**
 * Los renglones de los lotes en proceso atorados, atrasados o en riesgo.
 * @param contexto El contexto de la consulta.
 * @param lotes Los lotes en proceso.
 * @param salud La salud de hoy.
 */
async function renglonesDeLotes(
	contexto: ContextoDeConsulta,
	lotes: readonly LoteLeido[],
	salud: Awaited<ReturnType<typeof saludDeLosLotes>>,
): Promise<Renglon[]> {
	const hoy = contexto.diaDeNegocio;
	const sincronizacion = await ultimaSincronizacion(contexto);
	const hecho = await loHechoPorOperacion(contexto, sql`l.estado = 'en_proceso'`);
	return lotes.flatMap((lote): Renglon[] => {
		const estado = estadoDelLote(datosDelEstado(lote, salud, sincronizacion), hoy);
		if (estado.color !== "rojo" && estado.color !== "ambar") return [];
		const suSalud = salud.salud.get(lote.id);
		const atorado = salud.atorados.get(lote.id);
		const cuello = tiraDelLote(
			hecho.filter((operacion) => operacion.loteId === lote.id),
			lote.cortadas,
			null,
		).find((casilla) => casilla.marca === "se_junta");
		// La causa: la máquina parada, desde cuándo no avanza, o dónde se junta el trabajo.
		const causa =
			atorado?.maquina != null
				? `${atorado.maquina.toLocaleLowerCase("es-MX")} está parada`
				: operacionAtorada(suSalud) !== null
					? `sin avance desde el ${lote.avance === null ? "" : textoDeDiaCorto(lote.avance)}`
					: cuello === undefined
						? ""
						: `se junta en ${cuello.operacion.toLocaleLowerCase("es-MX")}`;
		const para = escribirParaQuien(lote);
		return [
			{
				tipo: "lote",
				clave: `lote-${lote.id}`,
				titulo: `${lote.folio} · ${lote.prenda}`,
				detalle: causa === "" ? para.nombre : `${para.nombre} · ${causa}`,
				fecha: `Entrega ${textoDeDiaCorto(lote.fecha_entrega)}`,
				fecha_orden: lote.fecha_entrega,
				fecha_roja: estado.color === "rojo",
				cifra: `${lote.listas} de ${lote.cortadas}`,
				estado: estado.texto,
				color: estado.color,
				lote_id: lote.id,
				atorado: suSalud?.atorado === true,
			},
		];
	});
}

/**
 * Los renglones de los cortes de `inventario.dias_entrega_corte` días o menos, y los atrasados.
 * @param contexto El contexto de la consulta.
 * @param lotes Los lotes por cortar.
 */
async function renglonesDeCorte(contexto: ContextoDeConsulta, lotes: readonly LoteLeido[]): Promise<Renglon[]> {
	const hoy = contexto.diaDeNegocio;
	const dias = await parametroNumero(contexto, "inventario.dias_entrega_corte");
	const { rows } = await contexto.base.execute(sql`
		SELECT DISTINCT a.lote_id FROM apartados_rollo a WHERE a.estado IN ('entregado', 'usado')`);
	const conTela = new Set(
		z
			.array(z.object({ lote_id: z.uuid() }))
			.parse(rows)
			.map((uno) => uno.lote_id),
	);
	return lotes
		.filter((lote) => diasHasta(hoy, lote.fecha_corte) <= dias)
		.map((lote): Renglon => {
			const faltan = diasHasta(hoy, lote.fecha_corte);
			const conReceta = lote.receta !== "sin_receta";
			const estado = !conReceta
				? { estado: "Falta la receta", color: "rojo" as const }
				: faltan <= 0
					? { estado: "Corte hoy", color: "rojo" as const }
					: faltan === 1
						? { estado: "Corte mañana", color: "ambar" as const }
						: { estado: `Corte en ${faltan} días`, color: "azul" as const };
			const tela = !conReceta
				? "sin receta no se puede cortar"
				: conTela.has(lote.id)
					? "tela entregada"
					: "tela por entregar";
			return {
				tipo: "corte",
				clave: `corte-${lote.id}`,
				titulo: `${lote.folio} · ${lote.prenda}`,
				detalle: `${escribirParaQuien(lote).nombre} · ${tela}`,
				fecha: `Corte ${textoDeDiaCorto(lote.fecha_corte)}`,
				fecha_orden: lote.fecha_corte,
				fecha_roja: false,
				cifra: `${lote.planeadas} pz`,
				...estado,
				lote_id: lote.id,
				producto_id: lote.producto_id,
				con_receta: conReceta,
			};
		});
}

/** Lo que regresa `ventas.avance_pedido`, lo de más por variante. */
const deAvance = z.object({ tallas: z.array(z.object({ variante_id: z.uuid(), de_mas: z.number() })) });

/**
 * Los renglones de los cambios de pedido por aplicar: uno por pedido, el más nuevo, con lo que va a pasar.
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeCambios(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT DISTINCT ON (c.pedido_id) c.id, c.version, c.pedido_id, pe.folio, ter.nombre AS cliente, v.numero,
			(c.creado_en AT TIME ZONE 'America/Mexico_City')::date::text AS fecha
		FROM cambios_pedido c JOIN pedidos pe ON pe.id = c.pedido_id JOIN pedido_versiones v ON v.id = c.pedido_version_id
		JOIN clientes cli ON cli.id = pe.cliente_id JOIN terceros ter ON ter.id = cli.tercero_id
		WHERE c.estado = 'por_aplicar' ORDER BY c.pedido_id, v.numero DESC`);
	const cambios = z
		.array(
			z.object({
				id: z.uuid(),
				version: z.coerce.number(),
				pedido_id: z.uuid(),
				folio: z.string(),
				cliente: z.string(),
				numero: z.number(),
				fecha: z.string(),
			}),
		)
		.parse(rows);
	const renglones: Renglon[] = [];
	for (const cambio of cambios) {
		const deMas = deAvance
			.parse(await contexto.lectura("ventas.avance_pedido", { pedido_id: cambio.pedido_id }))
			.tallas.filter((talla) => talla.de_mas > 0);
		const lotes = await lotesDelPedido(contexto, cambio.pedido_id);
		const reparto = repartirPiezasDeMas(
			deMas.map((talla) => ({ varianteId: talla.variante_id, piezas: talla.de_mas })),
			lotes,
		);
		const nombres = await nombresDeVariantes(
			contexto,
			deMas.map((talla) => talla.variante_id),
		);
		const talla = (varianteId: string) => nombres.get(varianteId)?.talla ?? "";
		const total = deMas.reduce((suma, una) => suma + una.de_mas, 0);
		renglones.push({
			tipo: "cambio",
			clave: `cambio-${cambio.id}`,
			titulo: `${cambio.folio} · ${cambio.cliente}`,
			detalle: `Versión ${cambio.numero} · ${deMas
				.map(
					(una) =>
						`${nombres.get(una.variante_id)?.prenda ?? ""}, talla ${talla(una.variante_id)}: ${una.de_mas} de más`,
				)
				.join(" · ")}`,
			fecha: textoDeDiaCorto(cambio.fecha),
			fecha_orden: cambio.fecha,
			fecha_roja: false,
			cifra: `−${total} pz`,
			estado: "Por aplicar",
			color: "ambar",
			cambio_pedido_id: cambio.id,
			version: cambio.version,
			efectos: [
				...reparto.lineas.map((linea) =>
					linea.restadas > 0
						? `${linea.loteFolio} talla ${talla(linea.varianteId)}: −${linea.restadas}`
						: `${linea.loteFolio} talla ${talla(linea.varianteId)}: ${linea.aBodega} a Bodega`,
				),
				...reparto.cancelados.map((folio) => `${folio} se quita de su orden`),
			],
		});
	}
	return renglones;
}

/**
 * Los lotes de un pedido que siguen en producción, con sus tallas, como los reparte el cambio.
 * @param contexto El contexto de la consulta.
 * @param pedidoId El pedido.
 */
async function lotesDelPedido(contexto: ContextoDeConsulta, pedidoId: string): Promise<LoteDelPedido[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.folio, l.estado, l.fecha_corte::text AS fecha_corte, l.cortado_en::text AS cortado_en,
			json_agg(json_build_object('varianteId', t.variante_id, 'planeadas', t.piezas_planeadas,
				'cortadas', coalesce(t.piezas_cortadas, 0), 'merma', t.piezas_merma, 'aBodega', t.piezas_a_bodega)) AS tallas
		FROM lotes l JOIN lote_tallas t ON t.lote_id = l.id
		WHERE l.pedido_id = ${pedidoId} AND l.estado IN ('por_cortar', 'en_proceso', 'terminado', 'revisado')
		GROUP BY l.id`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				folio: z.string(),
				estado: z.string(),
				fecha_corte: z.string(),
				cortado_en: z.string().nullable(),
				tallas: z.array(
					z.object({
						varianteId: z.uuid(),
						planeadas: z.number(),
						cortadas: z.number(),
						merma: z.number(),
						aBodega: z.number(),
					}),
				),
			}),
		)
		.parse(rows)
		.map((lote) => ({
			id: lote.id,
			folio: lote.folio,
			estado: lote.estado,
			fechaCorte: lote.fecha_corte,
			cortadoEn: lote.cortado_en,
			tallas: lote.tallas,
		}));
}

/**
 * La prenda y la talla de unas variantes.
 * @param contexto El contexto de la consulta.
 * @param ids Las variantes.
 */
async function nombresDeVariantes(contexto: ContextoDeConsulta, ids: readonly string[]) {
	if (ids.length === 0) return new Map<string, { prenda: string; talla: string }>();
	const { rows } = await contexto.base.execute(sql`
		SELECT v.id, p.nombre AS prenda, t.nombre AS talla FROM variantes v JOIN productos p ON p.id = v.producto_id
		JOIN tallas t ON t.id = v.talla_id WHERE v.id IN (${sql.join(
			ids.map((id) => sql`${id}::uuid`),
			sql`, `,
		)})`);
	return new Map(
		z
			.array(z.object({ id: z.uuid(), prenda: z.string(), talla: z.string() }))
			.parse(rows)
			.map((fila) => [fila.id, { prenda: fila.prenda, talla: fila.talla }]),
	);
}

/**
 * Los renglones de las sugerencias de Bodega por decidir: uno por prenda y ubicación.
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeSugerencias(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT array_agg(s.id ORDER BY ${ordenDeTallas("t")}) AS sugerencia_ids, p.nombre AS prenda, u.nombre AS ubicacion,
			string_agg(t.nombre || ': ' || s.piezas, ' · ' ORDER BY ${ordenDeTallas("t")}) AS tallas, sum(s.piezas)::int AS piezas
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
		.map((sugerencia) => ({
			tipo: "sugerencia",
			clave: `sugerencia-${sugerencia.sugerencia_ids[0] ?? ""}`,
			titulo: sugerencia.prenda,
			detalle: `Para ${sugerencia.ubicacion} · ${sugerencia.tallas}`,
			fecha: null,
			fecha_orden: null,
			fecha_roja: false,
			cifra: `${sugerencia.piezas} pz`,
			estado: "Por decidir",
			color: "ambar",
			sugerencia_ids: sugerencia.sugerencia_ids,
		}));
}

/**
 * Los renglones de las excepciones del taller por resolver.
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeExcepciones(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT e.id, e.version, e.tipo, (e.detectada_en AT TIME ZONE 'America/Mexico_City')::date::text AS fecha,
			b.folio AS bulto, p.nombre AS persona
		FROM excepciones e
		LEFT JOIN registros_operacion r ON r.id = (e.datos ->> 'registro_id')::uuid
		LEFT JOIN bultos b ON b.id = r.bulto_id LEFT JOIN personas p ON p.id = coalesce(r.persona_id, e.persona_id)
		WHERE e.estado = 'por_revisar' AND e.tipo IN ('pasa_tope_bulto', 'lote_no_en_proceso')
		ORDER BY e.detectada_en`);
	return z
		.array(
			z.object({
				id: z.uuid(),
				version: z.coerce.number(),
				tipo: z.string(),
				fecha: z.string(),
				bulto: z.string().nullable(),
				persona: z.string().nullable(),
			}),
		)
		.parse(rows)
		.map((excepcion) => ({
			tipo: "excepcion",
			clave: `excepcion-${excepcion.id}`,
			titulo: excepcionesDelTaller[excepcion.tipo] ?? excepcion.tipo,
			detalle: [excepcion.bulto, excepcion.persona].filter((parte) => parte !== null).join(" · "),
			fecha: textoDeDiaCorto(excepcion.fecha),
			fecha_orden: excepcion.fecha,
			fecha_roja: false,
			cifra: null,
			estado: "Por resolver",
			color: "rojo",
			excepcion_id: excepcion.id,
			version: excepcion.version,
		}));
}

/**
 * Las cuatro cifras de arriba.
 * @param contexto El contexto de la consulta.
 * @param lotes Los lotes en proceso y por cortar.
 * @param renglones Los renglones de los lotes (sus colores dicen atorados y en riesgo).
 */
async function indicadores(contexto: ContextoDeConsulta, lotes: readonly LoteLeido[], renglones: readonly Renglon[]) {
	const hoy = contexto.diaDeNegocio;
	const enProceso = lotes.filter((lote) => lote.estado === "en_proceso");
	const porCortar = lotes.filter((lote) => lote.estado === "por_cortar");
	const deLotes = renglones.filter((renglon) => renglon.tipo === "lote");
	const atorados = deLotes.filter((renglon) => renglon.color === "rojo").length;
	const enRiesgo = deLotes.filter((renglon) => renglon.color === "ambar").length;
	const proximos = await parametroNumero(contexto, "produccion.cortes_proximos_dias");
	const { rows: ordenes } = await contexto.base.execute(sql`
		SELECT o.motivo, count(*)::int AS cuantas FROM ordenes_produccion o
		WHERE o.estado = 'abierta' AND EXISTS (SELECT 1 FROM lotes l WHERE l.orden_produccion_id = o.id
			AND l.estado NOT IN ('en_aduana', 'cancelado'))
		GROUP BY o.motivo`);
	const porMotivo = z.array(z.object({ motivo: z.string(), cuantas: z.number() })).parse(ordenes);
	const deMotivo = (motivo: string) => porMotivo.find((uno) => uno.motivo === motivo)?.cuantas ?? 0;
	// Las terminadas por día, con la misma lectura que usa Dirección.
	const { dias: terminadas } = z
		.object({ dias: z.array(z.object({ fecha: z.string(), piezas: z.number() })) })
		.parse(await contexto.lectura("produccion.terminadas_por_dia", { dias: diasDeLaGrafica }));
	return {
		lotes: {
			en_proceso: enProceso.length,
			por_cortar: porCortar.length,
			atorados,
			en_riesgo: enRiesgo,
			en_tiempo: enProceso.length - atorados - enRiesgo,
		},
		corte: {
			proximos: porCortar.filter((lote) => diasHasta(hoy, lote.fecha_corte) <= proximos).length,
			dias: proximos,
			sin_receta: porCortar.filter((lote) => lote.receta === "sin_receta").length,
		},
		ordenes: {
			en_taller: porMotivo.reduce((suma, uno) => suma + uno.cuantas, 0),
			de_clientes: deMotivo("cliente_externo"),
			de_reabasto: deMotivo("reabasto"),
		},
		produccion: {
			terminadas_hoy: terminadas.find((dia) => dia.fecha === hoy.toString())?.piezas ?? 0,
			por_dia: terminadas.map((dia) => dia.piezas),
		},
	};
}

/**
 * Todos los renglones de Pendientes, con los lotes que leyó.
 * @param contexto El contexto de la consulta.
 */
async function armarPendientes(contexto: ContextoDeConsulta) {
	const lotes = await leerLotes(contexto, sql`l.estado IN ('en_proceso', 'por_cortar')`);
	const salud = await saludDeLosLotes(contexto);
	const renglones = [
		...(await renglonesDeCambios(contexto)),
		...(await renglonesDeLotes(
			contexto,
			lotes.filter((lote) => lote.estado === "en_proceso"),
			salud,
		)),
		...(await renglonesDeCorte(
			contexto,
			lotes.filter((lote) => lote.estado === "por_cortar"),
		)),
		...(await renglonesDeSugerencias(contexto)),
		...(await renglonesDeExcepciones(contexto)),
	];
	return { lotes, renglones };
}

/** El grupo (filtro) de cada tipo de renglón. */
const grupoDe: Readonly<Record<Renglon["tipo"], "cambios" | "lotes" | "corte" | "sugerencias" | "excepciones">> = {
	cambio: "cambios",
	lote: "lotes",
	corte: "corte",
	sugerencia: "sugerencias",
	excepcion: "excepciones",
};

export const consultaPendientes = implementarConsulta(pendientesDeProduccion, async (contexto, parametros) => {
	const { lotes, renglones } = await armarPendientes(contexto);
	const grupo = parametros.grupo ?? "todos";
	const cuantos = (cual: string) => renglones.filter((renglon) => grupoDe[renglon.tipo] === cual).length;
	return {
		resultado: {
			indicadores: await indicadores(contexto, lotes, renglones),
			conteos: {
				todos: renglones.length,
				cambios: cuantos("cambios"),
				lotes: cuantos("lotes"),
				corte: cuantos("corte"),
				sugerencias: cuantos("sugerencias"),
				excepciones: cuantos("excepciones"),
			},
			hay_rojo: renglones.some((renglon) => renglon.color === "rojo"),
			renglones: grupo === "todos" ? renglones : renglones.filter((renglon) => grupoDe[renglon.tipo] === grupo),
		},
	};
});

/**
 * La pastilla de Producción en el menú: los renglones de Pendientes en rojo o ámbar; roja si hay un lote atorado o
 * atrasado.
 * @param contexto El contexto de quien pregunta.
 */
export async function pastillaProduccion(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const { renglones } = await armarPendientes(contexto);
	return {
		conteo: renglones.filter((renglon) => renglon.color === "rojo" || renglon.color === "ambar").length,
		rojo: renglones.some((renglon) => renglon.tipo === "lote" && renglon.color === "rojo"),
	};
}
