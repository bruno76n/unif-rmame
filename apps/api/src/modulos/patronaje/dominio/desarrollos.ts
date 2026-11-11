/**
 * Lo que comparten las acciones y las internas del desarrollo: leerlo con candado, revisar su etapa, cambiarla con
 * su paso en el historial y su evento.
 * Fase 10 · docs/modulos/patronaje/desarrollos.md (reglas 2, 3 y 6, «Estados»)
 */

import type { etapasDeDesarrollo } from "@uniformame/compartido/contratos/patronaje/desarrollos";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { type accionesDeDesarrollo, desarrolloEventos, desarrollos } from "../tablas.ts";

/** Una etapa de un desarrollo. */
export type Etapa = (typeof etapasDeDesarrollo)[number];

/** Un desarrollo como se guarda. */
export type Desarrollo = typeof desarrollos.$inferSelect;

/** Cómo se llama cada etapa en pantalla: `cancelado` es «Descartado». */
export const nombreDeEtapa: Readonly<Record<Etapa, string>> = {
	solicitud: "Solicitud",
	muestra: "Muestra",
	aprobacion: "Aprobación",
	ficha_tecnica: "Ficha técnica",
	en_catalogo: "En catálogo",
	cancelado: "Descartado",
};

/**
 * El nombre en pantalla de una etapa guardada.
 * @param etapa La etapa, como se guarda.
 */
export function nombreDe(etapa: string): string {
	return Object.entries(nombreDeEtapa).find(([clave]) => clave === etapa)?.[1] ?? etapa;
}

/**
 * Lee un desarrollo y lo bloquea.
 * @throws `404` si no existe.
 */
export async function leerDesarrollo(transaccion: Transaccion, id: string): Promise<Desarrollo> {
	const [desarrollo] = await transaccion.select().from(desarrollos).where(eq(desarrollos.id, id)).for("update");
	if (desarrollo === undefined) throw noExiste();
	return desarrollo;
}

/**
 * Revisa que el desarrollo esté en la etapa del paso.
 * @throws `422 etapa_no_permite`: «{DS} está en {etapa}: este paso ya no aplica.».
 */
export function revisarEtapa(desarrollo: Desarrollo, etapa: Etapa): void {
	if (desarrollo.etapa !== etapa) {
		throw errorDeRegla(
			"etapa_no_permite",
			`${desarrollo.folio} está en ${nombreDe(desarrollo.etapa)}: este paso ya no aplica.`,
		);
	}
}

/**
 * Cambia la etapa de un desarrollo con lo que cambia de sus columnas, escribe su paso en el historial y guarda
 * `desarrollo.cambiado`.
 * @param contexto El contexto de la acción.
 * @param desarrollo El desarrollo, ya bloqueado.
 * @param paso La etapa nueva, la acción del historial, lo que cambia, y el motivo y la AU-, si los hay.
 */
export async function avanzar(
	contexto: ContextoDeAccion,
	desarrollo: Desarrollo,
	paso: {
		etapa: Etapa;
		accion: (typeof accionesDeDesarrollo)[number];
		cambios?: Partial<typeof desarrollos.$inferInsert>;
		motivo?: string;
		autorizacionId?: string | null;
	},
): Promise<void> {
	await contexto.transaccion
		.update(desarrollos)
		.set({ etapa: paso.etapa, ...paso.cambios })
		.where(eq(desarrollos.id, desarrollo.id));
	await registrarPaso(contexto, desarrollo.id, {
		accion: paso.accion,
		etapaAntes: desarrollo.etapa,
		etapaDespues: paso.etapa,
		motivo: paso.motivo ?? null,
		autorizacionId: paso.autorizacionId ?? null,
	});
}

/**
 * Escribe un paso en el historial y guarda `desarrollo.cambiado`.
 * @param contexto El contexto de la acción.
 * @param desarrolloId El desarrollo.
 * @param paso Su acción, sus etapas, su motivo y su AU-.
 */
export async function registrarPaso(
	contexto: ContextoDeAccion,
	desarrolloId: string,
	paso: {
		accion: (typeof accionesDeDesarrollo)[number];
		etapaAntes: string | null;
		etapaDespues: Etapa;
		motivo: string | null;
		autorizacionId: string | null;
	},
): Promise<void> {
	await contexto.transaccion.insert(desarrolloEventos).values({
		id: uuidv7(),
		desarrolloId,
		...paso,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "desarrollo.cambiado",
		datos: { desarrollo_id: desarrolloId, etapa: paso.etapaDespues },
		tablas: ["desarrollos", "desarrollo_eventos"],
		entidad: "desarrollos",
		entidadId: desarrolloId,
	});
}
