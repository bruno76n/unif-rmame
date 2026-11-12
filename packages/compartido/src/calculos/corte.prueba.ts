/**
 * Prueba de las cuentas del corte: de cada tela, lo usado más lo que quedó da los metros de sus rollos; lo que queda
 * según la receta nunca es negativo; los rollos automáticos cubren lo que pide la receta y con ellos lo que queda nunca
 * llega a los metros del último rollo. La pantalla y la API usan estas mismas funciones.
 * Fase 12 · docs/fases/12-produccion.md (parte 3)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	destinoDeLoQueQuedo,
	laTelaAlcanza,
	porcentajeSobreElPatron,
	type RolloDelCorte,
	rollosAutomaticos,
	usoDeLaTela,
} from "./corte.ts";

/** Unos metros en milésimos. */
const m = (metros: number) => BigInt(Math.round(metros * 1000));

/** Los rollos de la muestra: R-0431, R-0432 y R-0433 (92, 88.5 y 95 m). */
const rollosDeLaMuestra: RolloDelCorte[] = [
	{ rolloId: "R-0431", milesimos: m(92) },
	{ rolloId: "R-0432", milesimos: m(88.5) },
	{ rolloId: "R-0433", milesimos: m(95) },
];

/** Rollos al azar, de 1 a 6, de 0.001 a 150 m. */
const rollosAlAzar = fc
	.array(fc.bigInt({ min: 1n, max: 150_000n }), { minLength: 1, maxLength: 6 })
	.map((metros) => metros.map((milesimos, i) => ({ rolloId: `R-${i}`, milesimos })));

/** Lo que pide la receta al azar, de 0.001 a 600 m. */
const pideAlAzar = fc.bigInt({ min: 1n, max: 600_000n });

describe("De cada tela, lo usado más lo que quedó da los metros de sus rollos; lo que queda según la receta nunca es negativo; los rollos automáticos cubren lo que pide la receta", () => {
	it("el ejemplo del L-2026-122: 214 m de gabardina con los tres rollos de la muestra", () => {
		expect(laTelaAlcanza(rollosDeLaMuestra, m(214))).toBe(true);
		expect(rollosAutomaticos(rollosDeLaMuestra, m(214)).map((rollo) => rollo.rolloId)).toEqual([
			"R-0431",
			"R-0432",
			"R-0433",
		]);
		expect(usoDeLaTela(rollosDeLaMuestra, m(214))).toEqual({
			usados: [
				{ rolloId: "R-0431", milesimos: m(92) },
				{ rolloId: "R-0432", milesimos: m(88.5) },
				{ rolloId: "R-0433", milesimos: m(33.5) },
			],
			quedan: m(61.5),
			faltan: 0n,
		});
		// La receta decía que quedaban 61.5 m, pero quedaron 60: se usó 1.5 m más.
		expect(usoDeLaTela(rollosDeLaMuestra, m(214), m(60)).usados.at(-1)).toEqual({
			rolloId: "R-0433",
			milesimos: m(35),
		});
		// Si no alcanza, el último se usa completo y se dice lo que falta.
		expect(usoDeLaTela(rollosDeLaMuestra.slice(0, 2), m(214))).toMatchObject({ quedan: 0n, faltan: m(33.5) });
		expect(() => usoDeLaTela(rollosDeLaMuestra, m(214), m(95))).toThrow(RangeError);
	});

	it("con datos al azar: lo usado más lo que queda son los metros de los rollos, y lo que queda nunca es negativo", () => {
		fc.assert(
			fc.property(rollosAlAzar, pideAlAzar, (rollos, pide) => {
				const uso = usoDeLaTela(rollos, pide);
				const usado = uso.usados.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
				const tienen = rollos.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
				return (
					usado + uso.quedan === tienen &&
					uso.quedan >= 0n &&
					uso.usados.every(
						(usadoDe, i) => usadoDe.milesimos >= 0n && usadoDe.milesimos <= (rollos[i]?.milesimos ?? 0n),
					) &&
					(uso.faltan === 0n ? usado >= pide || tienen >= pide : usado + uso.faltan === pide)
				);
			}),
			{ numRuns: 5000 },
		);
	});

	it("con datos al azar: los rollos automáticos cubren lo que pide la receta si alcanza, y lo que queda no llega al último", () => {
		fc.assert(
			fc.property(rollosAlAzar, pideAlAzar, (rollos, pide) => {
				const automaticos = rollosAutomaticos(rollos, pide);
				const uso = usoDeLaTela(automaticos, pide);
				const ultimo = automaticos.at(-1)?.milesimos ?? 0n;
				if (!laTelaAlcanza(rollos, pide)) return automaticos.length === rollos.length && uso.faltan > 0n;
				return uso.faltan === 0n && uso.quedan < ultimo;
			}),
			{ numRuns: 5000 },
		);
	});
});

describe("Lo que quedó va a rollo, retazo o merma con la frontera, y el % contra el patrón es el mismo en la pantalla y al cerrar", () => {
	it("con la frontera de 10 m: 0 no va a ningún lado, de 10 para arriba es rollo, abajo retazo o merma", () => {
		expect(destinoDeLoQueQuedo(0n, m(10), false)).toBe("ninguno");
		expect(destinoDeLoQueQuedo(m(10), m(10), true)).toBe("rollo");
		expect(destinoDeLoQueQuedo(m(9.999), m(10), false)).toBe("retazo");
		expect(destinoDeLoQueQuedo(m(9.999), m(10), true)).toBe("merma");
	});

	it("214 m usados contra un patrón de 200 m es 7 % de más; sin patrón, 0", () => {
		expect(porcentajeSobreElPatron(m(214), m(200))).toBe(7);
		expect(porcentajeSobreElPatron(m(190), m(200))).toBe(-5);
		expect(porcentajeSobreElPatron(m(214), 0n)).toBe(0);
	});
});
