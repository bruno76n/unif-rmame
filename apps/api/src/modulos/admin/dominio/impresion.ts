/**
 * Lo que comparten las acciones de impresión: el aparato del puente y si su impresora está conectada.
 * Fase 4 · docs/modulos/admin/impresion.md (reglas 1 y 6)
 */

import { compararVersiones, versionMinima } from "@uniformame/compartido/contratos/versiones";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/**
 * La lectura que da los datos de un aparato registrado: su tipo, si está revocado, su nombre, su último
 * contacto y la versión con que llamó (`lecturas/datos-de-aparato.ts`).
 */
export const lecturaDeAparato = "admin.datos_de_aparato";

/** Lo que regresa esa lectura. */
const datosDeAparato = z
	.object({
		tipo: z.string(),
		revocado: z.boolean(),
		nombre: z.string(),
		ultimo_contacto_en: z.string().nullable(),
		version_app: z.string().nullable(),
	})
	.optional();

/** Los datos de un aparato, o `undefined` si no existe. */
export async function datosDelAparato(contexto: ContextoDeAccion, dispositivoId: string) {
	return datosDeAparato.parse(await contexto.lectura(lecturaDeAparato, { dispositivo_id: dispositivoId }));
}

/** El tipo de aparato del programa puente. */
export const tipoPuente = "puente_impresion";

/**
 * Dice si el puente de una impresora está conectado: es un puente sin revocar, dio señales en los últimos
 * `admin.minutos_puente_sin_contacto` y llamó con una versión que no es menor que la mínima.
 * @param contexto El contexto de la acción.
 * @param dispositivoId El puente de la impresora, si tiene.
 */
export async function puenteConectado(contexto: ContextoDeAccion, dispositivoId: string | null): Promise<boolean> {
	if (dispositivoId === null) return false;
	const aparato = await datosDelAparato(contexto, dispositivoId);
	if (aparato === undefined || aparato.tipo !== tipoPuente || aparato.revocado) return false;
	if (aparato.ultimo_contacto_en === null || aparato.version_app === null) return false;
	const minutos = Number(await contexto.lectura("admin.parametro", { clave: "admin.minutos_puente_sin_contacto" }));
	const desde = contexto.ahora.subtract({ minutes: minutos }).epochMilliseconds;
	if (new Date(aparato.ultimo_contacto_en).getTime() < desde) return false;
	const delParametro = String(await contexto.lectura("admin.parametro", { clave: "admin.version_minima_puente" }));
	return (compararVersiones(aparato.version_app, versionMinima("puente", delParametro)) ?? -1) >= 0;
}
