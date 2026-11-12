/**
 * `admin.aparatos_sin_sincronizar`: las tablets y cajas vigentes que hoy cumplen la regla del trabajo «Aparatos sin
 * sincronizar» (su última sincronización completa, o su registro, tiene `admin.horas_sin_sincronizar_aviso` o más),
 * aunque ya se haya avisado.
 * Fase 18 · docs/modulos/admin/dispositivos.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import { asc, eq, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { reglaSinSincronizar, tiempoParaLeer } from "../dominio/dispositivos.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

/**
 * Los aparatos sin sincronizar de este momento.
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 * @returns Por aparato: su id, su nombre, su ubicación, desde cuándo no sincroniza y ese tiempo para leer («5 horas»).
 */
export async function aparatosSinSincronizar(contexto: ContextoDeAccion) {
	const { desde, cumple } = await reglaSinSincronizar(contexto.transaccion, contexto.ahora);
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
		.where(cumple)
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
