/**
 * Quién llama a la API: una cuenta con su sesión o un aparato con su llave.
 * Fase 3 · docs/cimientos/ACCESO-Y-PERMISOS.md («Cómo se revisa cada llamada»)
 *
 * Cómo se identifica llega en las fases 5 (la sesión de Google) y 6 (la llave del aparato). Aquí está
 * la forma que recibe el corredor; las pruebas la dan con un identificador de prueba.
 */

import type { App } from "@uniformame/compartido/contratos/versiones";
import type { Temporal } from "temporal-polyfill";

/** Una cuenta de la web, con su sesión. */
export interface CuentaQueLlama {
	tipo: "cuenta";
	usuarioId: string;
	sesionId: string;
	esDuena: boolean;
	/** La cuenta de soporte técnico: nunca recibe montos. */
	esSoporte: boolean;
	/** Sus departamentos efectivos. */
	departamentos: readonly string[];
	permisosFinos: readonly string[];
	/** La última vez que la sesión confirmó con Google. */
	confirmadoConGoogleEn: Temporal.Instant | undefined;
}

/** Un aparato con su llave. */
export interface AparatoQueLlama {
	tipo: "aparato";
	dispositivoId: string;
	tipoDeAparato: "tablet" | "puente";
	/** Quien lo usa en ese momento (la costurera con su PIN), si lo hay. */
	personaId: string | undefined;
}

/** Quién llama. */
export type QuienLlama = CuentaQueLlama | AparatoQueLlama;

/**
 * La app con la que llama, para revisar su versión mínima.
 * @param quien Quién llama.
 */
export function appDe(quien: QuienLlama): App {
	return quien.tipo === "cuenta" ? "web" : quien.tipoDeAparato;
}
