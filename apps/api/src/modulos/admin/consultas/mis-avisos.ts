/**
 * `admin.mis_avisos`: los avisos de la cuenta para la campana, por páginas, el más nuevo arriba.
 * Fase 19 · docs/interfaz/comunes.md («La barra superior», «`admin.mis_avisos`») y docs/modulos/admin/avisos.md
 */

import { misAvisos } from "@uniformame/compartido/contratos/admin/armazon";
import { and, count, desc, eq, isNull, lt, or, type SQL } from "drizzle-orm";
import { cursorDe, leerCursor } from "../../../nucleo/http/consultas.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { avisos } from "../tablas.ts";

/** Cuántos por página si no se pide otro número. */
const porPagina = 20;

export const consultaMisAvisos = implementarConsulta(misAvisos, async ({ base, quien }, parametros) => {
	if (quien.tipo !== "cuenta") throw noExiste();
	const suyos = eq(avisos.usuarioId, quien.usuarioId);
	const posicion = leerCursor(parametros.cursor);
	// Después de la página anterior: más viejo, o igual de viejo con un id menor.
	const despues: SQL | undefined =
		posicion === undefined
			? undefined
			: or(
					lt(avisos.creadoEn, String(posicion.creado_en)),
					and(eq(avisos.creadoEn, String(posicion.creado_en)), lt(avisos.id, String(posicion.id))),
				);
	const limite = parametros.limite ?? porPagina;
	const leidos = await base
		.select()
		.from(avisos)
		.where(and(suyos, parametros.solo_sin_leer === "si" ? isNull(avisos.leidoEn) : undefined, despues))
		.orderBy(desc(avisos.creadoEn), desc(avisos.id))
		.limit(limite + 1);
	const pagina = leidos.slice(0, limite);
	const ultimo = pagina.at(-1);
	const [sinLeer] = await base
		.select({ cuantos: count() })
		.from(avisos)
		.where(and(suyos, isNull(avisos.leidoEn)));
	return {
		resultado: {
			renglones: pagina.map((aviso) => ({
				id: aviso.id,
				tipo: aviso.tipo,
				texto: aviso.texto,
				enlace: aviso.enlace,
				creado_en: new Date(aviso.creadoEn).toISOString(),
				leido: aviso.leidoEn !== null,
			})),
			cursor:
				leidos.length > limite && ultimo !== undefined ? cursorDe({ creado_en: ultimo.creadoEn, id: ultimo.id }) : null,
			hay_mas: leidos.length > limite,
			sin_leer: sinLeer?.cuantos ?? 0,
		},
	};
});
