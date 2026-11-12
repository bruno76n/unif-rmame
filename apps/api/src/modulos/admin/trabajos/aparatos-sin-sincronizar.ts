/**
 * `admin.aparatos_sin_sincronizar`: avisa a la dueña de la tablet o la caja que lleva horas sin sincronizar.
 * Fase 6 · docs/modulos/admin/dispositivos.md («Aparatos sin sincronizar»)
 *
 * Corre cada `admin.minutos_revisar_sincronizacion`. Un aparato vigente cuya última sincronización completa
 * (o su registro, si nunca sincronizó) tiene `admin.horas_sin_sincronizar_aviso` o más avisa una vez por
 * episodio: `aviso_sin_sincronizar_en` lo marca, y la bajada lo limpia cuando el aparato vuelve a sincronizar.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

/** Los tipos de aparato que trabajan sin internet y tienen que sincronizar: la tablet y, con el POS, la caja. */
export const tiposQueSincronizan = ["tablet_taller", "computadora_tienda"];

/**
 * El tiempo para leer: en horas hasta dos días, luego en días.
 * @param horas Las horas completas.
 */
export function tiempoParaLeer(horas: number): string {
	if (horas < 48) return horas === 1 ? "1 hora" : `${horas} horas`;
	return `${Math.floor(horas / 24)} días`;
}

/**
 * Avisa de cada aparato que lleva el tiempo sin sincronizar y todavía no tiene su aviso.
 * @param contexto El contexto de la transacción del trabajo.
 */
async function avisarLosSinSincronizar(contexto: ContextoDeAccion): Promise<void> {
	const { transaccion, ahora } = contexto;
	const horas = Number(await leerParametro(transaccion, { clave: "admin.horas_sin_sincronizar_aviso" }));
	const limite = ahora.subtract({ hours: horas }).toString();
	const desde = sql<string>`coalesce(${dispositivosSync.ultimaSincronizacionEn}, ${dispositivos.creadoEn})`;
	const pendientes = await transaccion
		.select({
			id: dispositivos.id,
			nombre: dispositivos.nombre,
			ubicacionId: dispositivos.ubicacionId,
			ubicacion: ubicaciones.nombre,
			desde,
		})
		.from(dispositivos)
		.innerJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.leftJoin(ubicaciones, eq(ubicaciones.id, dispositivos.ubicacionId))
		.where(
			and(
				inArray(dispositivos.tipo, tiposQueSincronizan),
				isNull(dispositivos.bajaEn),
				isNull(dispositivosSync.avisoSinSincronizarEn),
				sql`${desde} <= ${limite}`,
			),
		)
		.for("update", { of: dispositivosSync, skipLocked: true });
	for (const aparato of pendientes) {
		await transaccion
			.update(dispositivosSync)
			.set({ avisoSinSincronizarEn: ahora.toString(), actualizadoEn: sql`now()` })
			.where(eq(dispositivosSync.dispositivoId, aparato.id));
		const sinSincronizar = Math.floor(
			Temporal.Instant.from(new Date(aparato.desde).toISOString()).until(ahora).total("hours"),
		);
		await contexto.interna("admin.crear_aviso", {
			tipo: "dispositivo_sin_sincronizar",
			destinatarios: { regla: "duena" },
			texto: `${aparato.nombre} sin sincronizar desde hace ${tiempoParaLeer(sinSincronizar)}: ${aparato.ubicacion ?? "sin ubicación"} · ventas y existencia sin enviar`,
			enlace: "admin/dispositivos",
			entidad: "dispositivos",
			entidadId: aparato.id,
		});
		contexto.guardarEvento({
			tipo: "dispositivo.sin_sincronizar",
			datos: { dispositivo_id: aparato.id },
			tablas: ["dispositivos"],
			entidad: "dispositivos",
			entidadId: aparato.id,
			...(aparato.ubicacionId === null ? {} : { ubicacionIds: [aparato.ubicacionId] }),
		});
	}
}

export const aparatosSinSincronizar: Trabajo = {
	nombre: "admin.aparatos_sin_sincronizar",
	horario: async (contexto) => ({
		cada: "minutos",
		minutos: Number(await leerParametro(contexto.base, { clave: "admin.minutos_revisar_sincronizacion" })),
	}),
	correr: async (contexto) => {
		await contexto.enTransaccion(avisarLosSinSincronizar);
	},
};
