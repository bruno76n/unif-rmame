/**
 * Los lotes atorados de hoy: la salud de cada lote en proceso con lo que dicen los registros, el último avance, los
 * días en que la tablet no subió nada, el cuello de botella y las máquinas paradas (`mantenimiento.fallas_que_detienen`).
 * Fase 12 · docs/modulos/produccion/lotes.md (regla 7)
 * Fase 18 · la lectura `produccion.lotes_atorados`, para las alertas de Dirección
 *
 * La usan el trabajo «Vigilar lotes atorados», que avisa a la dueña, y la lectura de Dirección: los dos ven lo mismo.
 * «Sin datos de la tablet» no cuenta como atorado.
 */

import { saludDeLote } from "@uniformame/compartido/calculos/salud-lote";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";

/** Lo que se sabe de cada lote en proceso para su salud. */
const deLosLotes = z.array(
	z.object({
		id: z.uuid(),
		folio: z.string(),
		fecha_entrega: z.string(),
		pedido_id: z.uuid().nullable(),
		avance: z.string(),
		ultimo_recibido: z.string().nullable(),
		faltan: z.coerce.number(),
	}),
);

/** Por lote, lo hecho en cada operación: para el cuello de botella. */
const deLasOperaciones = z.array(
	z.object({
		lote_id: z.uuid(),
		nombre: z.string(),
		orden: z.number(),
		es_corte: z.boolean(),
		persona_base_id: z.uuid(),
		hechas: z.coerce.number(),
		cortadas: z.coerce.number(),
	}),
);

/**
 * Las piezas esperando en cada operación después del corte: lo que hizo la anterior (a la primera, las cortadas)
 * menos lo que hizo ella (regla 6).
 * @param operaciones Las del flujo del lote, con lo hecho en cada una.
 */
function esperandoPorOperacion(operaciones: z.infer<typeof deLasOperaciones>) {
	const enOrden = [...operaciones].sort((una, otra) => una.orden - otra.orden);
	return enOrden.flatMap((operacion, i) => {
		if (operacion.es_corte) return [];
		const anterior = enOrden[i - 1];
		const llego = anterior === undefined || anterior.es_corte ? operacion.cortadas : anterior.hechas;
		return [
			{ nombre: operacion.nombre, personaBaseId: operacion.persona_base_id, esperando: llego - operacion.hechas },
		];
	});
}

/**
 * El cuello de botella de un lote («Se junta»): la operación con más piezas esperando.
 * @returns Su nombre, o `null` sin operaciones después del corte.
 */
function cuelloDeBotella(esperando: ReturnType<typeof esperandoPorOperacion>) {
	let mayor: (typeof esperando)[number] | null = null;
	for (const operacion of esperando) if (mayor === null || operacion.esperando > mayor.esperando) mayor = operacion;
	return mayor?.nombre ?? null;
}

/** Lo que regresa `mantenimiento.fallas_que_detienen`. */
const deLasFallas = z.object({
	fallas: z.array(
		z.object({
			folio: z.string(),
			maquina: z.string(),
			persona_id: z.uuid().nullable(),
			parada_desde: z.string(),
		}),
	),
});

/**
 * El atorado por máquina de un lote: la primera operación con piezas esperando que hace de base quien trae una
 * máquina parada (regla 7).
 * @returns La operación y la falla, con desde cuándo está parada; o vacío.
 */
function atoradoPorMaquina(
	esperando: ReturnType<typeof esperandoPorOperacion>,
	paradas: z.infer<typeof deLasFallas>["fallas"],
) {
	for (const operacion of esperando) {
		if (operacion.esperando <= 0) continue;
		const falla = paradas.find((parada) => parada.persona_id === operacion.personaBaseId);
		if (falla !== undefined) {
			return {
				operacion: operacion.nombre,
				falla: `${falla.maquina} parada (${falla.folio})`,
				desde: falla.parada_desde,
			};
		}
	}
	return null;
}

/** Un lote atorado: por falta de avance (sus días de trabajo) o por una máquina parada (su falla y desde cuándo). */
export interface LoteAtorado {
	lote_id: string;
	folio: string;
	fecha_entrega: string;
	pedido_id: string | null;
	operacion: string;
	/** Los días de trabajo sin avance; 0 si es por máquina. */
	dias: number;
	/** La máquina parada y su falla, si es por máquina. */
	falla: string | null;
	parada_desde: string | null;
	/** El último registro que subió la tablet de este lote, si hay. */
	ultimo_recibido: string | null;
}

/**
 * Los lotes en proceso que hoy están atorados (regla 7).
 * @param contexto La transacción de quien lee.
 */
export async function lotesAtoradosDeHoy(contexto: ContextoDeAccion): Promise<LoteAtorado[]> {
	const { transaccion } = contexto;
	const hoy = contexto.diaDeNegocio;
	const numero = async (clave: string) => Number(await leerParametro(transaccion, { clave }));
	const diasDeTrabajo = leerDiasDeTrabajo(await leerParametro(transaccion, { clave: "general.dias_de_trabajo" }));
	const loteAtoradoDias = await numero("produccion.lote_atorado_dias");
	const riesgoAtrasoDias = await numero("produccion.riesgo_atraso_dias");
	const { rows: lotesEnProceso } = await transaccion.execute(sql`
		SELECT l.id, l.folio, l.fecha_entrega::text AS fecha_entrega, l.pedido_id,
			coalesce(max(r.fecha) FILTER (WHERE r.estado = 'vigente' AND r.origen = 'tablet'),
				(l.cortado_en AT TIME ZONE 'America/Mexico_City')::date)::text AS avance,
			to_char(max(r.recibido_en) FILTER (WHERE r.origen = 'tablet') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ultimo_recibido,
			(SELECT sum(coalesce(t.piezas_cortadas, 0) - t.piezas_merma - t.piezas_terminadas) FROM lote_tallas t WHERE t.lote_id = l.id) AS faltan
		FROM lotes l LEFT JOIN registros_operacion r ON r.lote_id = l.id
		WHERE l.estado = 'en_proceso'
		GROUP BY l.id`);
	const lotes = deLosLotes.parse(lotesEnProceso);
	if (lotes.length === 0) return [];
	const { rows: operaciones } = await transaccion.execute(sql`
		SELECT l.id AS lote_id, o.nombre, f.orden, o.es_corte, f.persona_base_id,
			coalesce((SELECT sum(r.piezas_buenas + r.piezas_danadas) FROM registros_operacion r
				WHERE r.lote_id = l.id AND r.flujo_operacion_id = f.id AND r.estado = 'vigente'), 0) AS hechas,
			(SELECT coalesce(sum(t.piezas_cortadas), 0) FROM lote_tallas t WHERE t.lote_id = l.id) AS cortadas
		FROM lotes l JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.baja_en IS NULL
		JOIN operaciones o ON o.id = f.operacion_id
		WHERE l.estado = 'en_proceso'`);
	const porLote = deLasOperaciones.parse(operaciones);
	const paradas = deLasFallas.parse(await contexto.lectura("mantenimiento.fallas_que_detienen", {})).fallas;
	// La última sincronización de las tablets del taller, y los días en que no subió nada de ningún lote.
	const { rows: sincronizacion } = await transaccion.execute(sql`
		SELECT to_char(max(s.ultima_subida_en) AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS dia
		FROM dispositivos_sync s JOIN dispositivos d ON d.id = s.dispositivo_id WHERE d.tipo = 'tablet_taller'`);
	const ultimaSincronizacion = z.object({ dia: z.string().nullable() }).parse(sincronizacion[0] ?? { dia: null }).dia;
	const desde = lotes.map((lote) => lote.avance).sort()[0] ?? hoy.toString();
	const { rows: conRegistros } = await transaccion.execute(sql`
		SELECT DISTINCT fecha::text AS fecha FROM registros_operacion WHERE origen = 'tablet' AND fecha > ${desde}::date`);
	const subio = new Set(
		z
			.array(z.object({ fecha: z.string() }))
			.parse(conRegistros)
			.map((dia) => dia.fecha),
	);
	const diasSinSubir: Temporal.PlainDate[] = [];
	for (
		let dia = Temporal.PlainDate.from(desde).add({ days: 1 });
		Temporal.PlainDate.compare(dia, hoy) < 0;
		dia = dia.add({ days: 1 })
	) {
		if (!subio.has(dia.toString())) diasSinSubir.push(dia);
	}
	const atorados: LoteAtorado[] = [];
	for (const lote of lotes) {
		const esperando = esperandoPorOperacion(porLote.filter((operacion) => operacion.lote_id === lote.id));
		const porMaquina = atoradoPorMaquina(esperando, paradas);
		const salud = saludDeLote({
			hoy,
			fechaEntrega: Temporal.PlainDate.from(lote.fecha_entrega),
			faltan: lote.faltan,
			ultimoAvance: Temporal.PlainDate.from(lote.avance),
			ultimaSincronizacion: ultimaSincronizacion === null ? null : Temporal.PlainDate.from(ultimaSincronizacion),
			diasSinSubir,
			cuelloDeBotella: cuelloDeBotella(esperando),
			atoradoPorMaquina: porMaquina === null ? null : { operacion: porMaquina.operacion, falla: porMaquina.falla },
			diasDeTrabajo,
			loteAtoradoDias,
			riesgoAtrasoDias,
		});
		if (salud.tipo !== "atorado" && salud.tipo !== "atorado_maquina") continue;
		atorados.push({
			lote_id: lote.id,
			folio: lote.folio,
			fecha_entrega: lote.fecha_entrega,
			pedido_id: lote.pedido_id,
			operacion: salud.operacion ?? "su primera operación",
			dias: salud.tipo === "atorado" ? salud.dias : 0,
			falla: salud.tipo === "atorado_maquina" ? salud.falla : null,
			parada_desde: salud.tipo === "atorado_maquina" ? (porMaquina?.desde ?? null) : null,
			ultimo_recibido: lote.ultimo_recibido,
		});
	}
	return atorados;
}
