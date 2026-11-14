/**
 * Prueba del recorte de montos del historial de un documento (`admin.historial_entidad`): el del módulo dueño.
 * Fase 19 · docs/interfaz/comunes.md (`admin.historial_entidad`: «Recorte: el del módulo dueño… Aduana nunca ve precios
 * ahí») y docs/cimientos/ACCESO-Y-PERMISOS.md (la cuenta de soporte nunca recibe un monto)
 */

import { describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { veMontosDelDocumento } from "./historial-entidad.ts";

/** Quienes leen una orden de compra (`compras/permisos.ts`). */
const lectoresDeOrdenes = ["compras", "contaduria", "aduana"];

/**
 * Una cuenta de prueba con estos departamentos.
 * @param departamentos Sus departamentos.
 */
function cuentaCon(...departamentos: string[]) {
	const base = quienesDePrueba.ventas;
	if (base?.tipo !== "cuenta") throw new Error("falta la cuenta de prueba");
	return { ...base, departamentos };
}

describe("el historial de un documento recorta sus montos como el módulo dueño", () => {
	it("no manda lo que la cuenta no debe ver: con Aduana y Mantenimiento, una orden de compra va sin montos", () => {
		expect(veMontosDelDocumento(cuentaCon("aduana", "mantenimiento"), lectoresDeOrdenes)).toBe(false);
		expect(veMontosDelDocumento(cuentaCon("aduana"), lectoresDeOrdenes)).toBe(false);
	});

	it("Compras y Contaduría ven los montos de la orden; la dueña, siempre; la cuenta de soporte, nunca", () => {
		expect(veMontosDelDocumento(cuentaCon("compras"), lectoresDeOrdenes)).toBe(true);
		expect(veMontosDelDocumento(cuentaCon("aduana", "contaduria"), lectoresDeOrdenes)).toBe(true);
		const duena = quienesDePrueba.duena;
		const soporte = quienesDePrueba.soporte;
		if (duena?.tipo !== "cuenta" || soporte?.tipo !== "cuenta") throw new Error("faltan cuentas de prueba");
		expect(veMontosDelDocumento(duena, lectoresDeOrdenes)).toBe(true);
		expect(veMontosDelDocumento({ ...soporte, departamentos: ["compras"] }, lectoresDeOrdenes)).toBe(false);
	});
});
