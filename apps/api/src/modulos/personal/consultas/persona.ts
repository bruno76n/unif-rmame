/**
 * `personal.persona`: el cajón de una persona, o los valores del alta.
 * Fase 7 · docs/interfaz/fabrica/personal.md («La persona y «Nueva persona»») y docs/modulos/personal/personas.md
 *
 * Abrir la ficha de una persona deja en la bitácora «Consultó la ficha de {persona}» (consulta sensible).
 * El pago por día solo viaja con «ven sueldos y tarifas»: el recorte común se lo quita a quien no lo tiene.
 */

import {
	areas,
	persona as consultaDePersona,
	formasDePago,
	rolesDeTienda,
} from "@uniformame/compartido/contratos/personal/personas";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { porDondeEntran } from "../lecturas/entra-al-sistema.ts";
import { personas } from "../tablas.ts";

export const consultaPersona = implementarConsulta(consultaDePersona, async (contexto, parametros) => {
	if (parametros.persona_id === undefined) {
		// Los valores del alta: del Taller, por pieza, con ingreso hoy.
		return {
			resultado: {
				id: null,
				folio: null,
				nombre: "",
				area: "taller" as const,
				ubicacion_id: null,
				rol_tienda: null,
				puesto: "",
				forma_pago: "pieza" as const,
				pago_dia_centavos: null,
				fecha_ingreso: contexto.diaDeNegocio.toString(),
				baja_en: null,
				motivo_baja: null,
				entra_al_sistema: null,
				version: null,
			},
		};
	}
	const [persona] = await contexto.base.select().from(personas).where(eq(personas.id, parametros.persona_id));
	if (persona === undefined) throw noExiste();
	await contexto.apuntarConsultaSensible({
		descripcion: `Consultó la ficha de ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
	});
	const entran = await porDondeEntran(contexto.base, [persona.id]);
	return {
		resultado: {
			id: persona.id,
			folio: persona.folio,
			nombre: persona.nombre,
			area: z.enum(areas).parse(persona.area),
			ubicacion_id: persona.ubicacionId,
			rol_tienda: z.enum(rolesDeTienda).nullable().parse(persona.rolTienda),
			puesto: persona.puesto,
			forma_pago: z.enum(formasDePago).parse(persona.formaPago),
			pago_dia_centavos: persona.pagoDiaCentavos,
			fecha_ingreso: persona.fechaIngreso,
			baja_en: persona.bajaEn,
			motivo_baja: persona.motivoBaja,
			entra_al_sistema: entran.get(persona.id) ?? null,
			version: persona.version,
		},
	};
});
