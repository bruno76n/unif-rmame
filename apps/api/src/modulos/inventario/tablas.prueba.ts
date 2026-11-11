/**
 * Prueba de las tablas del libro: el rol de la app no puede cambiar ni borrar un movimiento ni sus renglones.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 1)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../nucleo/pruebas/accion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "./dominio/escribir-movimiento.ts";

describe("el rol de la app no puede cambiar ni borrar el libro", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("UPDATE y DELETE de movimientos y movimiento_lineas dan 42501; un movimiento de reversión sin su original no entra", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT (SELECT id FROM ubicaciones WHERE codigo = 'BOD') AS bodega, (SELECT id FROM variantes LIMIT 1) AS variante",
		);
		const { bodega, variante } = rows[0] ?? {};
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			escribirMovimiento(contexto, {
				tipo: "carga_inicial",
				documento: { tipo: "carga_inicial", id: uuidv7() },
				renglones: [{ origen: null, destino: bodega, varianteId: variante, piezas: 1 }],
				clave: uuidv7(),
			}),
		);
		for (const consulta of [
			"UPDATE movimientos SET nota = 'cambiado'",
			"DELETE FROM movimientos",
			"UPDATE movimiento_lineas SET piezas = 99",
			"DELETE FROM movimiento_lineas",
		]) {
			await expect(servidor.base.app.query(consulta)).rejects.toMatchObject({ code: "42501" });
		}
		// Un tipo `reversion` siempre dice qué revierte, y nada más lo dice.
		await expect(
			servidor.base.dueno.query(
				"INSERT INTO movimientos (id, tipo, fecha, ocurrido_en, documento_tipo, documento_id, clave_idempotencia) VALUES ($1, 'reversion', current_date, now(), 'ajuste', $1, $1)",
				[uuidv7()],
			),
		).rejects.toMatchObject({ code: "23514" });
	});
});
