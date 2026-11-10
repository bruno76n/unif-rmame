/**
 * `personal.personas`: la lista de Personal · Personas, por área.
 * Fase 7 · docs/interfaz/fabrica/personal.md («Personas») y docs/modulos/personal/personas.md (decisión 420)
 *
 * El pago por día solo viaja con «Ver tarifas», que pide «ven sueldos y tarifas» y deja en la bitácora
 * «Consultó las tarifas del personal» (consulta sensible). El promedio por operación de quien cobra por pieza
 * llega con los registros de la tablet (fase 12).
 */

import { areas, formasDePago, personasDeLaLista } from "@uniformame/compartido/contratos/personal/personas";
import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { pedirPermisoDeSueldos } from "../dominio/personas.ts";
import { porDondeEntran } from "../lecturas/entra-al-sistema.ts";
import { personas } from "../tablas.ts";

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
				...(verTarifas ? { pago_dia_centavos: persona.pagoDiaCentavos } : {}),
				fecha_ingreso: persona.fechaIngreso,
				baja_en: persona.bajaEn,
				entra_al_sistema: entran.get(persona.id) ?? "",
			})),
		},
	};
});
