/**
 * Prueba de `inventario.detalle_recibir_en_camino`: lo que surtió Bodega trae su versión, de dónde viene y lo que
 * mandó por renglón; un reproceso aprobado se cuenta a ciegas (sin lo aprobado ni renglones); uno que no existe da
 * `404`; y solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/modulos/inventario/recepcion-del-taller.md (regla 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aprobarReprocesoDePrueba, loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedidoLineaEnBodega, surtirPedidoLinea } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, recibirLoteDePrueba, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	tipo: string;
	version: number | null;
	folio: string;
	de: string;
	que: string;
	mandaron: string;
	va_a: string;
	renglones: { prenda: string; mandaron: string; es_material: boolean }[];
}

describe("El cajón Recibir lo que viene en camino", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("lo que surtió Bodega: su versión, de dónde viene y lo que mandó por renglón", async () => {
		const surtido = await surtirPedidoLinea(servidor, (await pedidoLineaEnBodega(servidor, 2)).id);
		const parametros = { traspaso_id: surtido.traspasoId ?? "" };
		const detalle = (await comoAduana(
			servidor,
			"inventario.detalle_recibir_en_camino",
			parametros,
		)) as unknown as Detalle;
		expect(detalle).toMatchObject({ tipo: "camino", de: "Bodega", mandaron: "2 piezas", va_a: "En línea" });
		expect(detalle.version).toBeGreaterThan(0);
		expect(detalle.renglones).toHaveLength(1);
		expect(detalle.renglones[0]).toMatchObject({ mandaron: "2", es_material: false });
		await soloAduanaYSinPrecios(servidor, "inventario.detalle_recibir_en_camino", parametros);
	});

	it("un reproceso aprobado se cuenta a ciegas: ni lo aprobado ni renglones", async () => {
		const lote = await loteRevisado(servidor, await siembraDelCatalogo(servidor), [5, 3, 0], 2);
		await recibirLoteDePrueba(servidor, lote);
		expect((await aprobarReprocesoDePrueba(servidor, lote.reprocesoId ?? "")).estado).toBe(200);
		const detalle = (await comoAduana(servidor, "inventario.detalle_recibir_en_camino", {
			reproceso_id: lote.reprocesoId ?? "",
		})) as unknown as Detalle;
		expect(detalle.tipo).toBe("reproceso");
		expect(detalle.version).toBeNull();
		expect(detalle.folio).toMatch(new RegExp(`^${lote.folio}-R\\d+$`));
		expect(detalle.que).toMatch(/ talla 4$/);
		expect(detalle.mandaron).toBe("");
		expect(detalle.renglones).toEqual([]);
	});

	it("lo que no viene en camino da 404", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_recibir_en_camino",
			{ traspaso_id: "01936f2e-0000-7000-8000-00000000dead" },
			"aduana",
		);
		expect(respuesta.estado).toBe(404);
	});
});
