/**
 * Registrar el service worker y aplicar la versión nueva: se baja en segundo plano y espera; la tablet la aplica cuando
 * no hay nadie adentro y su cola está vacía, o cuando la API dice que su versión ya no sirve (`426`): entonces la cola
 * espera en la base y no se pierde.
 * Fase 20 · docs/apps/tablet.md («Cómo se actualiza»)
 */

/** Registra el service worker de la tablet, solo en la tablet construida (en desarrollo no hay `sw.js`). */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return null;
	return navigator.serviceWorker.register("/sw.js");
}

/**
 * Aplica la versión nueva: si hay una esperando, la activa; y recarga la tablet. Lo de la base se queda.
 * @param registro El registro del service worker, si hay.
 */
export async function aplicarVersionNueva(registro: ServiceWorkerRegistration | null): Promise<void> {
	await registro?.update().catch(() => undefined);
	const esperando = registro?.waiting;
	if (esperando !== undefined && esperando !== null) {
		navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
		esperando.postMessage("actualizar");
		return;
	}
	location.reload();
}

/**
 * Si ya bajó una versión nueva que espera.
 * @param registro El registro del service worker, si hay.
 */
export function hayVersionNueva(registro: ServiceWorkerRegistration | null): boolean {
	return registro?.waiting !== undefined && registro.waiting !== null;
}
