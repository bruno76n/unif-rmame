/**
 * `admin.aparatos_sin_sincronizar`: avisa a la dueña de la tablet o la caja que lleva horas sin sincronizar.
 * Fase 6 · docs/modulos/admin/dispositivos.md («Aparatos sin sincronizar»)
 *
 * Corre cada `admin.minutos_revisar_sincronizacion`. Un aparato vigente cuya última sincronización completa
 * (o su registro, si nunca sincronizó) tiene `admin.horas_sin_sincronizar_aviso` o más avisa una vez por
 * episodio: `aviso_sin_sincronizar_en` lo marca, y la bajada lo limpia cuando el aparato vuelve a sincronizar.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { reglaSinSincronizar, tiempoParaLeer } from "../dominio/dispositivos.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

/**
 * Avisa de cada aparato que lleva el tiempo sin sincronizar y todavía no tiene su aviso.
 * @param contexto El contexto de la transacción del trabajo.
 */
async function avisarLosSinSincronizar(contexto: ContextoDeAccion): Promise<void> {
	const { transaccion, ahora } = contexto;
	const { desde, cumple } = await reglaSinSincronizar(transaccion, ahora);
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
		.where(and(cumple, isNull(dispositivosSync.avisoSinSincronizarEn)))
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
