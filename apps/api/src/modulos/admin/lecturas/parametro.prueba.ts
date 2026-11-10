/**
 * Prueba de la lectura `admin.parametro` y de la siembra de los parámetros.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { sembrarSistema } from "../../../nucleo/base/siembra.ts";
import { versionMinimaDeLosParametros } from "../../../nucleo/parametros.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { semillasDePrueba } from "../../../nucleo/pruebas/modulos/prueba/siembra.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { semillaDeParametrosDeAdmin } from "../parametros.ts";

describe("la lectura con en da el valor de ese momento; la siembra no pisa un valor cambiado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee un parámetro dentro de una acción de prueba. */
	function leer(datos: Record<string, unknown>): Promise<unknown> {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("admin.parametro", datos),
		);
	}

	/** Cambia un parámetro como la dueña, con la versión que tiene ahora. */
	async function cambiar(clave: string, valor: unknown): Promise<void> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM parametros WHERE clave = $1", [clave]);
		const respuesta = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave, valor }, version: Number(rows[0]?.version) },
			"duena",
		);
		expect(respuesta.estado).toBe(200);
	}

	it("regresa el valor con su tipo; con en, el que valía en ese momento", async () => {
		expect(await leer({ clave: "prueba.tope" })).toBe(3);
		expect(await leer({ clave: "prueba.dia" })).toBe("martes");
		expect(await leer({ clave: "prueba.vacio" })).toBeNull();
		const antesDelCambio = (await servidor.base.dueno.query("SELECT now() AS ahora")).rows[0]?.ahora;
		await new Promise((listo) => setTimeout(listo, 20));
		await cambiar("prueba.tope", 8);
		expect(await leer({ clave: "prueba.tope" })).toBe(8);
		expect(await leer({ clave: "prueba.tope", en: new Date(antesDelCambio).toISOString() })).toBe(3);
		expect(await leer({ clave: "prueba.tope", en: Temporal.Now.instant().toString() })).toBe(8);
	});

	it("dentro de una acción, cada clave se lee una sola vez", async () => {
		const leidos = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
			const primero = await contexto.lectura("admin.parametro", { clave: "prueba.dia" });
			await servidor.base.dueno.query("UPDATE parametros SET valor_texto = 'lunes' WHERE clave = 'prueba.dia'");
			const segundo = await contexto.lectura("admin.parametro", { clave: "prueba.dia" });
			return [primero, segundo];
		});
		expect(leidos).toEqual(["martes", "martes"]);
		await servidor.base.dueno.query("UPDATE parametros SET valor_texto = 'martes' WHERE clave = 'prueba.dia'");
	});

	it("la siembra otra vez no pisa el valor que cambió la dueña ni repite su historial", async () => {
		await cambiar("prueba.hora", "03:30");
		const { rows: antes } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM parametros_historial");
		expect(
			await sembrarSistema(crearBase(servidor.base.dueno), [...semillasDePrueba, semillaDeParametrosDeAdmin]),
		).toBe(0);
		expect(await leer({ clave: "prueba.hora" })).toBe("03:30");
		const { rows: despues } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM parametros_historial");
		expect(despues[0]?.n).toBe(antes[0]?.n);
	});

	it("la versión mínima de cada app sale de su parámetro", async () => {
		const versionMinima = versionMinimaDeLosParametros(crearBase(servidor.base.app));
		expect(await versionMinima("web")).toBe("1.0.0");
		await cambiar("admin.version_minima_web", "1.2.0");
		expect(await versionMinima("web")).toBe("1.2.0");
		expect(await versionMinima("tablet")).toBe("1.0.0");
	});
});
