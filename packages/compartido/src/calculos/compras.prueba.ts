/**
 * Prueba de los textos con datos de Compras y de la regla de la cantidad por pedir: lo que arman las consultas y las
 * acciones de Compras y lo que la web dice mientras se escribe.
 * Fase 19 · docs/interfaz/fabrica/compras.md y docs/interfaz/TEXTOS.md (reglas 5 y 6)
 */

import { describe, expect, it } from "vitest";
import {
	cambioDePrecio,
	cantidadConUnidad,
	cifraEnTexto,
	condicionDePago,
	cuandoLlega,
	errorDeCantidad,
	fallaDeCantidad,
	telefonoEnTexto,
} from "./compras.ts";

describe("Una cantidad se lee con separador de miles, sin ceros de más y con su unidad", () => {
	it("del texto decimal de la base o de milésimos", () => {
		expect(cifraEnTexto("1700.000")).toBe("1,700");
		expect(cifraEnTexto(12_500n)).toBe("12.5");
		expect(cifraEnTexto("-3.250")).toBe("−3.25");
	});

	it("con una, la unidad que se cuenta va en singular", () => {
		expect(cantidadConUnidad("48", "conos")).toBe("48 conos");
		expect(cantidadConUnidad("1", "conos")).toBe("1 cono");
		expect(cantidadConUnidad("1", "m")).toBe("1 m");
	});
});

describe("La condición de pago, el teléfono y cuándo llega se escriben como en la guía", () => {
	it("contado o crédito con sus días", () => {
		expect(condicionDePago(0)).toBe("Contado");
		expect(condicionDePago(30)).toBe("Crédito 30 días");
	});

	it("el teléfono con su lada de dos o de tres dígitos", () => {
		expect(telefonoEnTexto("3355500178")).toBe("33 5550 0178");
		expect(telefonoEnTexto("4775550142")).toBe("477 555 0142");
		expect(telefonoEnTexto("12345")).toBe("12345");
	});

	it("hoy, mañana, en n días o hace n días", () => {
		expect(cuandoLlega(0)).toBe("hoy");
		expect(cuandoLlega(1)).toBe("mañana");
		expect(cuandoLlega(3)).toBe("en 3 días");
		expect(cuandoLlega(-5)).toBe("hace 5 días");
	});
});

describe("El cambio de un precio se marca contra el anterior, en ámbar desde el umbral", () => {
	it("sube o baja con su por ciento y el precio de antes", () => {
		expect(cambioDePrecio(7800, 8424, 5)).toEqual({ texto: "Sube 8 % · antes $78", ambar: true });
		expect(cambioDePrecio(10_000, 9800, 5)).toEqual({ texto: "Baja 2 % · antes $100", ambar: false });
		expect(cambioDePrecio(38, 40, 50)).toEqual({ texto: "Sube 5 % · antes $0.38", ambar: false });
	});

	it("sin anterior o con el mismo precio no marca nada", () => {
		expect(cambioDePrecio(null, 8000, 5)).toBeNull();
		expect(cambioDePrecio(8000, 8000, 5)).toBeNull();
	});
});

describe("La regla de la cantidad por pedir es una sola: hasta la máxima y múltiplo de lo que se compra junto", () => {
	const reglas = { multiplo: 12, maxima: 1000, unidad: "conos" };

	it("dice el código de la API y la cantidad más cercana que sí se puede", () => {
		expect(fallaDeCantidad(1200, reglas)).toEqual({
			codigo: "cantidad_demasiada",
			mensaje: "Es demasiado: revisa la cantidad",
		});
		expect(fallaDeCantidad(50, reglas)).toEqual({
			codigo: "no_es_multiplo",
			mensaje: "Se compra de 12 en 12 conos. Prueba con 48",
		});
		expect(fallaDeCantidad(48, reglas)).toBeNull();
	});

	it("lo escrito se revisa igual que en la acción: escrito, entero y más de 0", () => {
		expect(errorDeCantidad("", reglas)).toBe("Escribe cuánto pedir");
		expect(errorDeCantidad("4.5", reglas)).toBe("Escribe cuánto pedir");
		expect(errorDeCantidad("0", reglas)).toBe("Tiene que ser más de 0");
		expect(errorDeCantidad("1,200", reglas)).toBe("Es demasiado: revisa la cantidad");
		expect(errorDeCantidad("96", reglas)).toBeNull();
	});
});
