/**
 * Llamar con la llave del aparato que vale mientras la cambia: si guardó una nueva y no supo si el cambio se aplicó,
 * prueba primero la nueva; si la API no la conoce (`401 llave_invalida`), usa la vieja, que vale durante la gracia, y
 * olvida la nueva. Si la nueva entra, el cambio se aplicó y la vieja ya no sirve.
 * Fase 20 · docs/modulos/admin/dispositivos.md («`admin.rotar_llave`») · lo usan el puente y la tablet
 */

import { ErrorDeLaApi } from "./cliente.ts";

/** Los secretos del aparato: el que vale y, mientras cambia su llave, el nuevo. */
export interface SecretosDelAparato {
	secreto: string;
	secretoNuevo?: string | undefined;
}

/**
 * Si un error dice que la API no conoce la llave (no la revocada: la que no existe).
 * @param error Lo que pasó.
 */
export function llaveDesconocida(error: unknown): boolean {
	return error instanceof ErrorDeLaApi && error.estado === 401 && error.respuesta.codigo === "llave_invalida";
}

/**
 * Hace una llamada con la llave que vale.
 * @param secretos Los secretos guardados.
 * @param hacer La llamada, con el secreto que usa.
 * @param guardar Cómo queda: `secreto` el que vale desde ahora, sin nuevo.
 */
export async function conLaLlaveQueVale<T>(
	secretos: SecretosDelAparato,
	hacer: (secreto: string) => Promise<T>,
	guardar: (secreto: string) => Promise<void>,
): Promise<T> {
	const { secreto, secretoNuevo } = secretos;
	if (secretoNuevo !== undefined) {
		try {
			const hecho = await hacer(secretoNuevo);
			await guardar(secretoNuevo);
			return hecho;
		} catch (error) {
			if (!llaveDesconocida(error)) throw error;
			await guardar(secreto);
		}
	}
	return hacer(secreto);
}
