/**
 * `personal.tarifas`: Personal · Tarifas.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Tarifas») y docs/modulos/personal/tarifas.md
 *
 * Solo con «ven sueldos y tarifas» (lo pide el contrato y, aquí, `pedirPermisoDeSueldos`, que tampoco deja pasar a
 * soporte), y cada lectura deja en la bitácora «Consultó las tarifas del personal» como consulta sensible. Una tarjeta
 * por flujo vigente, con sus operaciones vigentes en orden: quién la hace de base, su tarifa vigente desde cuándo y su
 * versión (o «Sin tarifa»); con el historial, las anteriores de la más reciente a la más vieja. Lee los flujos de
 * Producción solo para leer.
 */

import { tarifasDelPersonal } from "@uniformame/compartido/contratos/personal/tarifas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { pedirPermisoDeSueldos } from "../dominio/personas.ts";
import { operacionesSinTarifa } from "./comun.ts";

/** Una operación de un flujo, con su tarifa vigente si tiene. */
const operacionLeida = z.object({
	flujo_id: z.uuid(),
	flujo: z.string(),
	flujo_operacion_id: z.uuid(),
	operacion: z.string(),
	la_hace: z.string(),
	tarifa_centavos: z.coerce.number().int().nullable(),
	desde: z.string().nullable(),
	version: z.coerce.number().int().nullable(),
});

/** Una tarifa que ya no vale. */
const tarifaAnterior = z.object({
	flujo_operacion_id: z.uuid(),
	tarifa_centavos: z.coerce.number().int(),
	desde: z.string(),
	hasta: z.string(),
});

/** Un momento de la base, en texto ISO. */
const enIso = (momento: string) => new Date(momento).toISOString();

export const consultaTarifas = implementarConsulta(tarifasDelPersonal, async (contexto, parametros) => {
	pedirPermisoDeSueldos(contexto);
	await contexto.apuntarConsultaSensible({
		descripcion: "Consultó las tarifas del personal",
		entidad: "tarifas_operacion",
	});
	const delFlujo = parametros.flujo_id === undefined ? sql`` : sql`AND fl.id = ${parametros.flujo_id}`;
	const { rows } = await contexto.base.execute(sql`
		SELECT fl.id AS flujo_id, fl.nombre AS flujo, f.id AS flujo_operacion_id, o.nombre AS operacion,
			p.nombre AS la_hace, t.tarifa_centavos, t.vigente_desde::text AS desde, t.version
		FROM flujo_operaciones f
		JOIN flujos fl ON fl.id = f.flujo_id AND fl.baja_en IS NULL
		JOIN operaciones o ON o.id = f.operacion_id
		JOIN personas p ON p.id = f.persona_base_id
		LEFT JOIN tarifas_operacion t ON t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL
		WHERE f.baja_en IS NULL ${delFlujo}
		ORDER BY fl.nombre, fl.id, f.orden`);
	const operaciones = z.array(operacionLeida).parse(rows);
	// Las anteriores solo viajan si se pidió el historial.
	const anteriores =
		parametros.historial === "si" && operaciones.length > 0
			? z.array(tarifaAnterior).parse(
					(
						await contexto.base.execute(sql`
						SELECT flujo_operacion_id, tarifa_centavos, vigente_desde::text AS desde, vigente_hasta::text AS hasta
						FROM tarifas_operacion
						WHERE vigente_hasta IS NOT NULL AND flujo_operacion_id IN (${sql.join(
							operaciones.map((operacion) => sql`${operacion.flujo_operacion_id}`),
							sql`, `,
						)})
						ORDER BY vigente_desde DESC`)
					).rows,
				)
			: [];
	// Una tarjeta por flujo, con sus operaciones en el orden en que llegaron.
	const flujos = new Map<string, { flujo_id: string; nombre: string; operaciones: typeof operaciones }>();
	for (const operacion of operaciones) {
		const flujo = flujos.get(operacion.flujo_id) ?? {
			flujo_id: operacion.flujo_id,
			nombre: operacion.flujo,
			operaciones: [],
		};
		flujo.operaciones.push(operacion);
		flujos.set(operacion.flujo_id, flujo);
	}
	return {
		resultado: {
			sin_tarifa: (await operacionesSinTarifa(contexto.base)).length,
			flujos: [...flujos.values()].map((flujo) => ({
				flujo_id: flujo.flujo_id,
				nombre: flujo.nombre,
				operaciones: flujo.operaciones.map((operacion) => ({
					flujo_operacion_id: operacion.flujo_operacion_id,
					nombre: operacion.operacion,
					la_hace: operacion.la_hace,
					tarifa_centavos: operacion.tarifa_centavos,
					desde: operacion.desde === null ? null : enIso(operacion.desde),
					version: operacion.version,
					anteriores: anteriores
						.filter((anterior) => anterior.flujo_operacion_id === operacion.flujo_operacion_id)
						.map((anterior) => ({
							tarifa_centavos: anterior.tarifa_centavos,
							desde: enIso(anterior.desde),
							hasta: enIso(anterior.hasta),
						})),
				})),
			})),
		},
	};
});
