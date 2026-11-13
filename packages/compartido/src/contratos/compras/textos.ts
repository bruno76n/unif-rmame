/**
 * Los textos con datos de las pantallas de Compras, como funciones puras: los arman las consultas de Compras en la API
 * y los usa la web mientras se escribe (la cantidad por pedir, el precio que cambia), así las dos dicen lo mismo.
 * Fase 19 · docs/interfaz/fabrica/compras.md y docs/interfaz/TEXTOS.md (reglas 5 y 6)
 *
 * Las cantidades llegan como texto decimal (como las guarda la base) o en milésimos; el dinero, en centavos.
 */

import { aMilesimosConSigno } from "../../calculos/cuenta-material.ts";
import { centavosATexto } from "../../calculos/dinero.ts";
import { plural } from "../../calculos/textos.ts";
import { centavos } from "../../tipos/base.ts";

/** El separador de miles de México. */
const miles = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/**
 * Una cantidad como se lee en pantalla, con separador de miles y sin ceros de más: «1,700», «12.5».
 * @param cantidad En milésimos, o como texto decimal («1700.000»).
 */
export function cifraEnTexto(cantidad: bigint | string): string {
	const milesimos = typeof cantidad === "string" ? aMilesimosConSigno(cantidad) : cantidad;
	const signo = milesimos < 0n ? "−" : "";
	const valor = milesimos < 0n ? -milesimos : milesimos;
	const decimales = String(valor % 1000n)
		.padStart(3, "0")
		.replace(/0+$/, "");
	return `${signo}${miles.format(valor / 1000n)}${decimales === "" ? "" : `.${decimales}`}`;
}

/**
 * Una cantidad con su unidad: «1,700 m», «48 conos», «1 cono». Las unidades que se cuentan en plural («conos»,
 * «cajas») van en singular con una.
 * @param cantidad En milésimos, o como texto decimal.
 * @param unidad La unidad de inventario del material, como la nombra su lista.
 */
export function cantidadConUnidad(cantidad: bigint | string, unidad: string): string {
	const texto = cifraEnTexto(cantidad);
	const enSingular = texto === "1" && unidad.length > 3 && unidad.endsWith("s") ? unidad.slice(0, -1) : unidad;
	return `${texto} ${enSingular}`;
}

/**
 * Un precio o un importe de compra: «$78», «$0.38», «$46,200»; «—» si no llegó (el servidor lo recortó).
 * @param monto Los centavos.
 */
export function pesos(monto: number | null | undefined): string {
	if (monto === null || monto === undefined) return "—";
	return centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });
}

/**
 * La condición de pago de un proveedor o de una orden: «Contado» o «Crédito {n} días».
 * @param dias Los días de crédito; 0 es contado.
 */
export function condicionDePago(dias: number): string {
	return dias === 0 ? "Contado" : `Crédito ${plural(dias, "día", "días")}`;
}

/** Las ladas de dos dígitos de México: el número va «33 5550 0178»; los demás, «477 555 0142». */
const ladasDeDos = ["33", "55", "56", "81"];

/**
 * Un teléfono de 10 dígitos como se lee: «33 5550 0178» o «477 555 0142».
 * @param digitos Los 10 dígitos, como se guardan.
 */
export function telefonoEnTexto(digitos: string): string {
	if (!/^\d{10}$/.test(digitos)) return digitos;
	return ladasDeDos.includes(digitos.slice(0, 2))
		? `${digitos.slice(0, 2)} ${digitos.slice(2, 6)} ${digitos.slice(6)}`
		: `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
}

/** Cuándo llega algo, como se dice junto a su fecha: «mañana», «en 3 días», «hace 5 días», «hoy». */
export function cuandoLlega(dias: number): string {
	if (dias === 0) return "hoy";
	if (dias === 1) return "mañana";
	return dias > 0 ? `en ${plural(dias, "día", "días")}` : `hace ${plural(-dias, "día", "días")}`;
}

/**
 * El cambio de un precio contra el que se pagó antes, como lo marca Levantar orden y la lista de precios del material:
 * «Sube 8 % · antes $78» o «Baja 5 % · antes $96»; en ámbar desde `compras.umbral_cambio_precio_pct`. Solo marca: no
 * detiene nada.
 * @param anterior El precio anterior en centavos, si hay.
 * @param nuevo El precio nuevo en centavos.
 * @param umbral Desde qué cambio, en por ciento, va en ámbar.
 * @returns El texto y si va en ámbar, o `null` si no hay anterior o es el mismo.
 */
export function cambioDePrecio(
	anterior: number | null | undefined,
	nuevo: number,
	umbral: number,
): { texto: string; ambar: boolean } | null {
	if (anterior === null || anterior === undefined || anterior <= 0 || anterior === nuevo) return null;
	const cambio = (Math.abs(nuevo - anterior) * 100) / anterior;
	return {
		texto: `${nuevo > anterior ? "Sube" : "Baja"} ${Math.round(cambio)} % · antes ${pesos(anterior)}`,
		ambar: cambio >= umbral,
	};
}

/** Lo que se necesita para revisar una cantidad por pedir. */
export interface ReglasDeCantidad {
	/** Lo que se compra junto, entero. */
	multiplo: number;
	/** `compras.cantidad_maxima_linea`. */
	maxima: number;
	/** La unidad de inventario. */
	unidad: string;
}

/** Lo que tiene de malo una cantidad entera por pedir, con su código de la API y su mensaje. */
export interface FallaDeCantidad {
	codigo: "cantidad_demasiada" | "no_es_multiplo";
	mensaje: string;
}

/**
 * La regla de la cantidad de una línea de compra: hasta la máxima y múltiplo de lo que se compra junto. Es la única:
 * la usan `compras.levantar_orden` (con su código, al guardar) y la pantalla (mientras se escribe).
 * @param cantidad La cantidad, entera y mayor que 0.
 * @param reglas El múltiplo, la máxima y la unidad.
 * @returns Lo que tiene de malo, o `null` si está bien.
 */
export function fallaDeCantidad(cantidad: number, reglas: ReglasDeCantidad): FallaDeCantidad | null {
	if (cantidad > reglas.maxima) return { codigo: "cantidad_demasiada", mensaje: "Es demasiado: revisa la cantidad" };
	if (cantidad % reglas.multiplo !== 0) {
		const cercana = Math.max(reglas.multiplo, Math.round(cantidad / reglas.multiplo) * reglas.multiplo);
		return {
			codigo: "no_es_multiplo",
			mensaje: `Se compra de ${reglas.multiplo} en ${reglas.multiplo} ${reglas.unidad}. Prueba con ${cercana}`,
		};
	}
	return null;
}

/**
 * Revisa una cantidad por pedir como la revisan el contrato y `compras.levantar_orden`: escrita, entera, más de 0 y lo
 * de `fallaDeCantidad`.
 * @param texto Lo que se escribió.
 * @param reglas El múltiplo, la máxima y la unidad.
 * @returns El mensaje de error, o `null` si está bien.
 */
export function errorDeCantidad(texto: string, reglas: ReglasDeCantidad): string | null {
	const limpio = texto.replaceAll(",", "").trim();
	if (limpio === "" || !/^-?\d+$/.test(limpio)) return "Escribe cuánto pedir";
	const cantidad = Number(limpio);
	if (cantidad <= 0) return "Tiene que ser más de 0";
	return fallaDeCantidad(cantidad, reglas)?.mensaje ?? null;
}
