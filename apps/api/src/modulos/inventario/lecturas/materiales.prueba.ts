/**
 * Prueba de `inventario.existencias_de_materiales` y `inventario.salidas_de_materiales`: lo que hay en Bodega y en
 * Aduana de varios materiales, y sus salidas por día (lo entregado al corte menos lo que regresó, los consumibles
 * tomados, y una reversión al revés).
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 5)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento, revertirMovimiento } from "../dominio/escribir-movimiento.ts";
import type { TipoDeMovimiento } from "../tablas.ts";

describe("Con 90 días de salidas, el consumo deja de ser el inicial y sale de las salidas divididas entre el factor de su mes", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre algo con el contexto de una acción, a las 12 de un día. */
	function elDia<T>(dia: string, hacer: (contexto: ContextoDeAccion) => Promise<T>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, hacer, {
			ahora: Temporal.Instant.from(`${dia}T18:00:00Z`),
		});
	}

	/** Un movimiento de un material de una ubicación a otra (o de Fuera). */
	function mover(
		contexto: ContextoDeAccion,
		tipo: Exclude<TipoDeMovimiento, "reversion">,
		materialId: string,
		de: string | null,
		a: string | null,
		cantidad: string,
	) {
		return escribirMovimiento(contexto, {
			tipo,
			documento: { tipo: "ajuste", id: uuidv7() },
			renglones: [
				{
					origen: de === null ? null : (ubicacion[de] ?? ""),
					destino: a === null ? null : (ubicacion[a] ?? ""),
					materialId,
					rolloId: null,
					cantidad,
				},
			],
			clave: uuidv7(),
		});
	}

	it("lo que hay en Bodega y en Aduana, por material; uno sin existencia, en ceros", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const [uno, dos] = [await altaDeMaterial(servidor, proveedor), await altaDeMaterial(servidor, proveedor)];
		await elDia("2026-09-01", async (contexto) => {
			await mover(contexto, "ajuste", uno, null, "BOD", "12.500");
			await mover(contexto, "ajuste", uno, null, "ADU", "3.000");
			await mover(contexto, "entrega_corte", uno, "BOD", "TAL", "2.000");
		});
		expect(
			await elDia("2026-09-02", (contexto) =>
				contexto.lectura("inventario.existencias_de_materiales", { material_ids: [uno, dos] }),
			),
		).toEqual({ [uno]: { bodega: "10.500", aduana: "3.000" }, [dos]: { bodega: "0.000", aduana: "0.000" } });
	});

	it("las salidas por día: entregado al corte menos lo que regresó, los consumibles, y una reversión al revés; la primera salida", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const avio = await altaDeMaterial(servidor, proveedor);
		await elDia("2026-06-10", (contexto) => mover(contexto, "consumible_tomado", avio, "BOD", null, "1.000"));
		await elDia("2026-09-01", async (contexto) => {
			await mover(contexto, "entrega_corte", avio, "BOD", "TAL", "100.000");
			await mover(contexto, "regreso_rollo", avio, "TAL", "BOD", "30.000");
		});
		const entrega = await elDia("2026-09-02", (contexto) =>
			mover(contexto, "entrega_corte", avio, "BOD", "TAL", "40.000"),
		);
		await elDia("2026-09-03", (contexto) =>
			revertirMovimiento(contexto, { movimientoId: entrega.movimientoId, clave: uuidv7() }),
		);
		// Un ajuste no es salida.
		await elDia("2026-09-03", (contexto) => mover(contexto, "ajuste", avio, null, "BOD", "500.000"));
		expect(
			await elDia("2026-09-04", (contexto) =>
				contexto.lectura("inventario.salidas_de_materiales", { material_ids: [avio], desde: "2026-09-01" }),
			),
		).toEqual({
			[avio]: {
				primera: "2026-06-10",
				por_dia: { "2026-09-01": "70.000", "2026-09-02": "40.000", "2026-09-03": "-40.000" },
			},
		});
	});
});
