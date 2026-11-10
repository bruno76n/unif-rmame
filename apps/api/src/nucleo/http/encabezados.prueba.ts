/**
 * Prueba de los encabezados: el Origin de las acciones y la versión de la app.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	crearServidorDePrueba,
	dominios,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../pruebas/servidor-de-prueba.ts";

describe("una acción con un Origin ajeno responde 403 origen_no_valido; una llamada sin versión o con versión vieja, 426", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una acción válida con los encabezados que se le den. */
	function crear(encabezados: Record<string, string>) {
		return servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: encabezados,
			payload: {
				clave_idempotencia: crypto.randomUUID().replace(/^(.{14})./, "$17"),
				datos: { texto: "x", monto_centavos: 1 },
			},
		});
	}

	it("una acción de la web con un Origin ajeno, o sin Origin, responde 403 origen_no_valido", async () => {
		const ajeno = await crear({ ...encabezadosDeLaWeb(), origin: "https://otro.invalid" });
		expect(ajeno.statusCode).toBe(403);
		expect(ajeno.json()).toMatchObject({ error: "sin_permiso", codigo: "origen_no_valido" });
		const { origin: _quitado, ...sinOrigen } = encabezadosDeLaWeb();
		expect((await crear(sinOrigen)).statusCode).toBe(403);
		expect((await crear({ ...encabezadosDeLaWeb(), origin: dominios.DOMINIO_TALLER })).statusCode).toBe(403);
	});

	it("con el Origin de la web, la acción pasa", async () => {
		expect((await crear(encabezadosDeLaWeb())).statusCode).toBe(200);
	});

	it("sin versión o con versión vieja responde 426, contra la mayor de las dos mínimas", async () => {
		const { "x-app-version": _quitada, ...sinVersion } = encabezadosDeLaWeb();
		expect((await crear(sinVersion)).statusCode).toBe(426);
		// La mínima del código es 1.0.0; si el parámetro de la dueña pide 1.2.0, vale 1.2.0.
		servidor.parametros.versionMinima = "1.2.0";
		const vieja = await crear({ ...encabezadosDeLaWeb(), "x-app-version": "1.1.9" });
		expect(vieja.statusCode).toBe(426);
		expect(vieja.json()).toMatchObject({ version_minima: "1.2.0" });
		expect((await crear({ ...encabezadosDeLaWeb(), "x-app-version": "1.2.0" })).statusCode).toBe(200);
		// Un parámetro menor que la del código no la baja.
		servidor.parametros.versionMinima = "0.5.0";
		expect((await crear({ ...encabezadosDeLaWeb(), "x-app-version": "0.9.0" })).json()).toMatchObject({
			version_minima: "1.0.0",
		});
		servidor.parametros.versionMinima = "1.0.0";
	});

	it("la API contesta CORS solo a sus dos sitios: la web con credenciales y la tablet sin ellas", async () => {
		const deLaWeb = await servidor.app.inject({
			method: "OPTIONS",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { origin: dominios.DOMINIO_WEB, "access-control-request-method": "POST" },
		});
		expect(deLaWeb.headers["access-control-allow-origin"]).toBe(dominios.DOMINIO_WEB);
		expect(deLaWeb.headers["access-control-allow-credentials"]).toBe("true");
		const deLaTablet = await servidor.app.inject({
			method: "OPTIONS",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { origin: dominios.DOMINIO_TALLER, "access-control-request-method": "POST" },
		});
		expect(deLaTablet.headers["access-control-allow-origin"]).toBe(dominios.DOMINIO_TALLER);
		expect(deLaTablet.headers["access-control-allow-credentials"]).toBeUndefined();
		const ajeno = await servidor.app.inject({
			method: "OPTIONS",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { origin: "https://otro.invalid", "access-control-request-method": "POST" },
		});
		expect(ajeno.headers["access-control-allow-origin"]).toBeUndefined();
	});

	it("lleva los encabezados de seguridad", async () => {
		const respuesta = await crear(encabezadosDeLaWeb());
		expect(respuesta.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
		expect(respuesta.headers["x-content-type-options"]).toBe("nosniff");
		expect(respuesta.headers["referrer-policy"]).toBe("no-referrer");
		expect(respuesta.headers["cross-origin-resource-policy"]).toBe("same-site");
		expect(respuesta.headers["x-powered-by"]).toBeUndefined();
	});
});
