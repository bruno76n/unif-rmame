/**
 * `personal.personas`: la lista de Personal · Personas, por área.
 * Fase 7 · docs/interfaz/fabrica/personal.md («Personas») y docs/modulos/personal/personas.md (decisión 420)
 *
 * El pago por día solo viaja con «Ver tarifas», que pide «ven sueldos y tarifas» y deja en la bitácora
 * «Consultó las tarifas del personal» (consulta sensible). El promedio por operación de quien cobra por pieza
 * llega con los registros de la tablet (fase 12).
 * Fase 19 · con «Ver tarifas», quien cobra por pieza lleva el promedio de las tarifas vigentes de las operaciones que
 * hace de base (`tarifa_centavos`, un campo de sueldo que el recorte común quita sin el permiso); y la lista trae las
 * tiendas del filtro y si la cuenta puede pedir las tarifas.
 */

import { areas, formasDePago, personasDeLaLista } from "@uniformame/compartido/contratos/personal/personas";
import { and, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import type { Base } from "../../../nucleo/base/conexion.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { pedirPermisoDeSueldos } from "../dominio/personas.ts";
import { porDondeEntran } from "../lecturas/entra-al-sistema.ts";
import { personas } from "../tablas.ts";
import { tiendasParaEscoger } from "./comun.ts";

/**
 * Por persona, el promedio de las tarifas vigentes de las operaciones vigentes que hace de base, redondeado al centavo.
 * @param base La base.
 * @returns Solo las personas que tienen alguna.
 */
async function tarifasPromedio(base: Base): Promise<Map<string, number>> {
	const { rows } = await base.execute(sql`
		SELECT f.persona_base_id AS persona_id, round(avg(t.tarifa_centavos))::int AS promedio
		FROM flujo_operaciones f
		JOIN flujos fl ON fl.id = f.flujo_id AND fl.baja_en IS NULL
		JOIN tarifas_operacion t ON t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL
		WHERE f.baja_en IS NULL
		GROUP BY f.persona_base_id`);
	const leidas = z.array(z.object({ persona_id: z.uuid(), promedio: z.number().int() })).parse(rows);
	return new Map(leidas.map((leida) => [leida.persona_id, leida.promedio]));
}

/**
 * El filtro del área: una activa de esa área (y de esa tienda), las dadas de baja, o todas.
 * @param area El área pedida, o `baja`.
 * @param ubicacionId La tienda, si se pidió una.
 */
function filtroDeArea(area: string | undefined, ubicacionId: string | undefined): SQL | undefined {
	if (area === undefined) return undefined;
	if (area === "baja") return isNotNull(personas.bajaEn);
	return and(
		isNull(personas.bajaEn),
		eq(personas.area, area),
		ubicacionId === undefined ? undefined : eq(personas.ubicacionId, ubicacionId),
	);
}

export const consultaPersonas = implementarConsulta(personasDeLaLista, async (contexto, parametros) => {
	const verTarifas = parametros.ver_tarifas === "si";
	if (verTarifas) {
		pedirPermisoDeSueldos(contexto);
		await contexto.apuntarConsultaSensible({ descripcion: "Consultó las tarifas del personal", entidad: "personas" });
	}
	const leidas = await contexto.base
		.select()
		.from(personas)
		.where(filtroDeArea(parametros.area, parametros.ubicacion_id))
		.orderBy(personas.area, personas.nombre);
	const promedios = verTarifas ? await tarifasPromedio(contexto.base) : new Map<string, number>();
	const entran = await porDondeEntran(
		contexto.base,
		leidas.map((persona) => persona.id),
	);
	return {
		resultado: {
			personas: leidas.map((persona) => ({
				id: persona.id,
				folio: persona.folio,
				nombre: persona.nombre,
				area: z.enum(areas).parse(persona.area),
				ubicacion_id: persona.ubicacionId,
				puesto: persona.puesto,
				forma_pago: z.enum(formasDePago).parse(persona.formaPago),
				...(verTarifas
					? {
							pago_dia_centavos: persona.pagoDiaCentavos,
							tarifa_centavos: persona.formaPago === "pieza" ? (promedios.get(persona.id) ?? null) : null,
						}
					: {}),
				fecha_ingreso: persona.fechaIngreso,
				baja_en: persona.bajaEn,
				entra_al_sistema: entran.get(persona.id) ?? "",
			})),
			tiendas: await tiendasParaEscoger(contexto.base),
			ve_sueldos: veSueldosYTarifas(contexto.quien),
		},
	};
});
