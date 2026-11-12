/**
 * El dinero en centavos: leerlo, mostrarlo, redondearlo, sacar porcentajes y repartirlo.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Dinero»)
 *
 * Todo se hace con enteros: los productos que pueden pasar de un entero seguro se hacen con `BigInt`,
 * y los porcentajes se convierten a milésimas enteras antes de multiplicar. El redondeo es al más
 * cercano, y la mitad, lejos del cero: un negativo da exactamente el contrario de su positivo.
 */

import { type Centavos, centavos } from "../tipos/base.ts";

/** Lo que una persona puede escribir como dinero: signo, `$`, pesos con o sin comas de miles y hasta dos decimales. */
const formaDeDinero = /^\s*(-?)\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/;

/** Lo que se escribe como porcentaje: un número sin signo con hasta tres decimales (`numeric(6,3)`). */
const formaDePorcentaje = /^(\d+)(?:\.(\d{1,3}))?$/;

const mayor = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Pasa un `BigInt` a centavos, si cabe en un entero seguro.
 * @throws RangeError si no cabe.
 */
function deBigInt(valor: bigint): Centavos {
	if (valor > mayor || valor < -mayor) throw new RangeError("el monto no cabe en un entero seguro");
	return centavos(Number(valor));
}

/**
 * Divide redondeando al más cercano, con la mitad lejos del cero.
 * @param dividendo Cualquier entero.
 * @param divisor Un entero positivo.
 * @returns Un negativo da exactamente el contrario de su positivo: −0.5 es −1 y 0.5 es 1.
 */
function dividirRedondeando(dividendo: bigint, divisor: bigint): bigint {
	const absoluto = dividendo < 0n ? -dividendo : dividendo;
	// (2·|dividendo| + divisor) / (2·divisor), truncado, redondea |dividendo| / divisor con la mitad hacia arriba.
	const redondeado = (2n * absoluto + divisor) / (2n * divisor);
	return dividendo < 0n ? -redondeado : redondeado;
}

/**
 * Lee lo que escribió una persona («1,250», «1250.50», «$1,250.05») y lo vuelve centavos.
 * @param texto Lo que se capturó.
 * @returns Los centavos, o `null` si el texto no es dinero o no cabe en un entero seguro.
 */
export function pesosACentavos(texto: string): Centavos | null {
	const partes = formaDeDinero.exec(texto);
	if (partes === null) return null;
	const [, signo, pesos = "", decimales = ""] = partes;
	const valor = BigInt(pesos.replaceAll(",", "")) * 100n + BigInt(decimales.padEnd(2, "0"));
	try {
		return deBigInt(signo === "-" ? -valor : valor);
	} catch {
		return null;
	}
}

const formatoSinCentavos = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});
const formatoConCentavos = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/**
 * Muestra un monto en pesos de México.
 * @param monto Los centavos.
 * @param opciones `conCentavos` solo donde se aceptan centavos (efectivo contado, fondo y movimientos de caja).
 * @returns «$1,250» o, con centavos, «$1,250.50».
 * @throws RangeError sin centavos, si el monto está a menos de medio peso del entero seguro más grande
 * y redondearlo ya no cabe (más de 90 billones de pesos).
 * Al formato se le pasa el monto como texto decimal exacto, así que nunca pasa por un número con decimales.
 */
export function centavosATexto(monto: Centavos, opciones: { conCentavos?: boolean } = {}): string {
	// Sin centavos se redondea aquí, con la regla del dinero, y no con la del formato.
	const mostrado = opciones.conCentavos === true ? monto : aPesoEntero(monto);
	const absoluto = Math.abs(mostrado);
	const decimal = `${mostrado < 0 ? "-" : ""}${Math.trunc(absoluto / 100)}.${String(absoluto % 100).padStart(2, "0")}`;
	if (!esNumeroDecimal(decimal)) throw new RangeError(`${mostrado} no se pudo escribir como número decimal`);
	const formato = opciones.conCentavos === true ? formatoConCentavos : formatoSinCentavos;
	return formato.format(decimal);
}

/**
 * Un monto como se lee en un mensaje o en la bitácora: «$1,250», o «$1,250.50» si trae centavos.
 * @param monto En centavos, entero.
 * Es la forma de escribir un monto de todos los módulos: Contaduría, la nómina y Tienda en línea.
 */
export function enPesos(monto: number): string {
	return centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });
}

/**
 * Dice si un texto es un número decimal que `Intl.NumberFormat` lee tal cual.
 * @param texto El texto que se revisa.
 * @returns `true` si es «-123.45» o parecido; entonces TypeScript lo acepta como número en texto.
 */
function esNumeroDecimal(texto: string): texto is `${number}` {
	return /^-?\d+\.\d{2}$/.test(texto);
}

/**
 * Redondea un monto a peso entero, al más cercano y con la mitad lejos del cero.
 * @param monto Los centavos.
 * @returns Un múltiplo de 100. Lo usa todo precio que sale de un porcentaje, como el de mayoreo, y
 * `centavosATexto` al mostrar sin centavos, para que la pantalla diga el mismo peso que se guarda.
 * @throws RangeError si el resultado ya no cabe en un entero seguro (montos de más de 90 billones de pesos).
 */
export function aPesoEntero(monto: Centavos): Centavos {
	return deBigInt(dividirRedondeando(BigInt(monto), 100n) * 100n);
}

/**
 * Saca un porcentaje de un monto y lo redondea al centavo.
 * @param monto Los centavos.
 * @param porcentaje Como lo guarda la base (`numeric(6,3)`): 12.5 o «12.500» es el 12.5 %.
 * @returns El porcentaje del monto, en centavos, con la mitad lejos del cero.
 * @throws RangeError si el porcentaje es negativo o tiene más de tres decimales, o si el resultado no
 * cabe en un entero seguro.
 */
export function aplicarPorcentaje(monto: Centavos, porcentaje: number | string): Centavos {
	const partes = formaDePorcentaje.exec(String(porcentaje));
	if (partes === null) throw new RangeError(`${porcentaje} no es un porcentaje con hasta tres decimales`);
	const [, enteros = "", decimales = ""] = partes;
	const milesimas = BigInt(enteros) * 1000n + BigInt(decimales.padEnd(3, "0"));
	return deBigInt(dividirRedondeando(BigInt(monto) * milesimas, 100_000n));
}

/**
 * Descuenta un porcentaje de un monto y lo redondea a peso entero en un solo paso: monto × (1 − % ÷ 100), al
 * peso más cercano y con la mitad lejos del cero.
 * @param monto Los centavos.
 * @param porcentaje Como lo guarda la base (`numeric(6,3)`), de 0 a 100.
 * @returns Un múltiplo de 100. Es el precio sugerido con el porcentaje de un cliente: nunca redondea dos veces.
 * @throws RangeError si el porcentaje no es de 0 a 100 con hasta tres decimales, o si el resultado no cabe en
 * un entero seguro.
 */
export function descontarPorcentajeAPesoEntero(monto: Centavos, porcentaje: number | string): Centavos {
	const partes = formaDePorcentaje.exec(String(porcentaje));
	if (partes === null) throw new RangeError(`${porcentaje} no es un porcentaje con hasta tres decimales`);
	const [, enteros = "", decimales = ""] = partes;
	const milesimas = BigInt(enteros) * 1000n + BigInt(decimales.padEnd(3, "0"));
	if (milesimas > 100_000n) throw new RangeError(`${porcentaje} pasa de 100 %`);
	return deBigInt(dividirRedondeando(BigInt(monto) * (100_000n - milesimas), 10_000_000n) * 100n);
}

/**
 * Reparte un monto entre renglones en proporción, sin perder ni sobrar un centavo
 * (por ejemplo, el IVA proporcional de lo recibido).
 * @param total Los centavos que se reparten; pueden ser negativos.
 * @param proporciones El peso de cada renglón: enteros de cero en adelante, como sus importes en centavos.
 * @returns Un monto por renglón, que suman exactamente el total. Cada uno se aleja menos de un centavo
 * de su parte exacta, y un renglón de peso cero no recibe nada. Los centavos que sobran del redondeo
 * van a los renglones con el resto más grande y, si empatan, al primero.
 * @throws RangeError si no hay renglones, si un peso no es un entero de cero en adelante, o si todos
 * pesan cero y hay algo que repartir.
 */
export function repartir(total: Centavos, proporciones: readonly number[]): Centavos[] {
	if (proporciones.length === 0) throw new RangeError("no hay renglones entre los cuales repartir");
	if (!proporciones.every((peso) => Number.isSafeInteger(peso) && peso >= 0)) {
		throw new RangeError("cada peso tiene que ser un entero de cero en adelante");
	}
	const suma = proporciones.reduce((acumulado, peso) => acumulado + BigInt(peso), 0n);
	if (suma === 0n) {
		if (total !== 0) throw new RangeError("todos los renglones pesan cero y hay un monto que repartir");
		return proporciones.map(() => centavos(0));
	}
	// Se reparte el valor absoluto y al final se le pone el signo, así un negativo se reparte igual.
	const absoluto = BigInt(Math.abs(total));
	const bases = proporciones.map((peso) => (absoluto * BigInt(peso)) / suma);
	const restos = proporciones.map((peso) => (absoluto * BigInt(peso)) % suma);
	let faltan = absoluto - bases.reduce((a, b) => a + b, 0n);
	const porResto = restos
		.map((resto, indice) => ({ resto, indice }))
		.sort((a, b) => (a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1));
	for (const { indice } of porResto) {
		if (faltan === 0n) break;
		bases[indice] = (bases[indice] ?? 0n) + 1n;
		faltan -= 1n;
	}
	return bases.map((parte) => deBigInt(total < 0 && parte !== 0n ? -parte : parte));
}
