/**
 * Prueba de los rollos sugeridos: siguen la regla de las partidas en orden de fecha de corte y nunca dan el mismo rollo
 * a dos lotes; con datos al azar sobre la regla pura y un caso en la base.
 * Fase 12 · docs/fases/12-produccion.md (parte 3)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type LotePorSugerir, type RolloLibre, sugerirRollos } from "../dominio/rollos-sugeridos.ts";

/** Rollos al azar de dos telas y tres partidas. */
const rollosAlAzar = fc
	.array(
		fc.record({
			material: fc.constantFrom("gabardina", "pique"),
			partida: fc.constantFrom("P-1", "P-2", "P-3"),
			milesimos: fc.bigInt({ min: 1_000n, max: 120_000n }),
		}),
		{ maxLength: 12 },
	)
	.map((rollos): RolloLibre[] =>
		rollos.map((rollo, i) => ({
			rolloId: `R-${String(i).padStart(2, "0")}`,
			materialId: rollo.material,
			partida: rollo.partida,
			milesimos: rollo.milesimos,
		})),
	);

/** Lotes al azar, ya en orden de corte, que piden de las dos telas. */
const lotesAlAzar = fc
	.array(
		fc.record({ gabardina: fc.bigInt({ min: 0n, max: 250_000n }), pique: fc.bigInt({ min: 0n, max: 250_000n }) }),
		{
			maxLength: 5,
		},
	)
	.map((lotes): LotePorSugerir[] =>
		lotes.map((lote, i) => ({
			loteId: `L-${i}`,
			telas: [
				{ materialId: "gabardina", pide: lote.gabardina },
				{ materialId: "pique", pide: lote.pique },
			],
		})),
	);

describe("Los rollos sugeridos siguen la regla de las partidas en orden de fecha de corte y nunca dan el mismo rollo a dos lotes", () => {
	it("el ejemplo de la muestra: ninguna partida alcanza sola 214 m, así que se apartan las tres empezando por la de más metros", () => {
		const libres: RolloLibre[] = [
			{ rolloId: "R-0431", materialId: "gabardina", partida: "P-2224", milesimos: 92_000n },
			{ rolloId: "R-0432", materialId: "gabardina", partida: "P-2224", milesimos: 88_500n },
			{ rolloId: "R-0433", materialId: "gabardina", partida: "P-2231", milesimos: 95_000n },
		];
		expect(
			sugerirRollos([{ loteId: "L-2026-122", telas: [{ materialId: "gabardina", pide: 214_000n }] }], libres),
		).toEqual([
			{ loteId: "L-2026-122", rolloId: "R-0432" },
			{ loteId: "L-2026-122", rolloId: "R-0431" },
			{ loteId: "L-2026-122", rolloId: "R-0433" },
		]);
		// Con 90 m, la P-2224 alcanza sola: del rollo más chico al más grande.
		expect(sugerirRollos([{ loteId: "L", telas: [{ materialId: "gabardina", pide: 90_000n }] }], libres)).toEqual([
			{ loteId: "L", rolloId: "R-0432" },
			{ loteId: "L", rolloId: "R-0431" },
		]);
	});

	it("con datos al azar: un rollo va a un solo lote y es de la tela que pide; el primer lote cubre lo que pide si los rollos alcanzan", () => {
		fc.assert(
			fc.property(lotesAlAzar, rollosAlAzar, (lotes, libres) => {
				const sugeridos = sugerirRollos(lotes, libres);
				const ids = sugeridos.map((sugerido) => sugerido.rolloId);
				if (new Set(ids).size !== ids.length) return false;
				for (const sugerido of sugeridos) {
					const rollo = libres.find((libre) => libre.rolloId === sugerido.rolloId);
					const lote = lotes.find((suyo) => suyo.loteId === sugerido.loteId);
					if (
						rollo === undefined ||
						!lote?.telas.some((tela) => tela.materialId === rollo.materialId && tela.pide > 0n)
					)
						return false;
				}
				const [primero] = lotes;
				if (primero === undefined) return sugeridos.length === 0;
				return primero.telas.every((tela) => {
					const hay = libres
						.filter((rollo) => rollo.materialId === tela.materialId)
						.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
					const tiene = sugeridos
						.filter((sugerido) => sugerido.loteId === primero.loteId)
						.flatMap((sugerido) =>
							libres.filter((rollo) => rollo.rolloId === sugerido.rolloId && rollo.materialId === tela.materialId),
						)
						.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
					return hay < tela.pide || tiene >= tela.pide;
				});
			}),
			{ numRuns: 3000 },
		);
	});

	it("con datos al azar: si una partida alcanza sola, los rollos del primer lote son todos de una sola partida", () => {
		fc.assert(
			fc.property(rollosAlAzar, fc.bigInt({ min: 1n, max: 250_000n }), (libres, pide) => {
				const sugeridos = sugerirRollos([{ loteId: "L", telas: [{ materialId: "gabardina", pide }] }], libres);
				const deGabardina = libres.filter((rollo) => rollo.materialId === "gabardina");
				const totales = new Map<string, bigint>();
				for (const rollo of deGabardina)
					totales.set(rollo.partida, (totales.get(rollo.partida) ?? 0n) + rollo.milesimos);
				const algunaAlcanza = [...totales.values()].some((total) => total >= pide);
				if (!algunaAlcanza) return true;
				const partidas = new Set(
					sugeridos.map((sugerido) => libres.find((rollo) => rollo.rolloId === sugerido.rolloId)?.partida),
				);
				return partidas.size === 1;
			}),
			{ numRuns: 3000 },
		);
	});
});
