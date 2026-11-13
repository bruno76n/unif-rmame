/**
 * Prueba de `inventario.en_transito`: los despachos sin confirmar, el más nuevo primero, con quién debe confirmar (y
 * sus recordatorios), su color de «Sin confirmar» y su botón («Confirmar entrega» en una tienda sin caja con sus
 * renglones, «Recordar» a Bodega); lo confirmado ya no sale; y solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («En tránsito»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { despacharDePrueba, traspasoEnAduana, versionDeDespacho } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Un renglón, en lo que revisa la prueba. */
interface Renglon {
	despacho_id: string;
	folio: string;
	a: string;
	cantidad: string;
	debe_confirmar: string;
	sin_confirmar: { texto: string; color: string };
	boton: string;
	tienda: string | null;
	renglones: { traspaso_linea_id: string; piezas: number }[];
}

describe("En tránsito", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const transito = async () =>
		((await comoAduana(servidor, "inventario.en_transito")) as unknown as { renglones: Renglon[] }).renglones;

	/** Despacha un traspaso nuevo en aduana a un destino. */
	async function despachoA(destino: string): Promise<string> {
		const traspaso = await traspasoEnAduana(servidor, destino);
		const respuesta = await despacharDePrueba(servidor, [traspaso.id]);
		return String((respuesta.cuerpo.resultado as { despacho_id: string }).despacho_id);
	}

	it("el más nuevo primero, con quién confirma, sus recordatorios, su color y su botón", async () => {
		const aTienda = await despachoA("T1");
		const aBodega = await despachoA("BOD");
		await servidor.base.dueno.query("UPDATE despachos SET despachado_en = now() - interval '1 day' WHERE id = $1", [
			aTienda,
		]);
		await mandarAccion(
			servidor,
			"inventario.recordar_despacho",
			{ datos: { despacho_id: aBodega }, version: await versionDeDespacho(servidor, aBodega) },
			"aduana",
		);
		const renglones = await transito();
		const ids = renglones.map((renglon) => renglon.despacho_id);
		expect(ids.indexOf(aBodega)).toBeLessThan(ids.indexOf(aTienda));
		const tienda = renglones.find((renglon) => renglon.despacho_id === aTienda);
		expect(tienda).toMatchObject({
			a: "A Tienda 1",
			cantidad: "8 piezas",
			debe_confirmar: "Encargada de Tienda 1",
			sin_confirmar: { texto: "1 día", color: "ambar" },
			boton: "confirmar_tienda",
			tienda: "Tienda 1",
		});
		expect(tienda?.renglones.map((renglon) => renglon.piezas)).toEqual([5, 3]);
		const bodega = renglones.find((renglon) => renglon.despacho_id === aBodega);
		expect(bodega).toMatchObject({
			debe_confirmar: "Bodega · 1 recordatorio",
			sin_confirmar: { texto: "Salió hoy", color: "verde" },
			boton: "recordar",
		});
		await mandarAccion(
			servidor,
			"inventario.entregar_a_tienda_sin_caja",
			{
				datos: { despacho_id: aTienda, recibio_nombre: "Rosa Pérez", modo: "completo" },
				version: await versionDeDespacho(servidor, aTienda),
			},
			"aduana",
		);
		expect((await transito()).some((renglon) => renglon.despacho_id === aTienda)).toBe(false);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.en_transito");
	});
});
