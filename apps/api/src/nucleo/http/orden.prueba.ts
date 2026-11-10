/**
 * Prueba del orden de las revisiones: nada que se rechace antes del permiso abre la transacción.
 * Fase 3 · docs/cimientos/MODULOS.md («Cómo corre una acción») y docs/cimientos/ACCESO-Y-PERMISOS.md
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, encabezadosDeLaWeb, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("quién llama, la versión, la forma y el permiso se revisan antes de abrir la transacción", () => {
	let servidor: ServidorDePrueba;
	/** Cuántas veces se tomó una conexión de la base de la app: una acción la toma al abrir su transacción. */
	let conexionesTomadas = 0;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		servidor.base.app.on("acquire", () => {
			conexionesTomadas++;
		});
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda una acción con los encabezados y los datos que se le den. */
	function mandar(nombre: string, encabezados: Record<string, string>, datos: unknown) {
		return servidor.app.inject({
			method: "POST",
			url: `/v1/acciones/${nombre}`,
			headers: encabezados,
			payload: { clave_idempotencia: nuevaClave(), datos },
		});
	}

	it.each([
		[
			"sin sesión (401)",
			"prueba.crear_nota",
			{ "x-app-version": "1.0.0" },
			{ texto: "x", monto_centavos: 1 },
			401,
			"sin_sesion",
		],
		[
			"con una app vieja (426)",
			"prueba.crear_nota",
			{ ...encabezadosDeLaWeb(), "x-app-version": "0.1.0" },
			{ texto: "x", monto_centavos: 1 },
			426,
			null,
		],
		["con datos mal formados (400)", "prueba.crear_nota", encabezadosDeLaWeb(), { texto: "" }, 400, null],
		[
			"sin el departamento (403)",
			"prueba.crear_nota",
			encabezadosDeLaWeb("aduana"),
			{ texto: "x", monto_centavos: 1 },
			403,
			"sin_departamento",
		],
		["sin el permiso fino (403)", "prueba.ver_montos", encabezadosDeLaWeb("ventas"), {}, 403, "sin_permiso_fino"],
		[
			"desde un aparato fuera de su alcance (403)",
			"prueba.crear_nota",
			{ "x-prueba-quien": "tablet", "x-app-version": "1.0.0" },
			{ texto: "x", monto_centavos: 1 },
			403,
			"fuera_de_alcance",
		],
	])("%s: se rechaza sin tomar la base", async (_caso, nombre, encabezados, datos, estado, codigo) => {
		const antes = conexionesTomadas;
		const respuesta = await mandar(nombre, encabezados, datos);
		expect(respuesta.statusCode).toBe(estado);
		if (codigo !== null) expect(respuesta.json()).toMatchObject({ codigo });
		expect(conexionesTomadas).toBe(antes);
	});

	it("con todo en orden, la acción sí toma la base", async () => {
		const antes = conexionesTomadas;
		expect(
			(await mandar("prueba.crear_nota", encabezadosDeLaWeb(), { texto: "x", monto_centavos: 1 })).statusCode,
		).toBe(200);
		expect(conexionesTomadas).toBeGreaterThan(antes);
	});
});
