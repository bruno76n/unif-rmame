/**
 * Prueba del trabajo de impresión de punta a punta: lo pide el puente, lo imprime y lo confirma.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 6)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { enVivoDeAdmin } from "../en-vivo.ts";

const nota = "01936f2e-0000-7000-8000-0000000000a1";

describe("un trabajo de impresión pasa de por_imprimir a mandado y a impreso o fallo; confirmar dos veces contesta lo mismo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'");
		await mandarAccion(
			servidor,
			"admin.guardar_impresora",
			{
				datos: {
					nombre: "Zebra Aduana",
					modelo: "ZD421",
					ubicacion_id: rows[0]?.id,
					dispositivo_id: "01936f2e-0000-7000-8000-000000000031",
				},
			},
			"duena",
		);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda una acción como un puente (sin `Origin`, con su versión). */
	async function comoPuente(nombre: string, datos: unknown, puente = "puente") {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: `/v1/acciones/${nombre}`,
			headers: { "x-prueba-quien": puente, "x-app-version": "1.0.0" },
			payload: { clave_idempotencia: nuevaClave(), datos },
		});
		return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
	}

	/** Pide un trabajo como Ventas y regresa su id. */
	async function pedirTrabajo(): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'");
		const respuesta = await mandarAccion(servidor, "prueba.imprimir", {
			datos: { ubicacion_id: rows[0]?.id, ids: [nota], copias: 2 },
		});
		return String((respuesta.cuerpo.resultado as { trabajo_id: string }).trabajo_id);
	}

	/** El estado de un trabajo. */
	async function estado(id: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT estado FROM trabajos_impresion WHERE id = $1", [id]);
		return rows[0]?.estado;
	}

	it("el puente recibe sus trabajos con la ruta de su ZPL y pasan a mandado; la ruta le da la etiqueta", async () => {
		const trabajo = await pedirTrabajo();
		const pedidos = await comoPuente("admin.trabajos_impresion", {});
		expect(pedidos.cuerpo.resultado.trabajos).toEqual([
			expect.objectContaining({
				id: trabajo,
				tipo: "prueba",
				ids: [nota],
				copias: 2,
				ruta: `/v1/etiquetas/prueba/${nota}?formato=zpl&copias=2`,
			}),
		]);
		expect(await estado(trabajo)).toBe("mandado");
		expect((await comoPuente("admin.trabajos_impresion", {})).cuerpo.resultado.trabajos).toEqual([]);
		const zpl = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/prueba/${nota}?formato=zpl&copias=2`,
			headers: { "x-prueba-quien": "puente", "x-app-version": "1.0.0" },
		});
		expect(zpl.statusCode).toBe(200);
		expect(zpl.headers["content-type"]).toBe("text/plain; charset=utf-8");
		expect(zpl.body).toBe(`^XA^FD${nota}^FS^PQ2^XZ`);
		await comoPuente("admin.confirmar_impresion", { trabajo_id: trabajo, resultado: "impreso" });
	});

	it("confirmar impreso lo termina; confirmarlo otra vez, aunque diga fallo, contesta lo mismo y no cambia", async () => {
		const trabajo = await pedirTrabajo();
		await comoPuente("admin.trabajos_impresion", {});
		const primera = await comoPuente("admin.confirmar_impresion", { trabajo_id: trabajo, resultado: "impreso" });
		expect(primera.cuerpo.resultado).toMatchObject({ estado: "impreso" });
		const otra = await comoPuente("admin.confirmar_impresion", {
			trabajo_id: trabajo,
			resultado: "fallo",
			error: "sin papel",
		});
		expect(otra.cuerpo.resultado).toMatchObject({ estado: "impreso" });
		expect(await estado(trabajo)).toBe("impreso");
		const { rows } = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'impresion.terminada' AND entidad_id = $1",
			[trabajo],
		);
		expect(rows).toEqual([
			{
				datos: {
					trabajo_id: trabajo,
					sesion_id: "01936f2e-0000-7000-8000-000000000012",
					resultado: "impreso",
					texto: "Etiquetas impresas en Zebra Aduana",
				},
			},
		]);
		// Ya terminado, el puente ya no puede pedir su etiqueta.
		const tarde = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/prueba/${nota}?formato=zpl`,
			headers: { "x-prueba-quien": "puente", "x-app-version": "1.0.0" },
		});
		expect(tarde.json()).toMatchObject({ error: "sin_permiso", codigo: "fuera_de_alcance" });
	});

	it("un fallo pide lo que dijo la impresora; otro puente no lo confirma", async () => {
		const trabajo = await pedirTrabajo();
		expect(
			(await comoPuente("admin.confirmar_impresion", { trabajo_id: trabajo, resultado: "fallo" })).cuerpo,
		).toMatchObject({
			campos: { error: "Escribe lo que dijo la impresora." },
		});
		expect(
			(await comoPuente("admin.confirmar_impresion", { trabajo_id: trabajo, resultado: "impreso" }, "otro_puente"))
				.cuerpo,
		).toMatchObject({ error: "sin_permiso", codigo: "fuera_de_alcance" });
		const fallo = await comoPuente("admin.confirmar_impresion", {
			trabajo_id: trabajo,
			resultado: "fallo",
			error: "Sin papel",
		});
		expect(fallo.cuerpo.resultado).toMatchObject({ estado: "fallo" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'impresion.terminada' AND entidad_id = $1",
			[trabajo],
		);
		expect(rows[0]?.datos.texto).toBe("No se imprimió en Zebra Aduana: Sin papel. Usa el PDF.");
	});

	it("en vivo: impresion.pedida le avisa al puente; impresion.terminada, a la sesión que pidió", () => {
		const pedida = enVivoDeAdmin["impresion.pedida"]?.({
			id: "01936f2e-0000-7000-8000-0000000000e9",
			tipo: "impresion.pedida",
			datos: { trabajo_id: nota, dispositivo_id: "01936f2e-0000-7000-8000-000000000031" },
		});
		expect(pedida).toEqual([
			{
				para: { dispositivoId: "01936f2e-0000-7000-8000-000000000031" },
				nombre: "impresion",
				datos: { trabajo_id: nota },
			},
		]);
		const terminada = enVivoDeAdmin["impresion.terminada"]?.({
			id: "01936f2e-0000-7000-8000-0000000000e9",
			tipo: "impresion.terminada",
			datos: {
				trabajo_id: nota,
				sesion_id: "01936f2e-0000-7000-8000-000000000012",
				resultado: "impreso",
				texto: "Listo",
			},
		});
		expect(terminada).toEqual([
			{
				para: { sesionId: "01936f2e-0000-7000-8000-000000000012" },
				nombre: "impresion_terminada",
				datos: { trabajo_id: nota, resultado: "impreso", texto: "Listo" },
			},
		]);
	});

	it("la etiqueta en PDF la pide Ventas; Aduana no", async () => {
		const pdf = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/prueba/${nota}?formato=pdf`,
			headers: encabezadosDeLaWeb(),
		});
		expect(pdf.statusCode).toBe(200);
		expect(pdf.headers["content-type"]).toBe("application/pdf");
		const aduana = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/prueba/${nota}?formato=pdf`,
			headers: encabezadosDeLaWeb("aduana"),
		});
		expect(aduana.json()).toMatchObject({ error: "sin_permiso", codigo: "sin_departamento" });
		const noHay = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/otra/${nota}?formato=pdf`,
			headers: encabezadosDeLaWeb(),
		});
		expect(noHay.statusCode).toBe(404);
	});
});
