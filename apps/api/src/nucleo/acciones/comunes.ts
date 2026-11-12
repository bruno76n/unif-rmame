/**
 * Lo que comparten las acciones de los módulos: quién cambia, el motivo de una baja y el contexto con que se dibuja
 * una etiqueta o una hoja.
 * Fase 8 · docs/modulos/catalogo/ (las acciones con motivo); desde la fase 10, también Compras
 */

import { sql } from "drizzle-orm";
import { errorDeCampo } from "../http/errores.ts";
import type { ContextoDeAccion, ContextoDeConsulta } from "../modulos.ts";

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

/**
 * El contexto con que se dibuja una etiqueta o una hoja desde una acción: el de la acción, como lo ve quien la
 * pide. Dibujar no apunta consultas sensibles: las etiquetas y las hojas de una acción no llevan ninguna.
 * @param contexto El contexto de la acción.
 * @throws Si la pide el sistema: las etiquetas y las hojas siempre las pide una cuenta.
 */
export function contextoDeDibujo(contexto: ContextoDeAccion): ContextoDeConsulta {
	const { quien } = contexto;
	if (quien.tipo === "sistema") throw new Error("las etiquetas y las hojas las pide una cuenta");
	return {
		base: contexto.transaccion,
		quien,
		ahora: contexto.ahora,
		diaDeNegocio: contexto.diaDeNegocio,
		apuntarConsultaSensible: async () => undefined,
		registro: contexto.registro,
		lectura: contexto.lectura,
	};
}

/**
 * El nombre de una cuenta para un mensaje o la bitácora: el de su persona, o el de la cuenta.
 * @param contexto El contexto de la acción.
 * @param usuarioId La cuenta; sin ella, «el sistema».
 */
export async function nombreDeCuenta(contexto: ContextoDeAccion, usuarioId: string | null): Promise<string> {
	if (usuarioId === null) return "el sistema";
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT coalesce(p.nombre, u.nombre, u.correo) AS nombre FROM usuarios u LEFT JOIN personas p ON p.id = u.persona_id
		WHERE u.id = ${usuarioId}`);
	return String(rows[0]?.nombre ?? "otra cuenta");
}
