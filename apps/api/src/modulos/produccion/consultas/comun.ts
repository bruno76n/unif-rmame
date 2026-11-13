/**
 * Lo que comparten las consultas de las pantallas de Producción: los parámetros, el estado de un lote ya escrito con su color, la tira de operaciones y la salud de los lotes en proceso.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»: la tarjeta, la tira y los estados del lote)
 *
 * La salud de un lote en proceso no se calcula aquí: la dan `produccion.salud_de_lotes` y `produccion.lotes_atorados`
 * (regla 7 de docs/modulos/produccion/lotes.md), y aquí solo se escribe como la dice la pantalla.
 */

import { diasHasta, textoDeDiaCorto, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import type { paradaDeLote } from "@uniformame/compartido/contratos/produccion/hilo";
import type { casillaDeLaTira, estadoEscrito } from "@uniformame/compartido/contratos/produccion/pantallas";
import { type SQL, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { columnasDeParaQuien, deParaQuien, unionesDeParaQuien } from "../dominio/para-quien.ts";

/** La salud de un lote en proceso, como la dan las lecturas de Producción. */
export interface SaludEscrita {
	salud: string;
	tono: "normal" | "ambar" | "rojo";
	atorado: boolean;
}

/** Lo que regresa `produccion.salud_de_lotes`. */
const deSalud = z.object({
	lotes: z.array(
		z.object({ lote_id: z.uuid(), salud: z.string(), tono: z.enum(["normal", "ambar", "rojo"]), atorado: z.boolean() }),
	),
});

/** Lo que regresa `produccion.lotes_atorados`. */
const deAtorados = z.object({
	lotes: z.array(
		z.object({
			lote_id: z.uuid(),
			operacion: z.string(),
			falla: z.string().nullable(),
			parada_desde: z.string().nullable(),
		}),
	),
});

/** Por qué está atorado un lote: la máquina parada y desde cuándo, si es por máquina. */
export interface PorQueAtorado {
	operacion: string;
	maquina: string | null;
	paradaDesde: string | null;
}

/**
 * La salud de hoy de los lotes en proceso y el porqué de los atorados, de las lecturas de Producción.
 * @param contexto El contexto de la consulta.
 */
export async function saludDeLosLotes(contexto: ContextoDeConsulta): Promise<{
	salud: Map<string, SaludEscrita>;
	atorados: Map<string, PorQueAtorado>;
}> {
	const salud = deSalud.parse(await contexto.lectura("produccion.salud_de_lotes", {})).lotes;
	const atorados = deAtorados.parse(await contexto.lectura("produccion.lotes_atorados", {})).lotes;
	return {
		salud: new Map(salud.map((uno) => [uno.lote_id, uno])),
		atorados: new Map(
			atorados.map((uno) => [
				uno.lote_id,
				{
					operacion: uno.operacion,
					// «Collareta 3 parada (FM-0012)»: la pantalla dice la máquina sin su falla.
					maquina: uno.falla === null ? null : uno.falla.replace(/ \([^)]*\)$/, ""),
					paradaDesde: uno.parada_desde,
				},
			]),
		),
	};
}

/** Lo que se sabe de un lote para escribir su estado. */
export interface DatosDelEstado {
	etapa: string;
	salud: SaludEscrita | undefined;
	atorado: PorQueAtorado | undefined;
	/** El día de su último avance: el último registro vigente de la tablet o su corte. */
	ultimoAvance: string | null;
	/** El día de la última sincronización de las tablets del taller. */
	ultimaSincronizacion: string | null;
	fechaEntrega: string;
	fechaCorte: string;
	cortadas: number;
	listas: number;
	merma: number;
	aprobadas: number;
	enAduanaEl: string | null;
	motivoCancelacion: string | null;
}

/**
 * El estado de un lote ya escrito, con su color y su línea: el mismo en la tarjeta, en el cajón y en las tablas (la
 * tabla de estados de docs/interfaz/fabrica/produccion.md).
 * @param datos Lo que se sabe del lote.
 * @param hoy El día de negocio.
 */
export function estadoDelLote(datos: DatosDelEstado, hoy: Temporal.PlainDate): z.infer<typeof estadoEscrito> {
	const desde = (dia: string | null) => (dia === null ? "" : `Desde el ${textoDeDiaCorto(dia)}`);
	switch (datos.etapa) {
		case "por_cortar":
			return {
				texto: "Por cortar",
				color: "gris",
				linea: `${textoDeDiaCorto(datos.fechaCorte)} · ${textoEnDias(diasHasta(hoy, datos.fechaCorte))}`,
			};
		case "terminado":
			return { texto: "Terminado", color: "verde", linea: `${datos.listas} listas · esperando a Calidad` };
		case "revisado":
			return { texto: "Revisado", color: "verde", linea: `${datos.aprobadas} aprobadas · esperando a Aduana` };
		case "en_aduana":
			return {
				texto: "En aduana",
				color: "verde",
				linea: `${datos.listas} recibidas el ${datos.enAduanaEl === null ? "" : textoDeDiaCorto(datos.enAduanaEl)}`,
			};
		case "cancelado":
			return {
				texto: "Cancelado",
				color: "gris",
				linea: `Se quitó de su orden: ${(datos.motivoCancelacion ?? "").replace(/^Cambio de pedido /, "cambio de ")}`,
			};
	}
	return estadoEnProceso(datos, hoy, desde);
}

/**
 * El estado de un lote en proceso: su salud, con la línea que le toca.
 * @param datos Lo que se sabe del lote.
 * @param hoy El día de negocio.
 * @param desde Cómo se escribe «Desde el {fecha}».
 */
function estadoEnProceso(
	datos: DatosDelEstado,
	hoy: Temporal.PlainDate,
	desde: (dia: string | null) => string,
): z.infer<typeof estadoEscrito> {
	const texto = datos.salud?.salud ?? "En tiempo";
	const faltan = datos.cortadas - datos.merma - datos.listas;
	if (datos.salud?.atorado === true) {
		const maquina = datos.atorado?.maquina ?? null;
		return { texto, color: "rojo", linea: maquina === null ? desde(datos.ultimoAvance) : `${maquina} parada` };
	}
	if (texto === "Sin datos de la tablet") return { texto, color: "gris", linea: desde(datos.ultimaSincronizacion) };
	if (texto === "Atrasado") return { texto, color: "rojo", linea: `Faltan ${faltan}` };
	if (texto === "En riesgo de atraso") {
		return {
			texto,
			color: "ambar",
			linea: `Faltan ${faltan} · entrega ${textoEnDias(diasHasta(hoy, datos.fechaEntrega))}`,
		};
	}
	return { texto: "En tiempo", color: "azul", linea: `${datos.listas} de ${datos.cortadas} listas` };
}

/** Lo hecho en una operación del flujo de un lote. */
export interface HechoEnOperacion {
	loteId: string;
	operacion: string;
	orden: number;
	esCorte: boolean;
	buenas: number;
	danadas: number;
}

/** Lo hecho en cada operación de los flujos de unos lotes, como sale de la base. */
const deLoHecho = z.array(
	z.object({
		lote_id: z.uuid(),
		operacion: z.string(),
		orden: z.number(),
		es_corte: z.boolean(),
		buenas: z.coerce.number(),
		danadas: z.coerce.number(),
	}),
);

/**
 * Lee lo hecho en cada operación del flujo congelado de unos lotes cortados: las buenas y las dañadas de sus registros
 * vigentes.
 * @param contexto El contexto de la consulta.
 * @param condicion Qué lotes (`l.id = …`, `l.estado = 'en_proceso'`).
 */
export async function loHechoPorOperacion(contexto: ContextoDeConsulta, condicion: SQL): Promise<HechoEnOperacion[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id AS lote_id, o.nombre AS operacion, f.orden, o.es_corte,
			coalesce(sum(r.piezas_buenas) FILTER (WHERE r.estado = 'vigente'), 0) AS buenas,
			coalesce(sum(r.piezas_danadas) FILTER (WHERE r.estado = 'vigente'), 0) AS danadas
		FROM lotes l JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND (f.baja_en IS NULL
			OR EXISTS (SELECT 1 FROM registros_operacion x WHERE x.lote_id = l.id AND x.flujo_operacion_id = f.id))
		JOIN operaciones o ON o.id = f.operacion_id
		LEFT JOIN registros_operacion r ON r.lote_id = l.id AND r.flujo_operacion_id = f.id
		WHERE ${condicion}
		GROUP BY l.id, o.nombre, f.orden, o.es_corte
		ORDER BY l.id, f.orden`);
	return deLoHecho.parse(rows).map((fila) => ({
		loteId: fila.lote_id,
		operacion: fila.operacion,
		orden: fila.orden,
		esCorte: fila.es_corte,
		buenas: fila.buenas,
		danadas: fila.danadas,
	}));
}

/**
 * La tira de operaciones de un lote: una casilla por operación después del corte, con lo que lleva, lo que puede
 * reportar (lo que hizo la anterior; la primera, las cortadas) y la marca del cuello de botella o del atorado.
 * @param operaciones Lo hecho en cada operación de su flujo.
 * @param cortadas Las cortadas del lote.
 * @param atoradaEn La operación atorada, si lo está.
 */
export function tiraDelLote(
	operaciones: readonly HechoEnOperacion[],
	cortadas: number,
	atoradaEn: string | null,
): z.infer<typeof casillaDeLaTira>[] {
	const enOrden = [...operaciones].sort((una, otra) => una.orden - otra.orden).filter((una) => !una.esCorte);
	const casillas = enOrden.map((operacion, i) => {
		const anterior = enOrden[i - 1];
		const puedeHasta = anterior === undefined ? cortadas : anterior.buenas;
		return {
			operacion: operacion.operacion,
			hechas: operacion.buenas,
			cortadas,
			puede_hasta: puedeHasta,
			esperando: puedeHasta - operacion.buenas - operacion.danadas,
		};
	});
	// El cuello de botella es la operación con más piezas esperando; la atorada lleva su marca en su lugar.
	const cuello = casillas.reduce<(typeof casillas)[number] | undefined>(
		(mayor, casilla) =>
			casilla.esperando > 0 && (mayor === undefined || casilla.esperando > mayor.esperando) ? casilla : mayor,
		undefined,
	);
	return casillas.map(({ esperando: _esperando, ...casilla }) => ({
		...casilla,
		marca:
			atoradaEn !== null && casilla.operacion === atoradaEn
				? "atorado"
				: atoradaEn === null && casilla.operacion === cuello?.operacion
					? "se_junta"
					: null,
	}));
}

/**
 * La operación atorada de un lote, del texto de su salud («Atorado en Costados»).
 * @param salud Su salud.
 */
export function operacionAtorada(salud: SaludEscrita | undefined): string | null {
	return salud?.atorado === true ? salud.salud.replace(/^Atorado en /, "") : null;
}

/**
 * El día de la última sincronización de las tablets del taller, para «Sin datos de la tablet».
 * @param contexto El contexto de la consulta.
 */
export async function ultimaSincronizacion(contexto: ContextoDeConsulta): Promise<string | null> {
	const { rows } = await contexto.base.execute(sql`
		SELECT to_char(max(s.ultima_subida_en) AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS dia
		FROM dispositivos_sync s JOIN dispositivos d ON d.id = s.dispositivo_id WHERE d.tipo = 'tablet_taller'`);
	return z.object({ dia: z.string().nullable() }).parse(rows[0] ?? { dia: null }).dia;
}

/** El modelo de una prenda: su escuela, o «Básico». */
export const columnaDeModelo = sql`coalesce((SELECT e.nombre FROM escuelas e WHERE e.id = p.escuela_id), 'Básico') AS modelo`;

/** Un lote como lo leen las pantallas: su prenda, para quién, sus piezas, su receta y su último avance. */
const deUnLote = z.object({
	id: z.uuid(),
	folio: z.string(),
	orden: z.string(),
	orden_id: z.uuid(),
	orden_fecha: z.string(),
	estado: z.enum(["por_cortar", "en_proceso", "terminado", "revisado", "en_aduana", "cancelado"]),
	producto_id: z.uuid(),
	prenda: z.string(),
	modelo: z.string(),
	fecha_corte: z.string(),
	planeadas: z.coerce.number(),
	cortadas: z.coerce.number(),
	listas: z.coerce.number(),
	merma: z.coerce.number(),
	aprobadas: z.coerce.number(),
	en_aduana_el: z.string().nullable(),
	cortado_el: z.string().nullable(),
	avance: z.string().nullable(),
	motivo_cancelacion: z.string().nullable(),
	receta: z.enum(["verificada", "sin_verificar", "sin_receta"]),
	receta_version_id: z.uuid().nullable(),
	...deParaQuien,
});

/** Un lote leído para las pantallas. */
export type LoteLeido = z.infer<typeof deUnLote>;

/**
 * Lee los lotes que cumplen una condición, con todo lo que sus pantallas muestran. Sin dinero.
 * @param contexto El contexto de la consulta.
 * @param condicion Sobre el lote `l` (`l.estado = 'en_proceso'`).
 */
export async function leerLotes(contexto: ContextoDeConsulta, condicion: SQL): Promise<LoteLeido[]> {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.folio, o.folio AS orden, o.id AS orden_id, o.fecha::text AS orden_fecha, l.estado, l.producto_id, p.nombre AS prenda,
			${columnaDeModelo}, l.fecha_corte::text AS fecha_corte,
			(SELECT coalesce(sum(t.piezas_planeadas), 0) FROM lote_tallas t WHERE t.lote_id = l.id) AS planeadas,
			(SELECT coalesce(sum(t.piezas_cortadas), 0) FROM lote_tallas t WHERE t.lote_id = l.id) AS cortadas,
			(SELECT coalesce(sum(t.piezas_terminadas), 0) FROM lote_tallas t WHERE t.lote_id = l.id) AS listas,
			(SELECT coalesce(sum(t.piezas_merma), 0) FROM lote_tallas t WHERE t.lote_id = l.id) AS merma,
			(SELECT coalesce(sum(v.piezas_aprobadas), 0) FROM revisiones v WHERE v.lote_id = l.id) AS aprobadas,
			(l.en_aduana_en AT TIME ZONE 'America/Mexico_City')::date::text AS en_aduana_el,
			(l.cortado_en AT TIME ZONE 'America/Mexico_City')::date::text AS cortado_el,
			coalesce((SELECT max(r.fecha) FROM registros_operacion r
				WHERE r.lote_id = l.id AND r.estado = 'vigente' AND r.origen = 'tablet'),
				(l.cortado_en AT TIME ZONE 'America/Mexico_City')::date)::text AS avance,
			l.motivo_cancelacion,
			CASE WHEN rec.version_vigente_id IS NULL THEN 'sin_receta'
				WHEN rec.estado = 'verificada' THEN 'verificada' ELSE 'sin_verificar' END AS receta,
			coalesce(l.receta_version_id, rec.version_vigente_id) AS receta_version_id,
			${columnasDeParaQuien}
		FROM lotes l JOIN ordenes_produccion o ON o.id = l.orden_produccion_id
		JOIN productos p ON p.id = l.producto_id
		LEFT JOIN recetas rec ON rec.producto_id = l.producto_id
		${unionesDeParaQuien}
		WHERE ${condicion}
		ORDER BY l.fecha_entrega, l.folio`);
	return z.array(deUnLote).parse(rows);
}

/** Una parada del hilo de un lote, con su nombre. */
export type ParadaDelHilo = z.infer<typeof paradaDeLote>;

/**
 * El hilo de un lote que no es de un pedido (reabasto o temporada): sus seis paradas con sus piezas y su línea corta,
 * con los textos de docs/interfaz/TEXTOS.md («El hilo»): la primera es «Orden» y la última, la tienda o «Bodega».
 * @param lote El lote.
 * @param salud Su salud de hoy, si está en proceso.
 * @param hoy El día de negocio.
 */
export function hiloDelLote(
	lote: LoteLeido,
	salud: SaludEscrita | undefined,
	hoy: Temporal.PlainDate,
): ParadaDelHilo[] {
	const sinCortar = lote.estado === "por_cortar";
	const corte: Pick<ParadaDelHilo, "linea" | "tono"> = !sinCortar
		? { linea: lote.cortado_el === null ? "" : textoDeDiaCorto(lote.cortado_el), tono: "normal" }
		: lote.receta === "sin_receta"
			? { linea: "falta la receta", tono: "rojo" }
			: diasHasta(hoy, lote.fecha_corte) < 0
				? { linea: "corte atrasado", tono: "rojo" }
				: { linea: `se corta el ${textoDeDiaCorto(lote.fecha_corte)}`, tono: "normal" };
	const costura: Pick<ParadaDelHilo, "linea" | "tono"> =
		salud?.atorado === true
			? { linea: salud.salud.toLocaleLowerCase("es-MX"), tono: "rojo" }
			: { linea: lote.cortadas > 0 ? `${lote.listas} de ${lote.cortadas} listas` : "", tono: salud?.tono ?? "normal" };
	const porRevisar = lote.estado === "terminado" ? lote.listas : 0;
	const enAduana = lote.estado === "en_aduana" ? lote.listas : 0;
	const destino = lote.destino === "tienda" ? (lote.tienda ?? "Tienda") : "Bodega";
	return [
		{
			parada: "pedido",
			nombre: "Orden",
			piezas: lote.planeadas,
			linea: textoDeDiaCorto(lote.orden_fecha),
			tono: "normal",
		},
		{ parada: "corte", nombre: "Corte", piezas: lote.cortadas, ...corte },
		{ parada: "costura", nombre: "Costura", piezas: lote.listas, ...costura },
		{
			parada: "calidad",
			nombre: "Calidad",
			piezas: porRevisar,
			linea: porRevisar > 0 ? "por revisar" : "",
			tono: "normal",
		},
		{
			parada: "aduana",
			nombre: "Aduana",
			piezas: lote.estado === "revisado" ? lote.aprobadas : enAduana,
			linea: enAduana > 0 ? "listas" : lote.estado === "revisado" ? "por recibir" : "",
			tono: "normal",
		},
		{
			parada: "entrega",
			nombre: destino,
			piezas: 0,
			linea: `para el ${textoDeDiaCorto(lote.fecha_entrega)}`,
			tono: "normal",
		},
	];
}

/** Lo que regresa `patronaje.calcular_material`, lo que se usa. */
export const deCalcularMaterial = z.object({
	receta_version_id: z.uuid().nullable(),
	desperdicio_pct: z.string(),
	materiales: z.array(
		z.object({
			material_id: z.uuid(),
			papel: z.string(),
			cantidad: z.number().nullable(),
			pide: z.string().nullable(),
			piso: z.string().nullable(),
		}),
	),
});

/**
 * Las piezas por talla de un lote, como las pide `patronaje.calcular_material`.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 * @param cuales Las planeadas o las cortadas.
 */
export async function piezasPorTallaDelLote(
	contexto: ContextoDeConsulta,
	loteId: string,
	cuales: "planeadas" | "cortadas",
): Promise<{ talla_id: string; piezas: number }[]> {
	const columna = cuales === "planeadas" ? sql`t.piezas_planeadas` : sql`coalesce(t.piezas_cortadas, 0)`;
	const { rows } = await contexto.base.execute(sql`
		SELECT v.talla_id, ${columna} AS piezas FROM lote_tallas t JOIN variantes v ON v.id = t.variante_id
		WHERE t.lote_id = ${loteId}`);
	return z.array(z.object({ talla_id: z.uuid(), piezas: z.coerce.number() })).parse(rows);
}

/**
 * Los datos del estado de un lote leído.
 * @param lote El lote.
 * @param salud La salud y los atorados de hoy.
 * @param sincronizacion La última sincronización de las tablets del taller.
 */
export function datosDelEstado(
	lote: LoteLeido,
	salud: { salud: Map<string, SaludEscrita>; atorados: Map<string, PorQueAtorado> },
	sincronizacion: string | null,
): DatosDelEstado {
	return {
		etapa: lote.estado,
		salud: salud.salud.get(lote.id),
		atorado: salud.atorados.get(lote.id),
		ultimoAvance: lote.avance,
		ultimaSincronizacion: sincronizacion,
		fechaEntrega: lote.fecha_entrega,
		fechaCorte: lote.fecha_corte,
		cortadas: lote.cortadas,
		listas: lote.listas,
		merma: lote.merma,
		aprobadas: lote.aprobadas,
		enAduanaEl: lote.en_aduana_el,
		motivoCancelacion: lote.motivo_cancelacion,
	};
}
