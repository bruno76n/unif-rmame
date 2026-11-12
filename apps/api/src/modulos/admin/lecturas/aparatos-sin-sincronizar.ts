/**
 * `admin.aparatos_sin_sincronizar`: las tablets y cajas vigentes que hoy cumplen la regla del trabajo «Aparatos sin
 * sincronizar» (su última sincronización completa, o su registro, tiene `admin.horas_sin_sincronizar_aviso` o más),
 * aunque ya se haya avisado.
 * Fase 18 · docs/modulos/admin/dispositivos.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";
import { tiempoParaLeer, tiposQueSincronizan } from "../trabajos/aparatos-sin-sincronizar.ts";

/**
 * Los aparatos sin sincronizar de este momento.
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 * @returns Por aparato: su id, su nombre, su ubicación, desde cuándo no sincroniza y ese tiempo para leer («5 horas»).
 */
export async function aparatosSinSincronizar(contexto: ContextoDeAccion) {
	const horas = Number(await leerParametro(contexto.transaccion, { clave: "admin.horas_sin_sincronizar_aviso" }));
	const limite = contexto.ahora.subtract({ hours: horas }).toString();
	const desde = sql<string>`coalesce(${dispositivosSync.ultimaSincronizacionEn}, ${dispositivos.creadoEn})`;
	const aparatos = await contexto.transaccion
		.select({
			dispositivo_id: dispositivos.id,
			nombre: dispositivos.nombre,
			ubicacion: ubicaciones.nombre,
			desde: sql<string>`to_char(${desde} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		})
		.from(dispositivos)
		.innerJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.leftJoin(ubicaciones, eq(ubicaciones.id, dispositivos.ubicacionId))
		.where(
			and(inArray(dispositivos.tipo, tiposQueSincronizan), isNull(dispositivos.bajaEn), sql`${desde} <= ${limite}`),
		)
		.orderBy(asc(desde));
	return {
		aparatos: aparatos.map((aparato) => ({
			...aparato,
			sin_sincronizar: tiempoParaLeer(
				Math.floor(Temporal.Instant.from(aparato.desde).until(contexto.ahora).total("hours")),
			),
		})),
	};
}
