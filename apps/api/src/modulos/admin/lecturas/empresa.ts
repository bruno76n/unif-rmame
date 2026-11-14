/**
 * `admin.empresa`: los datos de la empresa (el nombre comercial, la razón social, el RFC y el domicilio), para el
 * encabezado de las hojas en PDF.
 * Fase 20 · docs/impresos/hojas.md (regla 2) y docs/modulos/admin/configuracion.md («La tabla `empresa`»)
 *
 * Existe para que ningún módulo lea la tabla `empresa` por su cuenta.
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { empresa } from "../tablas.ts";

/** Lo que regresa. */
export const datosDeLaEmpresa = z.object({
	nombre_comercial: z.string(),
	razon_social: z.string(),
	rfc: z.string(),
	domicilio: z.string(),
});

/**
 * Los datos de la empresa.
 * @param contexto El contexto de quien pide la hoja.
 * @throws Error si no hay empresa: se captura en la puesta en marcha y en local la trae la muestra.
 */
export async function lecturaEmpresa(contexto: ContextoDeAccion): Promise<z.infer<typeof datosDeLaEmpresa>> {
	const [suya] = await contexto.transaccion
		.select({
			nombre_comercial: empresa.nombreComercial,
			razon_social: empresa.razonSocial,
			rfc: empresa.rfc,
			domicilio: empresa.domicilio,
		})
		.from(empresa);
	if (suya === undefined) throw new Error("no están capturados los datos de la empresa");
	return suya;
}
