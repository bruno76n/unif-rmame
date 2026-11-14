/**
 * Las cuentas del corte de una tela: si la tela alcanza, los rollos automáticos y lo que queda según la receta. Lo que
 * pide la receta y el piso del patrón son `pideLaReceta` de la cuenta de material.
 * Fase 12 · docs/modulos/produccion/corte-y-bultos.md (reglas 3 a 6 y 12)
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Entrega al corte, si cada tela alcanza)
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

/** Una tela que se entrega al corte: lo que pide y los rollos que se marcaron de ella. */
export interface TelaPorEntregar {
	/** Lo que pide la receta de esta tela, en milésimos. */
	pide: bigint;
	rollos: readonly RolloDelCorte[];
}

/**
 * Si cada tela alcanza con sus propios rollos: lo que sobra de una nunca tapa lo que falta de otra. Una tela sin rollos
 * marcados no alcanza.
 * @param telas Las telas por entregar, con sus rollos marcados.
 * @returns Verdadero solo si todas alcanzan. Lo pinta el cajón Entrega al corte de Bodega (verde o rojo).
 */
export function cadaTelaAlcanza(telas: readonly TelaPorEntregar[]): boolean {
	return telas.every((tela) => laTelaAlcanza(tela.rollos, tela.pide));
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

/** A dónde va lo que quedó del último rollo de una tela al cerrar el corte. */
export type DestinoDeLoQueQuedo = "ninguno" | "rollo" | "retazo" | "merma";

/**
 * A dónde va lo que quedó del último rollo (regla 6): nada si se usó completo; de la frontera para arriba regresa como
 * rollo; abajo, retazo, o merma si quien corta dijo que ya no sirve.
 * @param quedan Lo que quedó, en milésimos.
 * @param frontera `inventario.metros_frontera_rollo`, en milésimos.
 * @param yaNoSirve Si quien corta dijo que ya no sirve.
 * Existe para que la captura diga lo mismo que hará `produccion.cerrar_corte`.
 */
export function destinoDeLoQueQuedo(quedan: bigint, frontera: bigint, yaNoSirve: boolean): DestinoDeLoQueQuedo {
	if (quedan === 0n) return "ninguno";
	if (quedan >= frontera) return "rollo";
	return yaNoSirve ? "merma" : "retazo";
}

/**
 * Cuánto se pasa la tela usada del piso del patrón, en porcentaje sin redondear (regla 12); 0 si no hay piso.
 * @param usado Lo usado de la tela principal, en milésimos.
 * @param piso El piso del patrón, en milésimos.
 * Existe para que la captura muestre el mismo «% contra el patrón» con el que la acción avisa.
 */
export function porcentajeSobreElPatron(usado: bigint, piso: bigint): number {
	if (piso === 0n) return 0;
	return Number(((usado - piso) * 100_000n) / piso) / 1000;
}
