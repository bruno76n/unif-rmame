/**
 * Prueba de `inventario.aduana_historial` con los datos de la muestra y lo que pone cada caso: lo que entró (las
 * órdenes de compra recibidas, lo que venía en camino) y lo que salió (los despachos, lo que confirmó Bodega, las notas
 * entregadas), lo más reciente primero, con su texto; pagina; y solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («Historial»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { despacharDePrueba, traspasoEnAduana } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Un renglón, en lo que revisa la prueba. */
interface Renglon {
	clave: string;
	fecha: string;
	movimiento: { texto: string; color: string };
	referencia: string;
	que: string;
}

/** Una página. */
interface Pagina {
	renglones: Renglon[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("El historial de Aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const historial = async (parametros: Record<string, string> = {}) =>
		(await comoAduana(servidor, "inventario.aduana_historial", parametros)) as unknown as Pagina;

	it("lo que entró y salió de la muestra, con su texto y su color", async () => {
		const { renglones } = await historial({ limite: "100" });
		const entro = renglones.filter((renglon) => renglon.movimiento.texto === "Entró");
		const salio = renglones.filter((renglon) => renglon.movimiento.texto === "Salió");
		for (const renglon of entro) expect(renglon.movimiento.color).toBe("verde");
		for (const renglon of salio) expect(renglon.movimiento.color).toBe("ambar");
		const orden = entro.find((renglon) => renglon.referencia.startsWith("OC-"));
		expect(orden?.que).toMatch(/: [\d.,]+ (m en \d+ rollos?|\S+)/);
		const despacho = salio.find((renglon) => renglon.referencia.startsWith("D-"));
		expect(despacho?.que).toMatch(/^A .+: /);
		expect(salio.some((renglon) => /^Bodega (confirmó|recibió)/.test(renglon.que))).toBe(true);
		expect(salio.some((renglon) => /^Entregada a .+: \d+ piezas?, recibió /.test(renglon.que))).toBe(true);
	});

	it("lo más reciente primero, y pagina", async () => {
		const traspaso = await traspasoEnAduana(servidor, "T2");
		const respuesta = await despacharDePrueba(servidor, [traspaso.id]);
		const folio = String((respuesta.cuerpo.resultado as { folio: string }).folio);
		const primera = await historial({ limite: "2" });
		expect(primera.renglones[0]).toMatchObject({ referencia: folio, que: "A Tienda 2: 8 piezas" });
		expect(primera.hay_mas).toBe(true);
		const segunda = await historial({ limite: "2", cursor: primera.cursor ?? "" });
		const claves = new Set(primera.renglones.map((renglon) => renglon.clave));
		for (const renglon of segunda.renglones) expect(claves.has(renglon.clave)).toBe(false);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.aduana_historial");
	});
});
