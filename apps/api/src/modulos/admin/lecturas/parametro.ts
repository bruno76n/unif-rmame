/**
 * `admin.parametro`: el valor de un parámetro para los demás módulos.
 * Fase 4 · docs/modulos/admin/configuracion.md («`admin.parametro`»)
 *
 * Regresa el valor vigente, ya con su tipo, o con `en` el que valía en ese momento (del historial). Dentro
 * de una acción, cada clave se lee una sola vez y se recuerda hasta que la acción termina.
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro, type ValorDeParametro } from "../../../nucleo/parametros.ts";

/** Lo que recibe. */
const pedido = z.object({
	clave: z.string().min(1),
	ubicacion_id: z.uuid().optional(),
	en: z.string().optional(),
});

/** Lo ya leído en cada acción, por clave, ubicación y momento. */
const leidos = new WeakMap<ContextoDeAccion, Map<string, ValorDeParametro>>();

/**
 * Lee un parámetro en la transacción de la acción.
 * @param contexto El contexto de la acción.
 * @param datos `clave`, `ubicacion_id` (opcional) y `en` (opcional).
 * @returns El valor con su tipo.
 */
export async function parametro(contexto: ContextoDeAccion, datos: unknown): Promise<ValorDeParametro> {
	const { clave, ubicacion_id, en } = pedido.parse(datos);
	const llave = `${clave}|${ubicacion_id ?? ""}|${en ?? ""}`;
	const deEstaAccion = leidos.get(contexto) ?? new Map<string, ValorDeParametro>();
	leidos.set(contexto, deEstaAccion);
	if (deEstaAccion.has(llave)) return deEstaAccion.get(llave) ?? null;
	const valor = await leerParametro(contexto.transaccion, { clave, ubicacionId: ubicacion_id, en });
	deEstaAccion.set(llave, valor);
	return valor;
}
