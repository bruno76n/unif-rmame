/**
 * `admin.mis_sesiones`: las sesiones abiertas de la cuenta, para «Mis sesiones».
 * Fase 19 · docs/interfaz/comunes.md («Mis sesiones», «`admin.mis_sesiones`»)
 */

import { misSesiones } from "@uniformame/compartido/contratos/admin/armazon";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { sesiones } from "../tablas.ts";

export const consultaMisSesiones = implementarConsulta(misSesiones, async ({ base, quien, ahora }) => {
	if (quien.tipo !== "cuenta") throw noExiste();
	const abiertas = await base
		.select()
		.from(sesiones)
		.where(
			and(eq(sesiones.usuarioId, quien.usuarioId), isNull(sesiones.cerradaEn), gt(sesiones.venceEn, ahora.toString())),
		)
		.orderBy(desc(sesiones.ultimaActividadEn), desc(sesiones.id));
	return {
		resultado: {
			sesiones: abiertas.map((sesion) => ({
				id: sesion.id,
				aparato: sesion.aparato,
				ciudad: sesion.ciudadAproximada,
				ip: sesion.ip,
				entro_en: new Date(sesion.creadoEn).toISOString(),
				ultima_actividad_en: new Date(sesion.ultimaActividadEn).toISOString(),
				es_esta: sesion.id === quien.sesionId,
			})),
		},
	};
});
