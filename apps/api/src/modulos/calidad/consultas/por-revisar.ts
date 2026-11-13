/**
 * `calidad.por_revisar` y `calidad.revision_lote`: la pestaña Por revisar (los lotes que esperan revisión, los
 * revisados hoy y los reprocesos en el taller) y lo que necesita la revisión de un lote: sus tallas con sus listas, el
 * catálogo de defectos con la operación que se propone para cada uno, las operaciones de su flujo, la gente del Taller,
 * la persona que se propone por operación y talla, y quién revisa. Sin precios, importes, tarifas ni sueldos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Por revisar» y «Revisión de un lote»)
 *
 * La operación que se propone es la primera del flujo que suele causar el defecto o, si ninguna, la última; la persona,
 * la que dice `produccion.persona_que_la_hizo` (regla 3 de docs/modulos/calidad/revision-de-lotes.md).
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { porRevisarDeCalidad, revisionDeLote } from "@uniformame/compartido/contratos/calidad/por-revisar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { columnasDeParaQuien, deParaQuien, unionesDeParaQuien } from "../../produccion/consultas/comun.ts";
import { cosioEnElLote } from "../dominio/quien-revisa.ts";
import {
	defectosVigentes,
	escribirParaQuien,
	genteDelTaller,
	leerReprocesos,
	lotesParaRevisar,
	personaPropuesta,
	type Reproceso,
} from "./comun.ts";

/** La zona del negocio, para pasar un momento a su día. */
const enMexico = sql`'America/Mexico_City'`;

/** Un lote revisado hoy, como sale de la base. */
const deRevisadoHoy = z.object({
	lote_id: z.uuid(),
	folio: z.string(),
	prenda: z.string(),
	aprobadas: z.number(),
	a_reproceso: z.number(),
	reviso: z.string(),
	reviso_quien_coso: z.boolean(),
});

/**
 * Los lotes revisados hoy, del más nuevo al más viejo, con quién revisó y si quedó marcada.
 * @param contexto El contexto de la consulta.
 */
async function revisadosHoy(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT rv.lote_id, l.folio, p.nombre AS prenda, rv.piezas_aprobadas AS aprobadas,
			rv.piezas_revisadas - rv.piezas_aprobadas AS a_reproceso, coalesce(pr.nombre, u.nombre, u.correo) AS reviso,
			rv.reviso_quien_coso
		FROM revisiones rv JOIN lotes l ON l.id = rv.lote_id JOIN productos p ON p.id = l.producto_id
		JOIN usuarios u ON u.id = rv.revisado_por LEFT JOIN personas pr ON pr.id = u.persona_id
		WHERE rv.fecha = ${contexto.diaDeNegocio.toString()}::date
		ORDER BY rv.revisado_en DESC`);
	return z.array(deRevisadoHoy).parse(rows);
}

/**
 * Un reproceso de «Reproceso en el taller»: «En reproceso» (azul) o «Aprobado» (verde); «Aprobar» se prende solo con
 * el lote en aduana (regla 7).
 * @param reproceso El reproceso.
 */
function reprocesoEnElTaller(reproceso: Reproceso) {
	const enReproceso = reproceso.estado === "en_reproceso";
	const partes = [reproceso.folio, reproceso.pedido_folio, textoDeDiaCorto(reproceso.fecha)].filter(
		(parte) => parte !== null,
	);
	return {
		reproceso_id: reproceso.id,
		version: reproceso.version,
		prenda: reproceso.prenda,
		linea: partes.join(" · "),
		defecto: reproceso.defecto,
		talla: reproceso.talla,
		persona: reproceso.persona,
		operacion: reproceso.operacion,
		piezas: reproceso.piezas,
		estado: enReproceso ? "En reproceso" : "Aprobado",
		color: enReproceso ? ("azul" as const) : ("verde" as const),
		puede_aprobar: enReproceso && reproceso.lote_en_aduana,
		motivo_apagado:
			enReproceso && !reproceso.lote_en_aduana
				? `Aduana todavía no recibe ${reproceso.lote_folio}: el reproceso se aprueba después.`
				: null,
	};
}

export const consultaPorRevisar = implementarConsulta(porRevisarDeCalidad, async (contexto) => {
	const lotes = await lotesParaRevisar(contexto);
	// Los que siguen en el taller y los que se aprobaron hoy, para que se vea lo que acaba de pasar.
	const reprocesos = await leerReprocesos(
		contexto,
		sql`(rp.estado = 'en_reproceso' OR (rp.aprobado_en AT TIME ZONE ${enMexico})::date = ${contexto.diaDeNegocio.toString()}::date)`,
	);
	return {
		resultado: {
			// Primero los «Por revisar hoy»; dentro de cada uno, por entrega (ya vienen así).
			lotes: [...lotes.filter((lote) => lote.urgente), ...lotes.filter((lote) => !lote.urgente)].map((lote) => ({
				lote_id: lote.id,
				folio: lote.folio,
				prenda: lote.prenda,
				linea: lote.terminado === null ? lote.folio : `${lote.folio} · terminado el ${textoDeDiaCorto(lote.terminado)}`,
				listas: lote.listas,
				para: escribirParaQuien(lote),
				urgente: lote.urgente,
			})),
			revisados_hoy: await revisadosHoy(contexto),
			reprocesos: reprocesos.map(reprocesoEnElTaller),
		},
	};
});

/** El lote de la revisión, como sale de la base. */
const deLote = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	estado: z.string(),
	flujo_id: z.uuid().nullable(),
	prenda: z.string(),
	...deParaQuien,
});

/**
 * Lee el lote de la revisión.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 * @throws `404` si no existe.
 */
async function leerLote(contexto: ContextoDeConsulta, loteId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.id, l.version, l.folio, l.estado, l.flujo_id, p.nombre AS prenda, ${columnasDeParaQuien}
		FROM lotes l JOIN productos p ON p.id = l.producto_id ${unionesDeParaQuien}
		WHERE l.id = ${loteId}`);
	if (rows[0] === undefined) throw noExiste();
	return deLote.parse(rows[0]);
}

/**
 * Las tallas cortadas del lote, en su orden, con sus listas.
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 */
async function tallasDelLote(contexto: ContextoDeConsulta, loteId: string) {
	const { rows } = await contexto.base.execute(sql`
		SELECT lt.variante_id, t.nombre AS talla, lt.piezas_terminadas AS listas
		FROM lote_tallas lt JOIN variantes v ON v.id = lt.variante_id JOIN tallas t ON t.id = v.talla_id
		WHERE lt.lote_id = ${loteId} AND coalesce(lt.piezas_cortadas, 0) > 0 ORDER BY t.orden`);
	return z.array(z.object({ variante_id: z.uuid(), talla: z.string(), listas: z.number() })).parse(rows);
}

/**
 * Las operaciones vigentes de un flujo, en su orden, con la operación del catálogo de cada una.
 * @param contexto El contexto de la consulta.
 * @param flujoId El flujo del lote.
 */
async function operacionesDelFlujo(contexto: ContextoDeConsulta, flujoId: string | null) {
	if (flujoId === null) return [];
	const { rows } = await contexto.base.execute(sql`
		SELECT f.id, o.nombre, f.operacion_id FROM flujo_operaciones f JOIN operaciones o ON o.id = f.operacion_id
		WHERE f.flujo_id = ${flujoId} AND f.baja_en IS NULL ORDER BY f.orden`);
	return z.array(z.object({ id: z.uuid(), nombre: z.string(), operacion_id: z.uuid() })).parse(rows);
}

/**
 * Las operaciones del catálogo que suelen causar cada defecto vigente.
 * @param contexto El contexto de la consulta.
 */
async function operacionesDeCadaDefecto(contexto: ContextoDeConsulta): Promise<Map<string, Set<string>>> {
	const { rows } = await contexto.base.execute(sql`
		SELECT defecto_id, operacion_id FROM defecto_operaciones WHERE baja_en IS NULL`);
	const porDefecto = new Map<string, Set<string>>();
	for (const fila of z.array(z.object({ defecto_id: z.uuid(), operacion_id: z.uuid() })).parse(rows)) {
		porDefecto.set(fila.defecto_id, (porDefecto.get(fila.defecto_id) ?? new Set()).add(fila.operacion_id));
	}
	return porDefecto;
}

/**
 * Quién revisa: el nombre de la cuenta y si cosió en el lote (`cosioEnElLote`, la regla 6 que sigue la acción).
 * @param contexto El contexto de la consulta.
 * @param loteId El lote.
 */
async function quienRevisa(contexto: ContextoDeConsulta, loteId: string) {
	const usuarioId = contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
	const { rows } = await contexto.base.execute(sql`
		SELECT coalesce(p.nombre, u.nombre, u.correo) AS nombre, u.persona_id
		FROM usuarios u LEFT JOIN personas p ON p.id = u.persona_id WHERE u.id = ${usuarioId}`);
	const cuenta = z
		.object({ nombre: z.string(), persona_id: z.uuid().nullable() })
		.parse(rows[0] ?? { nombre: "", persona_id: null });
	return { nombre: cuenta.nombre, coso: await cosioEnElLote(contexto.base, cuenta.persona_id, loteId) };
}

export const consultaRevisionLote = implementarConsulta(revisionDeLote, async (contexto, parametros) => {
	const lote = await leerLote(contexto, parametros.lote_id);
	const tallas = await tallasDelLote(contexto, lote.id);
	const operaciones = await operacionesDelFlujo(contexto, lote.flujo_id);
	const ligadas = await operacionesDeCadaDefecto(contexto);
	// La operación que se propone: la primera del flujo que suele causar el defecto o, si ninguna, la última.
	const propuestaDe = (defectoId: string) =>
		(operaciones.find((operacion) => ligadas.get(defectoId)?.has(operacion.operacion_id)) ?? operaciones.at(-1))?.id;
	const defectos = (await defectosVigentes(contexto)).flatMap((defecto) => {
		const flujoOperacionId = propuestaDe(defecto.id);
		return flujoOperacionId === undefined ? [] : [{ ...defecto, flujo_operacion_id: flujoOperacionId }];
	});
	// La persona que se propone por operación y talla, de las tallas que tienen listas.
	const propuestas: { flujo_operacion_id: string; variante_id: string; persona_id: string }[] = [];
	for (const operacion of operaciones) {
		for (const talla of tallas.filter((una) => una.listas > 0)) {
			const persona = await personaPropuesta(contexto, {
				lote_id: lote.id,
				flujo_operacion_id: operacion.id,
				variante_id: talla.variante_id,
			});
			if (persona !== null) {
				propuestas.push({ flujo_operacion_id: operacion.id, variante_id: talla.variante_id, persona_id: persona });
			}
		}
	}
	const revisa = await quienRevisa(contexto, lote.id);
	return {
		resultado: {
			lote_id: lote.id,
			version: lote.version,
			folio: lote.folio,
			prenda: lote.prenda,
			para: escribirParaQuien(lote),
			por_revisar: lote.estado === "terminado",
			tallas,
			defectos,
			operaciones: operaciones.map((operacion) => ({ id: operacion.id, nombre: operacion.nombre })),
			personas: await genteDelTaller(contexto),
			propuestas,
			revisa: revisa.nombre,
			coso_en_el_lote: revisa.coso,
		},
	};
});
