/**
 * `produccion.vigilar_lotes_atorados`: cada hora, en los días de trabajo, calcula la salud de cada lote en proceso y
 * avisa a la dueña del que entra a atorado.
 * Fase 12 · docs/modulos/produccion/lotes.md (regla 7, «Vigilar lotes atorados», «El aviso `lote_atorado`»)
 *
 * La salud es `saludDeLote` del paquete compartido, con lo que dicen los registros: el último avance, los días en que
 * la tablet no subió nada de ningún lote, el cuello de botella y las máquinas paradas (`mantenimiento.fallas_que_detienen`).
 * Un lote atorado avisa una vez: guarda `lote.atorado` solo si no hay otro de ese lote después de su último registro o
 * de la falla que lo detiene. «Sin datos de la tablet» no cuenta como atorado.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { saludDeLote } from "@uniformame/compartido/calculos/salud-lote";
import { and, eq, gt, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { eventos } from "../../admin/tablas.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";
import { tiposDeAvisoDeProduccion } from "../tablas.ts";

/** El aviso del lote atorado. */
const [loteAtorado] = tiposDeAvisoDeProduccion;

/** Lo que se sabe de cada lote en proceso para su salud. */
const deLosLotes = z.array(
	z.object({
		id: z.uuid(),
		folio: z.string(),
		fecha_entrega: z.string(),
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

/**
 * Revisa los lotes en proceso y avisa de los que entraron a atorado.
 * @param contexto La transacción del trabajo, con el sistema como quien escribe.
 * @returns Cuántos avisos nacieron.
 */
export async function vigilar(contexto: ContextoDeAccion): Promise<number> {
	const { transaccion } = contexto;
	const hoy = contexto.diaDeNegocio;
	const numero = async (clave: string) => Number(await leerParametro(transaccion, { clave }));
	const diasDeTrabajo = leerDiasDeTrabajo(await leerParametro(transaccion, { clave: "general.dias_de_trabajo" }));
	const loteAtoradoDias = await numero("produccion.lote_atorado_dias");
	const riesgoAtrasoDias = await numero("produccion.riesgo_atraso_dias");
	const { rows: lotesEnProceso } = await transaccion.execute(sql`
		SELECT l.id, l.folio, l.fecha_entrega::text AS fecha_entrega,
			coalesce(max(r.fecha) FILTER (WHERE r.estado = 'vigente' AND r.origen = 'tablet'),
				(l.cortado_en AT TIME ZONE 'America/Mexico_City')::date)::text AS avance,
			to_char(max(r.recibido_en) FILTER (WHERE r.origen = 'tablet') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ultimo_recibido,
			(SELECT sum(coalesce(t.piezas_cortadas, 0) - t.piezas_merma - t.piezas_terminadas) FROM lote_tallas t WHERE t.lote_id = l.id) AS faltan
		FROM lotes l LEFT JOIN registros_operacion r ON r.lote_id = l.id
		WHERE l.estado = 'en_proceso'
		GROUP BY l.id`);
	const lotes = deLosLotes.parse(lotesEnProceso);
	if (lotes.length === 0) return 0;
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
	let avisos = 0;
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
		// Avisa una vez hasta que algo cambia: ningún `lote.atorado` de este lote después de su último registro o de la
		// falla que lo detiene.
		const desde = [lote.ultimo_recibido, porMaquina?.desde ?? null]
			.filter((momento): momento is string => momento !== null)
			.sort()
			.at(-1);
		const [yaAviso] = await transaccion
			.select({ id: eventos.id })
			.from(eventos)
			.where(
				and(
					eq(eventos.tipo, "lote.atorado"),
					eq(eventos.entidadId, lote.id),
					...(desde === undefined ? [] : [gt(eventos.ocurridoEn, desde)]),
				),
			)
			.limit(1);
		if (yaAviso !== undefined) continue;
		const operacion = salud.operacion ?? "su primera operación";
		const dias = salud.tipo === "atorado" ? salud.dias : 0;
		contexto.guardarEvento({
			tipo: "lote.atorado",
			datos: { lote_id: lote.id, operacion, dias, ...(salud.tipo === "atorado_maquina" ? { falla: salud.falla } : {}) },
			tablas: ["lotes"],
			entidad: "lotes",
			entidadId: lote.id,
			entidadFolio: lote.folio,
		});
		await contexto.interna("admin.crear_aviso", {
			tipo: loteAtorado,
			destinatarios: { regla: "duena" },
			// Por máquina, el aviso dice la máquina parada en vez de los días (decisión 627).
			texto:
				salud.tipo === "atorado"
					? `${lote.folio} atorado en ${operacion} desde hace ${dias} días de trabajo`
					: `${lote.folio} atorado en ${operacion}: ${salud.falla}`,
			entidad: "lotes",
			entidadId: lote.id,
		});
		avisos++;
	}
	return avisos;
}

export const vigilarLotesAtorados: Trabajo = {
	nombre: "produccion.vigilar_lotes_atorados",
	horario: async () => ({ cada: "minutos", minutos: 60 }),
	correr: async (contexto) => {
		const hoy = diaDeNegocio(contexto.ahora);
		const dias = leerDiasDeTrabajo(await leerParametro(contexto.base, { clave: "general.dias_de_trabajo" }));
		if (!dias.some((dia) => dia === hoy.dayOfWeek)) return;
		await contexto.enTransaccion(vigilar);
	},
};
