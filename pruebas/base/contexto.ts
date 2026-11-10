/**
 * Lo que el arranque de las pruebas le pasa a cada archivo: dónde está el Postgres de las pruebas.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Postgres real»)
 *
 * Lo llena `apps/api/src/nucleo/base/plantilla-de-pruebas.ts` con `provide` y lo lee cada archivo con `inject`.
 */

/** El Postgres que levantó Testcontainers para la corrida. */
export interface BaseDePruebasCompartida {
	host: string;
	puerto: number;
	/** El rol dueño: crea las bases copia y aplica lo que la prueba necesita. */
	dueno: { usuario: string; clave: string };
	/** El rol de la app, el mismo con que se conectan la API y el worker. */
	app: { usuario: string; clave: string };
	/** La base con las migraciones y la siembra ya aplicadas, de la que se copia cada archivo. */
	plantilla: string;
}

declare module "vitest" {
	export interface ProvidedContext {
		baseDePruebas: BaseDePruebasCompartida;
	}
}
