/**
 * Prueba de la documentación de la API.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 5)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivoDeOpenapi, generarOpenapi } from "../../documentar.ts";
import { crearServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("openapi.json coincide con los contratos; /v1/documentacion existe en local y en producción responde 404", () => {
	it("openapi.json es exactamente lo que sale de los contratos de los módulos", async () => {
		expect(await generarOpenapi()).toBe(readFileSync(archivoDeOpenapi, "utf8"));
	});

	it("cada acción y consulta sale en el documento con su descripción y sus campos descritos en español", async () => {
		const documento = JSON.parse(await generarOpenapi(join(import.meta.dirname, "../pruebas/modulos")));
		const crear = documento.paths["/v1/acciones/prueba.crear_nota"].post;
		expect(crear.description).toBe("Crea una nota de prueba");
		const datos = crear.requestBody.content["application/json"].schema.properties.datos;
		expect(datos.properties.texto.description).toBe("El texto de la nota");
		expect(documento.paths["/v1/consultas/prueba.notas"].get).toBeDefined();
		expect(documento.paths["/v1/salud"]).toBeUndefined();
	});

	it("/v1/documentacion existe en local", async () => {
		const servidor = await crearServidorDePrueba({ entorno: "local" });
		try {
			// Scalar lleva a la dirección con diagonal final.
			const entrada = await servidor.app.inject({ method: "GET", url: "/v1/documentacion" });
			const destino = entrada.statusCode === 301 ? String(entrada.headers.location) : "/v1/documentacion";
			const pagina = await servidor.app.inject({ method: "GET", url: destino });
			expect(pagina.statusCode).toBe(200);
			expect(pagina.headers["content-type"]).toContain("text/html");
		} finally {
			await servidor.cerrar();
		}
	});

	it("/v1/documentacion responde 404 en producción", async () => {
		const servidor = await crearServidorDePrueba({ entorno: "produccion" });
		try {
			expect((await servidor.app.inject({ method: "GET", url: "/v1/documentacion" })).statusCode).toBe(404);
		} finally {
			await servidor.cerrar();
		}
	});
});
