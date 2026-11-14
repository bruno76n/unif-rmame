/**
 * Prueba de registrar el puente con su código contra la API real: canjea con el tipo `puente_impresion`, guarda su
 * configuración legible solo por su usuario y entra con su llave nueva; un código que no sirve regresa el mensaje de la
 * API; si se corta la respuesta, repite con la misma clave y el mismo secreto y queda un solo aparato.
 * Fase 20 · docs/apps/puente-de-impresion.md («La instalación», paso 3, y «La configuración»)
 */

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion } from "../../api/src/nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../api/src/nucleo/pruebas/servidor-de-prueba.ts";
import { crearApiDelPuente } from "./api.ts";
import { carpetaDeDatos, guardarConfiguracion, leerConfiguracion, leerDireccionDeZebra } from "./configuracion.ts";
import { registrar } from "./registrar.ts";

describe("registrar el puente con su código", () => {
	let servidor: ServidorDePrueba;
	let api: string;
	let carpeta: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		api = await servidor.app.listen({ host: "127.0.0.1", port: 0 });
		carpeta = await mkdtemp(join(tmpdir(), "registro-"));
		// Un programa de impresión va donde hay una impresora.
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'");
		await mandarAccion(
			servidor,
			"admin.guardar_impresora",
			{ datos: { nombre: "Zebra Aduana", modelo: "ZD421", ubicacion_id: rows[0]?.id } },
			"duena",
		);
	});
	afterAll(async () => {
		await servidor.cerrar();
		await rm(carpeta, { recursive: true, force: true });
	});

	/** La dueña da un código para un puente de Aduana. */
	async function codigoDePuente(): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'");
		const generado = await mandarAccion(
			servidor,
			"admin.generar_codigo_registro",
			{ datos: { nombre: "Puente nuevo de Aduana", tipo: "puente_impresion", ubicacion_id: rows[0]?.id } },
			"duena",
			conGoogle(),
		);
		if (generado.estado !== 200) throw new Error(JSON.stringify(generado.cuerpo));
		return z.object({ codigo: z.string() }).parse(generado.cuerpo.resultado).codigo;
	}

	it("canjea su código, guarda su configuración solo para su usuario y entra con su llave nueva", async () => {
		const suya = join(carpeta, "uno");
		const zebra = { direccion: "192.168.1.50", puerto: 9100 };
		const registro = await registrar({ api, codigo: await codigoDePuente(), zebra, carpeta: suya });
		expect(registro).toEqual({ registrado: true, mensaje: expect.stringMatching(/^Registrado como DV-/) });
		const configuracion = await leerConfiguracion(suya);
		expect(configuracion).toMatchObject({ api, zebra, intervalo_segundos: 60 });
		expect(configuracion?.secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect((await stat(join(suya, "puente.json"))).mode & 0o777).toBe(0o600);
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, version_app FROM dispositivos d JOIN dispositivos_sync s ON s.dispositivo_id = d.id WHERE d.llave_id = $1",
			[configuracion?.llave_id],
		);
		expect(rows).toEqual([{ tipo: "puente_impresion", version_app: "1.0.0" }]);
		const puente = crearApiDelPuente({
			leer: async () => (await leerConfiguracion(suya)) ?? Promise.reject(new Error("sin configuración")),
			guardar: (nueva) => guardarConfiguracion(suya, nueva),
		});
		expect(await puente.trabajos()).toMatchObject({ trabajos: [] });
	});

	it("un código que no sirve regresa el mensaje de la API y no guarda nada", async () => {
		const suya = join(carpeta, "dos");
		const registro = await registrar({
			api,
			codigo: "ZZZ-999",
			zebra: { direccion: "10.0.0.9", puerto: 9100 },
			carpeta: suya,
		});
		expect(registro).toEqual({ registrado: false, mensaje: "Ese código no existe o ya venció. Pide otro a la dueña." });
		expect(await leerConfiguracion(suya)).toBeNull();
	});

	it("si se corta la respuesta repite con la misma clave y el mismo secreto: queda un solo aparato", async () => {
		const suya = join(carpeta, "tres");
		const cuerpos: string[] = [];
		let cortar = true;
		const conCorte: typeof fetch = async (entrada, init) => {
			cuerpos.push(String(init?.body));
			const respuesta = await fetch(entrada, init);
			if (cortar) {
				cortar = false;
				throw new TypeError("fetch failed");
			}
			return respuesta;
		};
		const codigo = await codigoDePuente();
		const cuantos = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT count(*)::int AS cuantos FROM dispositivos WHERE nombre = 'Puente nuevo de Aduana'",
				)
			).rows[0]?.cuantos;
		const antes = await cuantos();
		const registro = await registrar({
			api,
			codigo,
			zebra: { direccion: "10.0.0.8", puerto: 9100 },
			carpeta: suya,
			fetch: conCorte,
			espera: 1,
		});
		expect(registro.registrado).toBe(true);
		expect(cuerpos).toHaveLength(2);
		expect(cuerpos[1]).toBe(cuerpos[0]);
		expect(await cuantos()).toBe(antes + 1);
	});

	it("la carpeta de datos es la del usuario, o la que se da; la dirección de la Zebra lleva el 9100 si no dice otro", () => {
		expect(carpetaDeDatos({}, "linux", "/home/aduana")).toBe("/home/aduana/.config/uniformame-puente");
		expect(carpetaDeDatos({ APPDATA: "C:\\Users\\Aduana\\AppData\\Roaming" }, "win32", "C:\\Users\\Aduana")).toBe(
			join("C:\\Users\\Aduana\\AppData\\Roaming", "Uniformame Puente"),
		);
		expect(carpetaDeDatos({ UNIFORMAME_PUENTE_DATOS: "/srv/puente" }, "linux", "/home/aduana")).toBe("/srv/puente");
		expect(leerDireccionDeZebra("192.168.1.50")).toEqual({ direccion: "192.168.1.50", puerto: 9100 });
		expect(leerDireccionDeZebra(" 192.168.1.60:9200 ")).toEqual({ direccion: "192.168.1.60", puerto: 9200 });
		expect(leerDireccionDeZebra("http://zebra")).toBeNull();
		expect(leerDireccionDeZebra("192.168.1.50:70000")).toBeNull();
	});
});
