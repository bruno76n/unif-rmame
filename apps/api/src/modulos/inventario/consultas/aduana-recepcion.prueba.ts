/**
 * Prueba de `inventario.aduana_recepcion` con los datos de la muestra y lo que pone cada caso: los cuatro grupos
 * siempre, en su orden; las órdenes de la ventana de días de la que llega antes a la que llega después y las demás con
 * `todas_las_ordenes`; un lote revisado y un reproceso aprobado «Del taller»; lo que surtió Bodega; y que solo la pide
 * Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («Recepción»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aprobarReprocesoDePrueba, loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedidoLineaEnBodega, surtirPedidoLinea } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, recibirLoteDePrueba, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Recepcion {
	grupos: {
		clave: string;
		titulo: string;
		resumen: string;
		renglones: {
			titulo: string;
			detalle: string;
			cantidad: string;
			destino: string;
			abre: { a: string; id: string };
		}[];
	}[];
	ordenes_fuera: number;
}

describe("Recepción de Aduana: lo que espera entrar", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const recepcion = async (parametros: Record<string, string> = {}) =>
		(await comoAduana(servidor, "inventario.aduana_recepcion", parametros)) as unknown as Recepcion;

	it("los cuatro grupos, siempre y en su orden; las órdenes de la ventana, y todas al pedirlas", async () => {
		const datos = await recepcion();
		expect(datos.grupos.map((grupo) => grupo.titulo)).toEqual([
			"Del taller",
			"De bodega",
			"De proveedores",
			"De las tiendas y de clientes",
		]);
		const proveedores = datos.grupos[2];
		for (const renglon of proveedores?.renglones ?? []) {
			expect(renglon.abre.a).toBe("material");
			expect(renglon.destino).toBe("Bodega");
		}
		const todas = await recepcion({ todas_las_ordenes: "true" });
		expect(todas.grupos[2]?.renglones.length).toBe((proveedores?.renglones.length ?? 0) + datos.ordenes_fuera);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM ordenes_compra WHERE estado IN ('enviada', 'recibida_en_parte')",
		);
		expect(todas.grupos[2]?.renglones.length).toBe(rows[0]?.n);
		expect(datos.grupos[3]?.resumen).toBe("Nada por recibir");
	});

	it("del taller: el lote revisado y el reproceso aprobado; de bodega, lo que surtió", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		// Un reproceso se aprueba cuando Aduana ya recibió su lote.
		const conReproceso = await loteRevisado(servidor, siembra, [5, 3, 0], 2);
		await recibirLoteDePrueba(servidor, conReproceso);
		expect((await aprobarReprocesoDePrueba(servidor, conReproceso.reprocesoId ?? "")).estado).toBe(200);
		const lote = await loteRevisado(servidor, siembra, [5, 3, 0]);
		const enLinea = await pedidoLineaEnBodega(servidor, 1);
		const surtido = await surtirPedidoLinea(servidor, enLinea.id);
		const datos = await recepcion();
		const taller = datos.grupos[0];
		expect(taller?.resumen).toBe("2 por recibir · lotes y reprocesos revisados por calidad · conteo ciego");
		const delLote = taller?.renglones.find((renglon) => renglon.abre.id === lote.loteId);
		expect(delLote?.detalle).toBe(`${lote.folio} · revisado por calidad`);
		expect(delLote?.abre.a).toBe("taller");
		const delReproceso = taller?.renglones.find((renglon) => renglon.abre.id === conReproceso.reprocesoId);
		expect(delReproceso?.detalle).toMatch(/-R\d+ · reproceso aprobado$/);
		expect(delReproceso?.abre.a).toBe("reproceso");
		const deBodega = datos.grupos[1]?.renglones.find((renglon) => renglon.abre.id === surtido.traspasoId);
		expect(deBodega?.abre.a).toBe("camino");
		expect(deBodega?.destino).toBe("En línea");
		expect(datos.grupos[1]?.resumen).toMatch(/^1 por recibir · lo que surtió bodega$/);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.aduana_recepcion");
	});
});
