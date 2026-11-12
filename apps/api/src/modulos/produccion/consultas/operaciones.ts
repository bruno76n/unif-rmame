/**
 * `produccion.operaciones`: los flujos vigentes, cada uno con sus operaciones en orden, quién hace cada una, las prendas
 * que lo usan y su candado (los lotes en proceso o terminados sin revisar, regla 5 de
 * docs/modulos/produccion/operaciones-y-flujos.md); con las personas del Taller, el catálogo de operaciones y la que
 * propone «Va antes de». La tarifa vigente viaja como `tarifa_centavos`, que el recorte común quita sin «ven sueldos y
 * tarifas»; «Sin tarifa» sí lo ve Producción.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Operaciones» y «Ventanas»)
 */

import { operacionesDeProduccion } from "@uniformame/compartido/contratos/produccion/operaciones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";

/** Una operación de un flujo, como sale de la base. */
const deOperacion = z.object({
	flujo_id: z.uuid(),
	flujo: z.string(),
	flujo_version: z.coerce.number(),
	flujo_operacion_id: z.uuid(),
	operacion: z.string(),
	es_corte: z.boolean(),
	persona_id: z.uuid(),
	persona: z.string(),
	tarifa_centavos: z.coerce.number().nullable(),
});

export const consultaOperaciones = implementarConsulta(operacionesDeProduccion, async (contexto) => {
	const { base } = contexto;
	const { rows } = await base.execute(sql`
		SELECT fl.id AS flujo_id, fl.nombre AS flujo, fl.version AS flujo_version, f.id AS flujo_operacion_id,
			o.nombre AS operacion, o.es_corte, p.id AS persona_id, p.nombre AS persona, t.tarifa_centavos
		FROM flujos fl JOIN flujo_operaciones f ON f.flujo_id = fl.id AND f.baja_en IS NULL
		JOIN operaciones o ON o.id = f.operacion_id JOIN personas p ON p.id = f.persona_base_id
		LEFT JOIN tarifas_operacion t ON t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL
		WHERE fl.baja_en IS NULL
		ORDER BY lower(fl.nombre), f.orden`);
	const operaciones = z.array(deOperacion).parse(rows);
	const { rows: deLasPrendas } = await base.execute(sql`
		SELECT flujo_id, nombre FROM productos WHERE flujo_id IS NOT NULL AND baja_en IS NULL ORDER BY nombre`);
	const prendas = z.array(z.object({ flujo_id: z.uuid(), nombre: z.string() })).parse(deLasPrendas);
	const { rows: candados } = await base.execute(sql`
		SELECT flujo_id, count(*)::int AS lotes FROM lotes
		WHERE estado IN ('en_proceso', 'terminado') AND flujo_id IS NOT NULL GROUP BY flujo_id`);
	const lotes = z.array(z.object({ flujo_id: z.uuid(), lotes: z.number() })).parse(candados);
	const { rows: delTaller } = await base.execute(sql`
		SELECT id AS persona_id, nombre FROM personas WHERE area = 'taller' AND baja_en IS NULL ORDER BY nombre`);
	const { rows: catalogo } = await base.execute(
		sql`SELECT nombre FROM operaciones WHERE baja_en IS NULL AND NOT es_corte ORDER BY nombre`,
	);
	const flujos = [...new Map(operaciones.map((una) => [una.flujo_id, una])).values()];
	return {
		resultado: {
			flujos: flujos.map((flujo) => ({
				flujo_id: flujo.flujo_id,
				nombre: flujo.flujo,
				version: flujo.flujo_version,
				prendas: prendas.filter((prenda) => prenda.flujo_id === flujo.flujo_id).map((prenda) => prenda.nombre),
				lotes_en_proceso: lotes.find((uno) => uno.flujo_id === flujo.flujo_id)?.lotes ?? 0,
				operaciones: operaciones
					.filter((una) => una.flujo_id === flujo.flujo_id)
					.map((una) => ({
						flujo_operacion_id: una.flujo_operacion_id,
						operacion: una.operacion,
						es_corte: una.es_corte,
						persona_id: una.persona_id,
						persona: una.persona,
						sin_tarifa: una.tarifa_centavos === null,
						tarifa_centavos: una.tarifa_centavos,
					})),
			})),
			personas: z.array(z.object({ persona_id: z.uuid(), nombre: z.string() })).parse(delTaller),
			catalogo: z
				.array(z.object({ nombre: z.string() }))
				.parse(catalogo)
				.map((una) => una.nombre),
			antes_por_omision: String(
				await contexto.lectura("admin.parametro", { clave: "produccion.operacion_antes_por_omision" }),
			),
		},
	};
});
