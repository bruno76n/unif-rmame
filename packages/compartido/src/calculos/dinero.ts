/**
 * El dinero en centavos: leerlo, mostrarlo, redondearlo, sacar porcentajes y repartirlo.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Dinero»)
 *
 * Todo se hace con enteros: los productos que pueden pasar de un entero seguro se hacen con `BigInt`,
 * y los porcentajes se convierten a milésimas enteras antes de multiplicar. El redondeo es al más
 * cercano, y la mitad, hacia arriba.
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
 * Divide redondeando al más cercano, con la mitad hacia arriba.
 * @param dividendo Cualquier entero.
 * @param divisor Un entero positivo.
 */
function dividirRedondeando(dividendo: bigint, divisor: bigint): bigint {
	// floor((2·dividendo + divisor) / (2·divisor)) redondea al más cercano con la mitad hacia arriba.
	const numerador = 2n * dividendo + divisor;
	const denominador = 2n * divisor;
	const cociente = numerador / denominador;
	return numerador % denominador !== 0n && numerador < 0n ? cociente - 1n : cociente;
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
 * Al formato se le pasa el monto como texto decimal exacto, así que nunca pasa por un número con decimales.
 */
export function centavosATexto(monto: Centavos, opciones: { conCentavos?: boolean } = {}): string {
	const absoluto = Math.abs(monto);
	const decimal = `${monto < 0 ? "-" : ""}${Math.trunc(absoluto / 100)}.${String(absoluto % 100).padStart(2, "0")}`;
	if (!esNumeroDecimal(decimal)) throw new RangeError(`${monto} no se pudo escribir como número decimal`);
	const formato = opciones.conCentavos === true ? formatoConCentavos : formatoSinCentavos;
	return formato.format(decimal);
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
 * Redondea un monto a peso entero, al más cercano y con la mitad hacia arriba.
 * @param monto Los centavos.
 * @returns Un múltiplo de 100. Lo usa todo precio que sale de un porcentaje, como el de mayoreo.
 */
export function aPesoEntero(monto: Centavos): Centavos {
	const resto = ((monto % 100) + 100) % 100;
	return centavos(monto - resto + (resto >= 50 ? 100 : 0));
}

/**
 * Saca un porcentaje de un monto y lo redondea al centavo.
 * @param monto Los centavos.
 * @param porcentaje Como lo guarda la base (`numeric(6,3)`): 12.5 o «12.500» es el 12.5 %.
 * @returns El porcentaje del monto, en centavos.
 * @throws RangeError si el porcentaje es negativo o tiene más de tres decimales.
 */
export function aplicarPorcentaje(monto: Centavos, porcentaje: number | string): Centavos {
	const partes = formaDePorcentaje.exec(String(porcentaje));
	if (partes === null) throw new RangeError(`${porcentaje} no es un porcentaje con hasta tres decimales`);
	const [, enteros = "", decimales = ""] = partes;
	const milesimas = BigInt(enteros) * 1000n + BigInt(decimales.padEnd(3, "0"));
	return deBigInt(dividirRedondeando(BigInt(monto) * milesimas, 100_000n));
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
