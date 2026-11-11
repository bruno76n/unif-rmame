/**
 * La cuenta de material: cuánto lleva un corte o un pedido de cada material, en la unidad en que se guarda. Es la
 * única del sistema: la corre la pantalla mientras se escribe y la API al guardar, con los mismos insumos.
 * Fase 10 · docs/modulos/patronaje/cuenta-de-material.md (reglas 1, 3, 4 y 7)
 *
 * Pura: la receta, las piezas y el desperdicio llegan ya leídos. Las cantidades viajan como texto decimal con
 * hasta tres decimales, y la cuenta se hace en milésimos con enteros grandes: nunca pasa por un número con
 * decimales, así que la pantalla y la API redondean igual.
 */

/** Un material de la versión de la receta, como lo usa la cuenta. */
export interface LineaDeLaCuenta {
	materialId: string;
	/** La tela principal, la única que lleva desperdicio. */
	esTelaPrincipal: boolean;
	/** Por prenda, en la unidad de la receta, si va igual en todas las tallas; si no, `null`. */
	cantidad: string | null;
	/** Por prenda y por talla, en la unidad de la receta, si cambia por talla. */
	porTalla: Readonly<Record<string, string>>;
	/** La conversión congelada en la versión: cuántas de la receta hacen una de inventario. */
	recetaPorUnidadInventario: string;
	/** Si su unidad de inventario se cuenta entera (conos, cajas): lleva al menos una. */
	seCuentaEntera: boolean;
}

/** Un decimal con hasta tres decimales, sin signo. */
const formaDecimal = /^(\d+)(?:\.(\d{1,3}))?$/;

/**
 * Un decimal en milésimos.
 * @param texto «1.06», «5000», «0.125».
 * @throws RangeError si no es un decimal sin signo con hasta tres decimales.
 */
export function aMilesimos(texto: string): bigint {
	const partes = formaDecimal.exec(texto.trim());
	if (partes === null) throw new RangeError(`${texto} no es un decimal con hasta tres decimales`);
	const [, enteros = "0", decimales = ""] = partes;
	return BigInt(enteros) * 1000n + BigInt(decimales.padEnd(3, "0"));
}

/**
 * Un decimal con signo en milésimos, como los guarda la base (una existencia puede ser negativa).
 * @param texto «700.000», «-5.250».
 * @throws RangeError si no es un decimal con hasta tres decimales.
 */
export function aMilesimosConSigno(texto: string): bigint {
	const limpio = texto.trim();
	return limpio.startsWith("-") ? -aMilesimos(limpio.slice(1)) : aMilesimos(limpio);
}

/**
 * Unos milésimos como texto decimal con tres decimales, como los guarda la base: `1_700_000n` → «1700.000».
 * @param milesimos Con o sin signo.
 */
export function deMilesimos(milesimos: bigint): string {
	const signo = milesimos < 0n ? "-" : "";
	const valor = milesimos < 0n ? -milesimos : milesimos;
	return `${signo}${valor / 1000n}.${String(valor % 1000n).padStart(3, "0")}`;
}

/**
 * Divide hacia arriba dos enteros no negativos.
 * @param numerador De cero en adelante.
 * @param denominador Mayor que cero.
 */
function haciaArriba(numerador: bigint, denominador: bigint): bigint {
	return (numerador + denominador - 1n) / denominador;
}

/**
 * Lo que lleva cada material de una versión de la receta para unas piezas por talla.
 *
 * Por material: la suma por talla de piezas × cantidad de la talla (o piezas totales × cantidad, si va igual), la
 * tela principal × (1 + desperdicio ÷ 100), todo entre la conversión de la versión, y hacia arriba al entero de su
 * unidad de inventario. Un material que se cuenta entero lleva al menos uno.
 * @param lineas Los materiales de la versión.
 * @param piezasPorTalla Cuántas piezas lleva cada talla (las de cero no cuentan).
 * @param desperdicioPct El desperdicio de la prenda, en por ciento, como texto decimal («6», «6.250»).
 * @returns Por material, cuánto lleva en su unidad de inventario; `null` («—») si a una talla con piezas le falta
 * su valor.
 */
export function cuentaDeMaterial(
	lineas: readonly LineaDeLaCuenta[],
	piezasPorTalla: Readonly<Record<string, number>>,
	desperdicioPct: string,
): Record<string, number | null> {
	const conPiezas = Object.entries(piezasPorTalla).filter(([, piezas]) => piezas > 0);
	const totalDePiezas = conPiezas.reduce((suma, [, piezas]) => suma + BigInt(piezas), 0n);
	const desperdicio = aMilesimos(desperdicioPct);
	return Object.fromEntries(
		lineas.map((linea) => [linea.materialId, cuentaDeUnaLinea(linea, conPiezas, totalDePiezas, desperdicio)]),
	);
}

/**
 * Lo que lleva un material (ver `cuentaDeMaterial`).
 * @returns Las unidades de inventario, o `null` si falta un dato.
 */
function cuentaDeUnaLinea(
	linea: LineaDeLaCuenta,
	conPiezas: readonly [string, number][],
	totalDePiezas: bigint,
	desperdicioMilesimos: bigint,
): number | null {
	// Σ piezas × cantidad, en milésimos de la unidad de la receta.
	let porPrenda = 0n;
	if (linea.cantidad !== null) {
		porPrenda = totalDePiezas * aMilesimos(linea.cantidad);
	} else {
		for (const [talla, piezas] of conPiezas) {
			const cantidad = linea.porTalla[talla];
			if (cantidad === undefined) return null;
			porPrenda += BigInt(piezas) * aMilesimos(cantidad);
		}
	}
	// Con desperdicio, × (100 000 + desperdicio en milésimos) ÷ 100 000; y la conversión, en milésimos.
	const desperdicio = linea.esTelaPrincipal ? desperdicioMilesimos : 0n;
	const cuenta = haciaArriba(
		porPrenda * (100_000n + desperdicio),
		100_000n * aMilesimos(linea.recetaPorUnidadInventario),
	);
	const conMinimo = linea.seCuentaEntera && totalDePiezas > 0n && cuenta < 1n ? 1n : cuenta;
	return Number(conMinimo);
}
