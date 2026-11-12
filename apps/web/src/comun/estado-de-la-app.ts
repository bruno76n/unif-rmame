/**
 * Lo que la web sabe de sí misma fuera de una pantalla: si hay conexión y si es más vieja que la versión mínima del
 * servidor. Cada pieza es una tienda chica que React lee con `useSyncExternalStore`.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: sin conexión y versión vieja)
 */

import { useSyncExternalStore } from "react";

/** La versión de esta web, la que va en `X-App-Version`. */
export const versionDeLaWeb = "1.0.0";

/** Quienes escuchan cuando cambia la versión vieja. */
const oyentesDeVersion = new Set<() => void>();
/** Si el servidor dijo que esta web ya es vieja. */
let esVieja = false;

/** El servidor contestó `426 actualizar`, o pide una versión mínima más nueva que esta. */
export function marcarVersionVieja(): void {
	esVieja = true;
	for (const oyente of oyentesDeVersion) oyente();
}

/** Si esta web es más vieja que la mínima del servidor. */
export function useVersionVieja(): boolean {
	return useSyncExternalStore(
		(oyente) => {
			oyentesDeVersion.add(oyente);
			return () => oyentesDeVersion.delete(oyente);
		},
		() => esVieja,
	);
}

/**
 * Si hay conexión: la del navegador, que avisa al irse y al volver.
 * Sin conexión, los botones que escriben se apagan y nada de lo capturado se pierde.
 */
export function useConConexion(): boolean {
	return useSyncExternalStore(
		(oyente) => {
			window.addEventListener("online", oyente);
			window.addEventListener("offline", oyente);
			return () => {
				window.removeEventListener("online", oyente);
				window.removeEventListener("offline", oyente);
			};
		},
		() => navigator.onLine,
	);
}
