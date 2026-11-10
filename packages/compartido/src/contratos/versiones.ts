/**
 * La versión mínima de cada app que pide el código, junto a los contratos.
 * Fase 3 · docs/cimientos/API.md («La versión de la app»)
 *
 * La mínima que vale es la mayor entre esta y su parámetro (`admin.version_minima_web`…). La fase que
 * rompe un contrato que usa un aparato sube aquí la de esa app.
 */

/** Las apps que mandan `X-App-Version`. La caja llega con el POS. */
export type App = "web" | "tablet" | "puente";

/** La mínima de cada app según el código. */
export const versionesMinimasDelCodigo: Record<App, string> = {
	web: "1.0.0",
	tablet: "1.0.0",
	puente: "1.0.0",
};

/**
 * Compara dos versiones `mayor.menor.parche`.
 * @returns Negativo si `a` es menor, cero si son iguales, positivo si `a` es mayor; `undefined` si alguna
 * no tiene la forma.
 */
export function compararVersiones(a: string, b: string): number | undefined {
	const forma = /^(\d+)\.(\d+)\.(\d+)$/;
	const pa = forma.exec(a);
	const pb = forma.exec(b);
	if (pa === null || pb === null) return undefined;
	for (let i = 1; i <= 3; i++) {
		const diferencia = Number(pa[i]) - Number(pb[i]);
		if (diferencia !== 0) return diferencia;
	}
	return 0;
}

/**
 * La mínima que vale: la mayor entre la del código y la del parámetro.
 * @param app La app.
 * @param delParametro La del parámetro de la dueña.
 */
export function versionMinima(app: App, delParametro: string): string {
	const delCodigo = versionesMinimasDelCodigo[app];
	return (compararVersiones(delParametro, delCodigo) ?? -1) > 0 ? delParametro : delCodigo;
}
