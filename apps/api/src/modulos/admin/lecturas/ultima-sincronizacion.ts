/**
 * `admin.ultima_sincronizacion`: por ubicación y tipo de aparato, la última sincronización completa del
 * aparato vigente más reciente.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.ultima_sincronizacion`»)
 *
 * La usan Inventario (no ofrecer en línea la existencia de una tienda sin sincronizar), Producción («Sin
 * datos de la tablet») y Dirección. «Más reciente» es el último que se registró: el que reemplazó al
 * anterior.
 */

import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

/** Lo que recibe: opcionalmente, una ubicación y un tipo. */
const pedido = z.object({ ubicacion_id: z.uuid().optional(), tipo: z.string().optional() });

/**
 * La última sincronización completa por ubicación y tipo.
 * @param contexto El contexto de la acción.
 * @param datos `ubicacion_id` y `tipo`, opcionales.
 * @returns Un renglón por ubicación y tipo: el aparato vigente más reciente y su última sincronización
 * completa (nula si nunca sincronizó).
 */
export async function ultimaSincronizacion(contexto: ContextoDeAccion, datos: unknown) {
	const { ubicacion_id: ubicacionId, tipo } = pedido.parse(datos);
	const condiciones: SQL[] = [isNull(dispositivos.bajaEn)];
	if (ubicacionId !== undefined) condiciones.push(eq(dispositivos.ubicacionId, ubicacionId));
	if (tipo !== undefined) condiciones.push(eq(dispositivos.tipo, tipo));
	const vigentes = await contexto.transaccion
		.selectDistinctOn([dispositivos.ubicacionId, dispositivos.tipo], {
			ubicacionId: dispositivos.ubicacionId,
			tipo: dispositivos.tipo,
			dispositivoId: dispositivos.id,
			ultimaSincronizacionEn: dispositivosSync.ultimaSincronizacionEn,
		})
		.from(dispositivos)
		.leftJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.where(and(...condiciones))
		.orderBy(dispositivos.ubicacionId, dispositivos.tipo, desc(dispositivos.creadoEn), desc(dispositivos.id));
	return vigentes.map((aparato) => ({
		ubicacion_id: aparato.ubicacionId,
		tipo: aparato.tipo,
		dispositivo_id: aparato.dispositivoId,
		ultima_sincronizacion_en: aparato.ultimaSincronizacionEn,
	}));
}
