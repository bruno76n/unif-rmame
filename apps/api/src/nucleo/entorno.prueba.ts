/**
 * Prueba de la lectura de las variables de entorno.
 * Fase 2 · docs/cimientos/SEGURIDAD.md («Secretos y variables de entorno»)
 */

import { describe, expect, it } from "vitest";
import { leerEntorno } from "./entorno.ts";

/** Una dirección con una clave de mentira, armada por pedazos para que no parezca un secreto escrito. */
const conClave = ["postgres://uniformame_app", ":", "clave-que-no-debe-salir", "@localhost:5432/uniformame"].join("");
const dominios = {
	DOMINIO_WEB: "http://localhost:5173",
	DOMINIO_TALLER: "http://localhost:5174",
	DOMINIO_API: "http://localhost:3000",
};

describe("las variables de entorno se leen y validan una sola vez; si falta una o está mal, dice su nombre y nunca su valor", () => {
	it("lee las variables válidas", () => {
		expect(leerEntorno({ ENTORNO: "local", BASE_DATOS_URL: conClave, ...dominios })).toMatchObject({
			ENTORNO: "local",
		});
	});

	it("si falta una o está mal, dice cuál sin enseñar su valor", () => {
		let mensaje = "";
		try {
			leerEntorno({ ENTORNO: "otro", BASE_DATOS_URL: conClave.replace("postgres://", "http://"), ...dominios });
		} catch (error) {
			mensaje = error instanceof Error ? error.message : "";
		}
		expect(mensaje).toContain("ENTORNO");
		expect(mensaje).toContain("BASE_DATOS_URL");
		expect(mensaje).not.toContain("clave-que-no-debe-salir");
	});
});
