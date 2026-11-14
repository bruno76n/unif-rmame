/**
 * Prueba del arnés: sus revisiones encuentran lo que no cuadra (una existencia que no es su libro, un cuadre con residuo,
 * lo que una cuenta no debía ver) y su noche avanza un día cada vez. Si el arnés no viera una falla, los flujos pasarían
 * sin demostrar nada.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1: «las revisiones de lo que tiene que cuadrar»)
 *
 * Es la única prueba que escribe en la base por su lado: mete a propósito la falla que la revisión tiene que encontrar.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../../apps/api/src/nucleo/pruebas/cuentas-de-prueba.ts";
import { type Fabrica, levantarFabrica } from "./fabrica.ts";
import { loQueNoDebiaVer, loQueNoDebiaVerEnUnPdf } from "./vistas.ts";

/**
 * Una cuenta de prueba por su nombre.
 * @param nombre Su nombre.
 */
function cuenta(nombre: string) {
	const quien = quienesDePrueba[nombre];
	if (quien === undefined) throw new Error(`no hay cuenta ${nombre}`);
	return quien;
}

describe("lo que cada cuenta no debe ver", () => {
	const sueldos = new Set(["sueldo_semanal_centavos"]);

	it("soporte no recibe ningún monto, ni escrito en un texto; el tapado no cuenta", () => {
		expect(loQueNoDebiaVer(cuenta("soporte"), sueldos, { resultado: { total_centavos: 100 } })).toEqual([
			"resultado.total_centavos",
		]);
		expect(loQueNoDebiaVer(cuenta("soporte"), sueldos, { avisos: ["Precio $215"] })).toEqual([
			"avisos.0: «Precio $215»",
		]);
		expect(loQueNoDebiaVer(cuenta("soporte"), sueldos, { aviso: "Precio $••••" })).toEqual([]);
	});

	it("Aduana y Bodega no reciben un precio de venta; Rosa sí; nadie sin el permiso recibe un sueldo", () => {
		const nota = { resultado: { prendas: [{ precio_unitario_centavos: 21_000, piezas: 20 }] } };
		expect(loQueNoDebiaVer(cuenta("javier"), sueldos, nota)).toEqual(["resultado.prendas.0.precio_unitario_centavos"]);
		expect(loQueNoDebiaVer(cuenta("rosa"), sueldos, nota)).toEqual([]);
		expect(loQueNoDebiaVer(cuenta("tomas"), sueldos, { sueldo_semanal_centavos: 1 })).toEqual([
			"sueldo_semanal_centavos",
		]);
		expect(loQueNoDebiaVerEnUnPdf(cuenta("javier"), "Total 70 $14,700")).toHaveLength(1);
		expect(loQueNoDebiaVerEnUnPdf(cuenta("rosa"), "Total 70 $14,700")).toEqual([]);
	});
});

describe("las revisiones de lo que tiene que cuadrar", () => {
	let fabrica: Fabrica;
	beforeAll(async () => {
		fabrica = await levantarFabrica();
	});
	afterAll(async () => {
		await fabrica?.cerrar();
	});

	it("con la muestra todo cuadra; una existencia que no es su libro se ve, la noche la deja con residuo y todo falla", async () => {
		expect(fabrica.cuadreDeLaMuestra.estado).not.toBe("fallo");
		await fabrica.revisar.todo();
		// Una existencia de más, sin su movimiento.
		const [una] = await fabrica.leer("SELECT ubicacion_id, variante_id FROM existencias WHERE piezas > 0 LIMIT 1");
		await fabrica.servidor.base.dueno.query(
			"UPDATE existencias SET piezas = piezas + 1 WHERE ubicacion_id = $1 AND variante_id = $2",
			[una?.ubicacion_id, una?.variante_id],
		);
		expect(await fabrica.revisar.existencias()).toHaveLength(1);
		const { cuadre } = await fabrica.revisar.noche();
		expect(cuadre.estado).toBe("con_residuo");
		expect(cuadre.proyecciones_corregidas).toBe(1);
		// El cuadre ya la corrigió; la siguiente noche, otro día, cuadra.
		expect(await fabrica.revisar.existencias()).toEqual([]);
		const siguiente = await fabrica.revisar.noche();
		expect(siguiente.cuadre.fecha > cuadre.fecha).toBe(true);
	});

	it("una llamada que trae lo que la cuenta no debía ver falla en ese paso", async () => {
		const nota = await fabrica.leer("SELECT id FROM notas_entrega WHERE estado <> 'cancelada' LIMIT 1");
		const deRosa = await fabrica.como("rosa").pdf("nota_entrega", String(nota[0]?.id));
		expect(deRosa.texto).toContain("$");
		// Javier recibe la misma nota sin precios: la revisión no se queja.
		const deJavier = await fabrica.como("javier").pdf("nota_entrega", String(nota[0]?.id));
		expect(deJavier.estado).toBe(200);
		expect(deJavier.texto).not.toContain("$");
	});
});
