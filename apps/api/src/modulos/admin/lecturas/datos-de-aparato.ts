/**
 * `admin.datos_de_aparato`: los datos de un aparato registrado, para los módulos que lo necesitan (el
 * puente de la impresión): su tipo, si está revocado, su nombre, su último contacto y su versión.
 * Fase 6 · docs/modulos/admin/dispositivos.md y docs/modulos/admin/impresion.md (reglas 1 y 6)
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ dispositivo_id: z.uuid() });

/**
 * Los datos del aparato.
 * @param contexto El contexto de la acción.
 * @param datos `dispositivo_id`.
 * @returns Sus datos, o `undefined` si no existe.
 */
export async function datosDeAparato(contexto: ContextoDeAccion, datos: unknown) {
	const [aparato] = await contexto.transaccion
		.select({
			tipo: dispositivos.tipo,
			bajaEn: dispositivos.bajaEn,
			nombre: dispositivos.nombre,
			ultimoContactoEn: dispositivosSync.ultimoContactoEn,
			versionApp: dispositivosSync.versionApp,
		})
		.from(dispositivos)
		.leftJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.where(eq(dispositivos.id, pedido.parse(datos).dispositivo_id));
	if (aparato === undefined) return undefined;
	return {
		tipo: aparato.tipo,
		revocado: aparato.bajaEn !== null,
		nombre: aparato.nombre,
		ultimo_contacto_en: aparato.ultimoContactoEn,
		version_app: aparato.versionApp,
	};
}
