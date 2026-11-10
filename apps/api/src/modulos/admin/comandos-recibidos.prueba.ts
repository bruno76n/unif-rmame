/**
 * Prueba de la tabla `comandos_recibidos`: lo que la app puede cambiar, lo que no, y sus CHECK.
 * Fase 3 · docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («La tabla `comandos_recibidos`»)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codigoDePostgres } from "../../nucleo/base/transacciones.ts";

const id = "01936f2e-8c3a-7b4d-9e5f-0000000c0001";
const usuario = "01936f2e-0000-7000-8000-000000000001";
/** Su sesión de prueba. */
const sesion = "01936f2e-0000-7000-8000-000000000011";

describe("comandos_recibidos: la app solo cambia el resultado, la respuesta, el documento, la excepción y las columnas de reintento, descarte y retenido; nunca borra", () => {
	let prueba: BaseDePrueba;
	/** Corre una sentencia con el rol de la app y regresa el código de Postgres si falló. */
	const conLaApp = (sentencia: string) =>
		prueba.app.query(sentencia).then(
			() => undefined,
			(error: unknown) => codigoDePostgres(error),
		);

	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		await prueba.app.query(
			`INSERT INTO comandos_recibidos (id, clave_idempotencia, origen, usuario_id, sesion_id, tipo_comando, ocurrido_en, carga_hash, resultado)
			 VALUES ('${id}', '${id}', 'web', '${usuario}', '${sesion}', 'ventas.confirmar_pedido', now(), 'huella', 'aplicado')`,
		);
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	it("la app cambia la respuesta, el documento y las columnas de reintento", async () => {
		expect(
			await conLaApp(
				`UPDATE comandos_recibidos SET respuesta = '{}', entidad = 'pedidos', reintentos = 1, actualizado_en = now() WHERE id = '${id}'`,
			),
		).toBeUndefined();
	});

	it.each([
		"clave_idempotencia = gen_random_uuid()",
		"carga_hash = 'otra'",
		"tipo_comando = 'otra.accion'",
		"usuario_id = gen_random_uuid()",
		"ocurrido_en = now()",
		"origen = 'aparato'",
	])("la app no cambia lo que nunca cambia: %s", async (cambio) => {
		expect(await conLaApp(`UPDATE comandos_recibidos SET ${cambio} WHERE id = '${id}'`)).toBe("42501");
	});

	it("la app no borra", async () => {
		expect(await conLaApp(`DELETE FROM comandos_recibidos WHERE id = '${id}'`)).toBe("42501");
	});

	it("los CHECK: una de la web pide cuenta y sesión; una de un aparato, su aparato; un apartado, su motivo; y la clave es única", async () => {
		const insertar = (columnas: string, valores: string) =>
			conLaApp(
				`INSERT INTO comandos_recibidos (id, clave_idempotencia, tipo_comando, ocurrido_en, carga_hash, ${columnas}) VALUES (gen_random_uuid(), gen_random_uuid(), 'x.y', now(), 'h', ${valores})`,
			);
		expect(await insertar("origen, resultado", "'web', 'aplicado'")).toBe("23514");
		expect(await insertar("origen, resultado", "'aparato', 'aplicado'")).toBe("23514");
		expect(await insertar("origen, resultado, dispositivo_id", "'aparato', 'apartado', gen_random_uuid()")).toBe(
			"23514",
		);
		expect(await insertar("origen, resultado, dispositivo_id", "'otro', 'aplicado', gen_random_uuid()")).toBe("23514");
		expect(
			await conLaApp(
				`INSERT INTO comandos_recibidos (id, clave_idempotencia, origen, usuario_id, sesion_id, tipo_comando, ocurrido_en, carga_hash, resultado)
				 VALUES (gen_random_uuid(), '${id}', 'web', '${usuario}', '${sesion}', 'x.y', now(), 'h', 'aplicado')`,
			),
		).toBe("23505");
	});
});
