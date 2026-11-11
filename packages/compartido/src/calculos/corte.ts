/**
 * Las cuentas del corte de una tela: si la tela alcanza, los rollos automáticos y lo que queda según la receta. Lo que
 * pide la receta y el piso del patrón son `pideLaReceta` de la cuenta de material.
 * Fase 12 · docs/modulos/produccion/corte-y-bultos.md (reglas 3 a 6 y 12)
 *
 * Puras y en milésimos: la pantalla las corre mientras se escribe y la API las repite al cerrar, con los mismos rollos.
 */

/** Un rollo de una tela, con lo que tiene en milésimos de metro. */
export interface RolloDelCorte {
	rolloId: string;
	milesimos: bigint;
}

/**
 * Si los rollos alcanzan para lo que pide la receta.
 * @param rollos Los rollos de la tela.
 * @param pide Lo que pide la receta, en milésimos.
 */
export function laTelaAlcanza(rollos: readonly RolloDelCorte[], pide: bigint): boolean {
	return rollos.reduce((suma, rollo) => suma + rollo.milesimos, 0n) >= pide;
}

/**
 * Los rollos automáticos: los primeros de la lista, en su orden, hasta cubrir lo que pide la receta. Con ellos, lo que
 * queda nunca llega a los metros del último. Si no alcanzan, todos.
 * @param rollos Los rollos que se pueden usar, en el orden en que se usan.
 * @param pide Lo que pide la receta, en milésimos.
 */
export function rollosAutomaticos(rollos: readonly RolloDelCorte[], pide: bigint): RolloDelCorte[] {
	const usados: RolloDelCorte[] = [];
	let cubierto = 0n;
	for (const rollo of rollos) {
		if (cubierto >= pide && usados.length > 0) break;
		usados.push(rollo);
		cubierto += rollo.milesimos;
	}
	return usados;
}

/** Lo que pasa con cada rollo de una tela al cerrar el corte. */
export interface UsoDeLaTela {
	/** Por rollo, en su orden, lo que se usa; todos completos menos el último. */
	usados: { rolloId: string; milesimos: bigint }[];
	/** Lo que queda del último rollo. */
	quedan: bigint;
	/** Lo que faltó para lo que pide la receta: los rollos no alcanzaron. */
	faltan: bigint;
}

/**
 * Lo que queda según la receta: de los rollos en orden se usan completos todos menos el último, y del último lo que
 * falta para lo que pide la receta. Nunca es negativo; si no alcanza, el último se usa completo y lo que falta se dice.
 * Si se escribió lo que quedó, el último usa lo que tenía menos eso.
 * @param rollos Los rollos de la tela, en el orden en que se usaron; al menos uno.
 * @param pide Lo que pide la receta, en milésimos.
 * @param quedaron Lo que se escribió que quedó del último, si se cambió lo calculado.
 * @throws RangeError sin rollos, o si lo que quedó no es de 0 a menos que lo que tenía el último.
 */
export function usoDeLaTela(rollos: readonly RolloDelCorte[], pide: bigint, quedaron?: bigint): UsoDeLaTela {
	const ultimo = rollos.at(-1);
	if (ultimo === undefined) throw new RangeError("una tela lleva al menos un rollo");
	const completos = rollos.slice(0, -1);
	const deLosCompletos = completos.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
	const delUltimoSegunReceta = pide - deLosCompletos;
	let delUltimo: bigint;
	if (quedaron === undefined) {
		delUltimo =
			delUltimoSegunReceta > ultimo.milesimos
				? ultimo.milesimos
				: delUltimoSegunReceta < 0n
					? 0n
					: delUltimoSegunReceta;
	} else {
		if (quedaron < 0n || quedaron >= ultimo.milesimos) {
			throw new RangeError("lo que quedó va de 0 a menos que lo que tenía el rollo");
		}
		delUltimo = ultimo.milesimos - quedaron;
	}
	const usados = [
		...completos.map((rollo) => ({ rolloId: rollo.rolloId, milesimos: rollo.milesimos })),
		{ rolloId: ultimo.rolloId, milesimos: delUltimo },
	];
	const total = deLosCompletos + delUltimo;
	return { usados, quedan: ultimo.milesimos - delUltimo, faltan: pide > total ? pide - total : 0n };
}
