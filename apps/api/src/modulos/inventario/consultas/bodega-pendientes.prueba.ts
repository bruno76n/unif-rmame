/**
 * Prueba de `inventario.bodega_pendientes` con los datos de la muestra: las cifras, lo que regresa del corte, las
 * entregas al corte (con receta y esperando receta), un pedido por surtir con lo apartado para «No la encuentro», una
 * diferencia por contar y una excepción por resolver, el orden por color, el filtro por grupo, la pastilla de la
 * pestaña, «Variantes en cero», y que solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	abrirDiferenciaYExcepcion,
	apartarEnBodega,
	pedir,
	soloBodegaYSinPrecios,
	valorDe,
} from "./bodega-de-prueba.ts";

/** Un renglón de Pendientes, en lo que revisa la prueba. */
interface Renglon {
	grupo: string;
	tipo: string;
	titulo: string;
	detalle: string;
	estado: { texto: string; color: string };
	boton: string | null;
	documento_id: string;
	apartadas: { reserva_id: string }[];
}

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Pendientes {
	indicadores: {
		existencia: { total: number; bodega: number; tiendas: number; demas: number };
		por_surtir: { total: number; en_linea: number };
		diferencias: { piezas: number; registros: number };
		ajustes: number;
		en_cero: number;
	};
	conteos: Record<string, number>;
	renglones: Renglon[];
	pastilla: { conteo: number; rojo: boolean };
	en_cero: { total: number; renglones: { disponible: string; ubicacion: string }[] };
}

describe("Pendientes de Bodega: las cifras, lo que toca hacer y las variantes en cero", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Bodega. */
	const pendientes = async (parametros: Record<string, string> = {}) =>
		(await pedir(servidor, "inventario.bodega_pendientes", parametros)) as unknown as Pendientes;

	it("las cifras: la existencia de la muestra por ubicación y el ajuste que espera a Dirección", async () => {
		const { indicadores } = await pendientes();
		const total = Number(await valorDe(servidor, "SELECT coalesce(sum(piezas), 0) FROM existencias"));
		expect(indicadores.existencia.total).toBe(total);
		expect(indicadores.existencia.bodega + indicadores.existencia.tiendas + indicadores.existencia.demas).toBe(total);
		expect(indicadores.ajustes).toBe(1);
		expect(indicadores.por_surtir).toEqual({ total: 0, en_linea: 0 });
	});

	it("lo que regresa del corte, por recibir; las entregas al corte y las que esperan receta, en gris y sin botón", async () => {
		const { renglones } = await pendientes();
		const regresos = renglones.filter((renglon) => renglon.tipo === "retazo" || renglon.tipo === "rollo_corte");
		expect(regresos).toHaveLength(2);
		for (const regreso of regresos) {
			expect(regreso).toMatchObject({ grupo: "materiales", estado: { texto: "Por recibir", color: "ambar" } });
			expect(regreso.boton).toBe("recibir_corte");
		}
		expect(regresos.find((regreso) => regreso.tipo === "retazo")?.titulo).toMatch(/^RZ-/);
		const entregas = renglones.filter((renglon) => renglon.tipo === "entrega_corte");
		expect(entregas.length).toBeGreaterThan(0);
		for (const entrega of entregas) {
			if (entrega.estado.texto === "Esperando receta") {
				expect(entrega).toMatchObject({ boton: null, estado: { color: "gris" } });
				expect(entrega.detalle).toMatch(/alta la receta para saber cuánta/);
			} else {
				expect(entrega.boton).toBe("entregar_tela");
				expect(entrega.estado.texto).toMatch(/^Por entregar · corte/);
			}
		}
	});

	it("un pedido por surtir trae lo apartado; la diferencia por contar y la excepción salen con su botón, rojo primero", async () => {
		const apartado = await apartarEnBodega(servidor);
		const abiertas = await abrirDiferenciaYExcepcion(servidor);
		try {
			const datos = await pendientes();
			const pedido = datos.renglones.find((renglon) => renglon.documento_id === apartado.pedido);
			expect(pedido).toMatchObject({
				tipo: "pedido_externo",
				grupo: "surtido",
				boton: "surtir",
				estado: { texto: "Por surtir", color: "ambar" },
			});
			expect(pedido?.apartadas.map((pieza) => pieza.reserva_id)).toEqual([apartado.reserva]);
			expect(datos.indicadores.por_surtir.total).toBe(1);
			expect(datos.renglones.find((renglon) => renglon.documento_id === abiertas.diferencia)).toMatchObject({
				tipo: "diferencia",
				boton: "contar",
				estado: { texto: "Por contar", color: "ambar" },
			});
			expect(datos.renglones.find((renglon) => renglon.documento_id === abiertas.excepcion)).toMatchObject({
				boton: "resolver",
				estado: { texto: "Por resolver", color: "rojo" },
			});
			// Rojo, ámbar, gris: ningún color va antes de uno que le gana.
			const rangos = datos.renglones.map((renglon) => ["rojo", "ambar", "gris"].indexOf(renglon.estado.color));
			expect(rangos).toEqual([...rangos].sort((uno, otro) => uno - otro));
			const esperandoReceta = datos.renglones.filter((renglon) => renglon.estado.texto === "Esperando receta");
			expect(datos.pastilla.conteo).toBe(datos.renglones.length - esperandoReceta.length);
			expect(datos.pastilla.rojo).toBe(true);
			const soloSurtido = await pendientes({ grupo: "surtido" });
			expect(soloSurtido.renglones.map((renglon) => renglon.grupo)).toEqual(["surtido"]);
			expect(soloSurtido.conteos).toEqual(datos.conteos);
			expect(datos.conteos.excepciones).toBe(1);
		} finally {
			await apartado.quitar();
			await abiertas.quitar();
		}
	});

	it("«Variantes en cero» cuenta las de la cuenta del reabasto y muestra hasta 8", async () => {
		const { en_cero, indicadores } = await pendientes();
		expect(en_cero.total).toBe(indicadores.en_cero);
		expect(en_cero.renglones.length).toBe(Math.min(8, en_cero.total));
		for (const renglon of en_cero.renglones)
			expect(["en_camino", "bodega", "sin_existencia"]).toContain(renglon.disponible);
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.bodega_pendientes");
	});
});
