/**
 * `admin.marcar_alerta_revisada`: la dueña marca revisada una alerta de seguridad.
 * Fase 4 · docs/modulos/admin/bitacora.md («`admin.marcar_alerta_revisada`»)
 *
 * La bitácora solo crece: la alerta no cambia. Queda revisada porque existe un renglón de esta acción que
 * apunta a ella. Un candado por alerta hace que dos revisiones a la vez dejen un solo renglón.
 */

import { marcarAlertaRevisada } from "@uniformame/compartido/contratos/admin/bitacora";
import { and, eq, sql } from "drizzle-orm";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { bitacora } from "../tablas.ts";

export const accionMarcarAlertaRevisada = implementarAccion(marcarAlertaRevisada, async (contexto, datos) => {
	const { transaccion } = contexto;
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`alerta:${datos.bitacora_id}`}))`);
	const [alerta] = await transaccion
		.select({ descripcion: bitacora.descripcion, esAlerta: bitacora.esAlerta })
		.from(bitacora)
		.where(eq(bitacora.id, datos.bitacora_id));
	if (alerta === undefined) throw noExiste();
	if (!alerta.esAlerta) throw errorDeRegla("no_es_alerta", "Ese renglón no es una alerta.");
	const [revision] = await transaccion
		.select({ id: bitacora.id })
		.from(bitacora)
		.where(
			and(
				eq(bitacora.accion, "admin.marcar_alerta_revisada"),
				eq(bitacora.entidad, "bitacora"),
				eq(bitacora.entidadId, datos.bitacora_id),
			),
		);
	if (revision !== undefined) throw errorDeRegla("ya_revisada", "Esa alerta ya se revisó.");
	const nota = datos.nota === undefined || datos.nota === "" ? "" : ` · ${datos.nota}`;
	contexto.bitacora({
		descripcion: `Revisó la alerta: ${alerta.descripcion}${nota}`,
		entidad: "bitacora",
		entidadId: datos.bitacora_id,
	});
	contexto.guardarEvento({
		tipo: "alerta.revisada",
		datos: { bitacora_id: datos.bitacora_id },
		tablas: ["bitacora"],
		entidad: "bitacora",
		entidadId: datos.bitacora_id,
	});
	return { resultado: { mensaje: "Alerta revisada" } };
});
