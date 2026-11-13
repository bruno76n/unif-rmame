/**
 * `calidad.defectos`: la pestaña Defectos. Las piezas revisadas y rechazadas de los últimos
 * `calidad.defectos_periodo_dias` días, cada defecto con su conteo, la tasa por operación y por persona (regla 9 de
 * docs/modulos/calidad/revision-de-lotes.md), roja arriba de `calidad.defectos_tasa_roja_porcentaje`, y el catálogo
 * de defectos con sus operaciones. Sin precios, importes, tarifas ni sueldos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Defectos» y la ventana «Defecto nuevo»)
 *
 * La tasa de una operación son sus rechazos entre las revisadas de los lotes cuyo flujo la tiene; la de una persona,
 * sus rechazos entre las revisadas de los lotes donde tiene registros.
 */

import { defectosDeCalidad } from "@uniformame/compartido/contratos/calidad/defectos";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { defectosDelPeriodo, enElPeriodo, parametroNumero, porcentaje } from "./comun.ts";

/** Un renglón de la tasa, como sale de la base. */
const deTasa = z.object({
	nombre: z.string(),
	rechazadas: z.number(),
	revisadas: z.number(),
	mas_comun: z.string(),
});

/**
 * Escribe la tabla de una tasa: solo las que tienen rechazos, de la tasa más alta a la más baja, cada una con su barra
 * contra la más alta y en rojo arriba del límite.
 * @param filas Lo leído.
 * @param limite `calidad.defectos_tasa_roja_porcentaje`.
 */
function tablaDeTasa(filas: readonly z.infer<typeof deTasa>[], limite: number) {
	const conTasa = filas
		.filter((fila) => fila.rechazadas > 0)
		.map((fila) => ({ ...fila, tasa: porcentaje(fila.rechazadas, fila.revisadas) }))
		.sort((una, otra) => otra.tasa - una.tasa || una.nombre.localeCompare(otra.nombre, "es"));
	const masAlta = Math.max(0, ...conTasa.map((fila) => fila.tasa));
	return conTasa.map((fila) => ({
		nombre: fila.nombre,
		rechazadas: fila.rechazadas,
		tasa: fila.tasa,
		contra_la_mas_alta: masAlta === 0 ? 0 : fila.tasa / masAlta,
		roja: fila.tasa > limite,
		mas_comun: fila.mas_comun,
	}));
}

/**
 * La tasa por operación del catálogo.
 * @param contexto El contexto de la consulta.
 * @param periodo La condición del periodo sobre las revisiones `rv`.
 */
async function porOperacion(contexto: ContextoDeConsulta, periodo: SQL) {
	const { rows } = await contexto.base.execute(sql`
		WITH rechazadas AS (
			SELECT f.operacion_id, r.defecto_id, sum(r.piezas)::int AS piezas
			FROM rechazos r JOIN revisiones rv ON rv.id = r.revision_id
			JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id
			WHERE ${periodo} GROUP BY f.operacion_id, r.defecto_id
		)
		SELECT o.nombre, sum(x.piezas)::int AS rechazadas,
			(SELECT coalesce(sum(rv.piezas_revisadas), 0)::int FROM revisiones rv JOIN lotes l ON l.id = rv.lote_id
				WHERE ${periodo} AND EXISTS (SELECT 1 FROM flujo_operaciones f WHERE f.flujo_id = l.flujo_id
					AND f.operacion_id = o.id)) AS revisadas,
			(SELECT d.nombre FROM rechazadas y JOIN defectos d ON d.id = y.defecto_id WHERE y.operacion_id = o.id
				ORDER BY y.piezas DESC, d.nombre LIMIT 1) AS mas_comun
		FROM rechazadas x JOIN operaciones o ON o.id = x.operacion_id
		GROUP BY o.id, o.nombre`);
	return z.array(deTasa).parse(rows);
}

/**
 * La tasa por persona.
 * @param contexto El contexto de la consulta.
 * @param periodo La condición del periodo sobre las revisiones `rv`.
 */
async function porPersona(contexto: ContextoDeConsulta, periodo: SQL) {
	const { rows } = await contexto.base.execute(sql`
		WITH rechazadas AS (
			SELECT r.persona_id, r.defecto_id, sum(r.piezas)::int AS piezas
			FROM rechazos r JOIN revisiones rv ON rv.id = r.revision_id
			WHERE ${periodo} GROUP BY r.persona_id, r.defecto_id
		)
		SELECT p.nombre, sum(x.piezas)::int AS rechazadas,
			(SELECT coalesce(sum(rv.piezas_revisadas), 0)::int FROM revisiones rv
				WHERE ${periodo} AND EXISTS (SELECT 1 FROM registros_operacion g WHERE g.lote_id = rv.lote_id
					AND g.persona_id = p.id AND g.estado = 'vigente')) AS revisadas,
			(SELECT d.nombre FROM rechazadas y JOIN defectos d ON d.id = y.defecto_id WHERE y.persona_id = p.id
				ORDER BY y.piezas DESC, d.nombre LIMIT 1) AS mas_comun
		FROM rechazadas x JOIN personas p ON p.id = x.persona_id
		GROUP BY p.id, p.nombre`);
	return z.array(deTasa).parse(rows);
}

/**
 * El catálogo de defectos vigentes con las operaciones donde pasan, y las operaciones vigentes del catálogo.
 * @param contexto El contexto de la consulta.
 */
async function catalogo(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`
		SELECT d.id AS defecto_id, d.nombre,
			coalesce(array_agg(o.nombre ORDER BY o.nombre) FILTER (WHERE o.id IS NOT NULL), '{}') AS operaciones
		FROM defectos d LEFT JOIN defecto_operaciones x ON x.defecto_id = d.id AND x.baja_en IS NULL
		LEFT JOIN operaciones o ON o.id = x.operacion_id
		WHERE d.baja_en IS NULL GROUP BY d.id ORDER BY d.creado_en, d.nombre`);
	const { rows: operaciones } = await contexto.base.execute(sql`
		SELECT id AS operacion_id, nombre FROM operaciones WHERE baja_en IS NULL ORDER BY nombre`);
	return {
		catalogo: z
			.array(z.object({ defecto_id: z.uuid(), nombre: z.string(), operaciones: z.array(z.string()) }))
			.parse(rows),
		operaciones: z.array(z.object({ operacion_id: z.uuid(), nombre: z.string() })).parse(operaciones),
	};
}

export const consultaDefectos = implementarConsulta(defectosDeCalidad, async (contexto) => {
	const periodo = await defectosDelPeriodo(contexto);
	const limite = await parametroNumero(contexto, "calidad.defectos_tasa_roja_porcentaje");
	const enPeriodo = enElPeriodo(contexto, periodo.dias);
	return {
		resultado: {
			dias: periodo.dias,
			revisadas: periodo.revisadas,
			lotes: periodo.lotes,
			rechazadas: periodo.rechazadas,
			porcentaje: periodo.porcentaje,
			del_periodo: periodo.delPeriodo,
			por_operacion: tablaDeTasa(await porOperacion(contexto, enPeriodo), limite),
			por_persona: tablaDeTasa(await porPersona(contexto, enPeriodo), limite),
			...(await catalogo(contexto)),
		},
	};
});
