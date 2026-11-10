/**
 * Prueba de `admin.cambiar_parametro`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contar, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña cambia un parámetro; cada cambio deja historial y bitácora; vacío, cero o fuera de rango no se guardan", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El parámetro como está en la base. */
	async function leer(clave: string): Promise<Record<string, unknown>> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, valor_entero, valor_texto, version, estado_decision FROM parametros WHERE clave = $1",
			[clave],
		);
		return rows[0];
	}

	/** Cambia un parámetro con la versión que tiene ahora. */
	async function cambiar(clave: string, valor: unknown, quien = "duena") {
		const { version } = await leer(clave);
		return mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave, valor }, version: Number(version) },
			quien,
		);
	}

	it("Ventas y Administración del sistema sin ser la dueña reciben 403", async () => {
		expect((await cambiar("prueba.tope", 5, "ventas")).cuerpo).toMatchObject({
			error: "sin_permiso",
			codigo: "sin_departamento",
		});
		expect((await cambiar("prueba.tope", 5, "admin")).cuerpo).toMatchObject({
			error: "sin_permiso",
			codigo: "solo_duena",
		});
		expect((await leer("prueba.tope")).valor_entero).toBe("3");
	});

	it("la dueña lo cambia: guarda el valor, su historial con quién, su bitácora y su evento", async () => {
		const antes = await leer("prueba.tope");
		const historialAntes = await contar(servidor, "parametros_historial");
		const respuesta = await cambiar("prueba.tope", 7);
		expect(respuesta.estado).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Parámetro guardado" });
		const despues = await leer("prueba.tope");
		expect(despues.valor_entero).toBe("7");
		expect(Number(despues.version)).toBeGreaterThan(Number(antes.version));
		expect(await contar(servidor, "parametros_historial")).toBe(historialAntes + 1);
		const { rows } = await servidor.base.dueno.query(
			"SELECT valor_anterior, valor_nuevo, creado_por FROM parametros_historial WHERE parametro_id = $1 ORDER BY creado_en DESC LIMIT 1",
			[antes.id],
		);
		expect(rows[0]).toEqual({
			valor_anterior: "3",
			valor_nuevo: "7",
			creado_por: "01936f2e-0000-7000-8000-000000000001",
		});
		expect(servidor.pedidos.bitacora.at(-1)).toEqual([
			expect.objectContaining({ descripcion: "Cambió el parámetro «Tope»: 3 días → 7 días", antes: 3, despues: 7 }),
		]);
		expect(servidor.pedidos.eventos.at(-1)).toEqual([
			expect.objectContaining({ tipo: "parametro.cambiado", tablas: ["parametros"] }),
		]);
	});

	it("una decisión de operación regresa el mismo texto de su bitácora y deja de estar por decidir", async () => {
		const respuesta = await cambiar("prueba.costo_paro", 45_000);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: "Costo de la hora de paro: $450" });
		expect((await leer("prueba.costo_paro")).estado_decision).toBe("decidido");
	});

	it.each([
		["vacío", "prueba.tope", null, "Escribe un número mayor que cero"],
		["cero", "prueba.tope", 0, "Escribe un número mayor que cero"],
		["fuera de rango", "prueba.tope", 11, "Escribe un número de 1 a 10"],
		["una opción que no está", "prueba.dia", "jueves", "Escoge una de las opciones."],
		["una hora mal escrita", "prueba.hora", "25:00", "Escribe la hora como HH:MM."],
	])("%s no se guarda: 400 en valor con su mensaje", async (_caso, clave, valor, mensaje) => {
		const antes = await leer(clave);
		const respuesta = await cambiar(clave, valor);
		expect(respuesta.estado).toBe(400);
		expect(respuesta.cuerpo).toMatchObject({ error: "validacion", campos: { valor: mensaje } });
		expect(await leer(clave)).toEqual(antes);
	});

	it("vacío sí se guarda en el que lo acepta", async () => {
		expect((await cambiar("prueba.vacio", 4)).estado).toBe(200);
		expect((await cambiar("prueba.vacio", null)).estado).toBe(200);
		expect((await leer("prueba.vacio")).valor_entero).toBeNull();
	});

	it("el mismo valor que ya tenía responde bien sin escribir nada", async () => {
		const antes = await leer("prueba.dia");
		const historial = await contar(servidor, "parametros_historial");
		const respuesta = await cambiar("prueba.dia", "martes");
		expect(respuesta.estado).toBe(200);
		expect(await leer("prueba.dia")).toEqual(antes);
		expect(await contar(servidor, "parametros_historial")).toBe(historial);
	});

	it("con una versión vieja responde 409 con el valor de ahora; con una clave que no existe, 404", async () => {
		const { version } = await leer("prueba.dia");
		await cambiar("prueba.dia", "lunes");
		const vieja = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave: "prueba.dia", valor: "martes" }, version: Number(version) },
			"duena",
		);
		expect(vieja.estado).toBe(409);
		expect(vieja.cuerpo).toMatchObject({ datos: { clave: "prueba.dia", valor: "lunes" } });
		const noHay = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave: "prueba.no_hay", valor: 1 }, version: 1 },
			"duena",
		);
		expect(noHay.estado).toBe(404);
	});
});
