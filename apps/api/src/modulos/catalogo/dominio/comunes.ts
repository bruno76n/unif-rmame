/**
 * Lo que comparten las acciones del catálogo: quién cambia y el motivo de una baja.
 * Fase 8 · docs/modulos/catalogo/ (las acciones con motivo)
 */

import { errorDeCampo } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/**
 * La cuenta que hace el cambio, o nada si es el sistema.
 * @param contexto El contexto de la acción.
 */
export function quienCambia(contexto: ContextoDeAccion): string | null {
	return contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
}

/**
 * Revisa que el motivo tenga al menos `general.largo_minimo_motivo` letras.
 * @param contexto El contexto de la acción.
 * @param motivo El motivo que escribió.
 * @throws `400` en `motivo`: «Escribe al menos {n} letras.».
 */
export async function revisarMotivo(contexto: ContextoDeAccion, motivo: string): Promise<void> {
	const minimo = Number(await contexto.lectura("admin.parametro", { clave: "general.largo_minimo_motivo" }));
	if (motivo.trim().length < minimo) throw errorDeCampo("motivo", `Escribe al menos ${minimo} letras.`);
}
