/**
 * Las variables de entorno de la API y el worker, leídas y validadas una sola vez al arrancar.
 * Fase 2 · docs/cimientos/SEGURIDAD.md («Secretos y variables de entorno») y docs/cimientos/INFRAESTRUCTURA.md
 *
 * Hoy lee las de la base; cada fase que usa un servicio de fuera agrega las suyas aquí. Si falta una o
 * está mal, el proceso no arranca y dice cuál, sin enseñar su valor.
 */

import { z } from "zod";

const esquema = z.object({
	ENTORNO: z.enum(["local", "pruebas", "produccion"]),
	BASE_DATOS_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	BASE_DATOS_URL_DUENO: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});

/** Las variables ya validadas. */
export type Entorno = z.infer<typeof esquema>;

/**
 * Lee y valida las variables de entorno.
 * @param variables Las del proceso (`process.env`); las pruebas pasan las suyas.
 * @returns Las variables validadas.
 * @throws Error con los nombres de las que faltan o están mal, nunca con sus valores.
 */
export function leerEntorno(variables: NodeJS.ProcessEnv = process.env): Entorno {
	const resultado = esquema.safeParse(variables);
	if (!resultado.success) {
		const nombres = [...new Set(resultado.error.issues.map((problema) => problema.path.join(".")))];
		throw new Error(`Faltan o están mal estas variables de entorno: ${nombres.join(", ")}`);
	}
	return resultado.data;
}
