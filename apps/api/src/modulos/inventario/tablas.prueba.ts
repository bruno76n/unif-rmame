/**
 * Prueba de las tablas del libro: el rol de la app no puede cambiar ni borrar un movimiento ni sus renglones.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 1)
 * Fase 14 · los CHECK de `diferencias` y que `conteo_lineas` y `ajuste_lineas` solo crecen (migración `0045`)
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

	it("las DF- son de prenda o de material, con signo y nunca en cero; resuelta va con su resolución; lo que vio un conteo o un ajuste solo crece", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT (SELECT id FROM ubicaciones WHERE codigo = 'BOD') AS bodega, (SELECT id FROM variantes LIMIT 1) AS variante",
		);
		const { bodega, variante } = rows[0] ?? {};
		// La variante va en `$3` solo si la DF- la nombra.
		const diferencia = (columnas: string, valores: string) =>
			servidor.base.dueno.query(
				`INSERT INTO diferencias (id, folio, origen, ubicacion_id, descripcion, a_cargo_ubicacion_id, estado, ${columnas})
				 VALUES ($1, 'DF-' || md5(random()::text), 'cuadre', $2, 'prueba', $2, ${valores})`,
				valores.includes("$3") ? [uuidv7(), bodega, variante] : [uuidv7(), bodega],
			);
		// Sin prenda ni material, o en cero: no entra.
		await expect(diferencia("piezas", "'por_contar', 2")).rejects.toMatchObject({ code: "23514" });
		await expect(diferencia("variante_id, piezas", "'por_contar', $3, 0")).rejects.toMatchObject({ code: "23514" });
		// Resuelta sin resolución, o una aclaración de material en una de prenda: no entra.
		await expect(diferencia("variante_id, piezas", "'resuelta', $3, -1")).rejects.toMatchObject({ code: "23514" });
		await expect(
			diferencia("variante_id, piezas, aclaracion", "'por_contar', $3, -1, 'aclarada'"),
		).rejects.toMatchObject({
			code: "23514",
		});
		await diferencia("variante_id, piezas", "'por_contar', $3, -1");
		for (const consulta of ["UPDATE conteo_lineas SET piezas_contadas = 1", "DELETE FROM ajuste_lineas"]) {
			await expect(servidor.base.app.query(consulta)).rejects.toMatchObject({ code: "42501" });
		}
	});
});
