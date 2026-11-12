/**
 * Prueba de `admin.tomar_folio` y `admin.siguiente_folio`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 */

import { join } from "node:path";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Base, crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { cargarModulos, type RegistroDeModulos } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";

describe("dos documentos que piden folio a la vez reciben números seguidos, sin huecos aunque uno falle; el año nuevo en hora de México empieza en 1; el número de un aparato solo sube el contador", () => {
	let prueba: BaseDePrueba;
	let base: Base;
	let registro: RegistroDeModulos;
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		base = crearBase(prueba.app);
		registro = await cargarModulos(join(import.meta.dirname, "../.."));
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	/** Toma un folio en su propia transacción. */
	function tomar(datos: Record<string, unknown>, ahora?: Temporal.Instant): Promise<unknown> {
		return enAccionDePrueba(base, registro, (contexto) => contexto.interna("admin.tomar_folio", datos), {
			...(ahora === undefined ? {} : { ahora }),
		});
	}

	/** El siguiente folio, sin tomarlo. */
	function siguiente(datos: Record<string, unknown>, ahora?: Temporal.Instant): Promise<unknown> {
		return enAccionDePrueba(base, registro, (contexto) => contexto.lectura("admin.siguiente_folio", datos), {
			...(ahora === undefined ? {} : { ahora }),
		});
	}

	it("el primero sale con sus ceros; con n salen seguidos en un solo paso", async () => {
		expect(await tomar({ tipo: "pedido_linea" })).toEqual({ folio: "W-0001", numero: 1 });
		expect(await tomar({ tipo: "pedido_linea", n: 3 })).toEqual([
			{ folio: "W-0002", numero: 2 },
			{ folio: "W-0003", numero: 3 },
			{ folio: "W-0004", numero: 4 },
		]);
		expect(await siguiente({ tipo: "pedido_linea" })).toEqual({ folio: "W-0005", quedan: undefined });
	});

	it("dos a la vez: la segunda espera a la primera; si la primera falla, la segunda recibe su número y no queda hueco", async () => {
		let soltar: (() => void) | undefined;
		const espera = new Promise<void>((listo) => {
			soltar = listo;
		});
		let tomadoPorLaPrimera: unknown;
		const primera = enAccionDePrueba(base, registro, async (contexto) => {
			tomadoPorLaPrimera = await contexto.interna("admin.tomar_folio", { tipo: "nota_credito" });
			await espera;
			throw new Error("la primera falla");
		}).catch((error: unknown) => error);
		// Que la primera tome el renglón antes que la segunda.
		await new Promise((listo) => setTimeout(listo, 100));
		const segunda = tomar({ tipo: "nota_credito" });
		await new Promise((listo) => setTimeout(listo, 100));
		soltar?.();
		expect(await primera).toBeInstanceOf(Error);
		expect(tomadoPorLaPrimera).toEqual({ folio: "NC-0001", numero: 1 });
		expect(await segunda).toEqual({ folio: "NC-0001", numero: 1 });
		const [a, b] = await Promise.all([tomar({ tipo: "nota_credito" }), tomar({ tipo: "nota_credito" })]);
		expect([a, b].map((folio) => (folio as { numero: number }).numero).sort()).toEqual([2, 3]);
	});

	it("el año es el del día de negocio en México: el 31 de diciembre a las 11 de la noche es del año que termina, y el año nuevo empieza en 1", async () => {
		// Años sin folios de la muestra (que ya tiene órdenes y lotes de 2026).
		const nochevieja = Temporal.Instant.from("2030-01-01T05:30:00Z");
		const anioNuevo = Temporal.Instant.from("2030-01-01T06:30:00Z");
		expect(await tomar({ tipo: "orden_produccion" }, nochevieja)).toEqual({ folio: "OP-2029-001", numero: 1 });
		expect(await tomar({ tipo: "orden_produccion" }, nochevieja)).toEqual({ folio: "OP-2029-002", numero: 2 });
		expect(await siguiente({ tipo: "orden_produccion" }, anioNuevo)).toEqual({
			folio: "OP-2030-001",
			quedan: undefined,
		});
		expect(await tomar({ tipo: "orden_produccion" }, anioNuevo)).toEqual({ folio: "OP-2030-001", numero: 1 });
		expect(await tomar({ tipo: "lote" }, anioNuevo)).toEqual({ folio: "L-2030-001", numero: 1 });
	});

	it("los primeros folios de un año nuevo pedidos a la vez salen seguidos desde 1", async () => {
		const anio = Temporal.Instant.from("2028-01-02T18:00:00Z");
		const folios = await Promise.all([1, 2, 3].map(() => tomar({ tipo: "lote" }, anio)));
		expect(folios.map((folio) => (folio as { numero: number }).numero).sort()).toEqual([1, 2, 3]);
	});

	it("el número de un aparato no da folio: solo sube el contador, y uno viejo que llega tarde no lo baja", async () => {
		expect(await tomar({ tipo: "venta_tienda", alcance: "T1", numero_recibido: 41 })).toBeUndefined();
		expect(await siguiente({ tipo: "venta_tienda", alcance: "T1" })).toEqual({ folio: "T1-000042", quedan: undefined });
		await tomar({ tipo: "venta_tienda", alcance: "T1", numero_recibido: 30 });
		expect(await siguiente({ tipo: "venta_tienda", alcance: "T1" })).toEqual({ folio: "T1-000042", quedan: undefined });
		expect(await siguiente({ tipo: "corte_caja", alcance: "T1B" })).toEqual({ folio: "CT1B-0001", quedan: undefined });
	});

	it("el código de barras empieza en 100001 y no pasa de 499999: sin dar una parte de lo que se pide", async () => {
		// Los productos de la muestra ya tomaron códigos: el contador vuelve a como lo deja la siembra.
		await prueba.dueno.query("UPDATE contadores_folio SET siguiente = minimo WHERE tipo = 'codigo_barras'");
		expect(await tomar({ tipo: "codigo_barras" })).toEqual({ folio: "100001", numero: 100001 });
		await prueba.dueno.query("UPDATE contadores_folio SET siguiente = 499998 WHERE tipo = 'codigo_barras'");
		expect(await siguiente({ tipo: "codigo_barras" })).toEqual({ folio: "499998", quedan: 2 });
		const demasiados = await tomar({ tipo: "codigo_barras", n: 3 }).catch((error: unknown) => error);
		expect(demasiados).toBeInstanceOf(ErrorDeApi);
		expect(demasiados instanceof ErrorDeApi ? demasiados.cuerpo() : undefined).toMatchObject({
			error: "regla",
			codigo: "folio_agotado",
			mensaje: "Se acabaron los códigos de fábrica (hasta 499999).",
		});
		expect(await tomar({ tipo: "codigo_barras", n: 2 })).toEqual([
			{ folio: "499998", numero: 499998 },
			{ folio: "499999", numero: 499999 },
		]);
		await expect(tomar({ tipo: "codigo_barras" })).rejects.toBeInstanceOf(ErrorDeApi);
	});
});
