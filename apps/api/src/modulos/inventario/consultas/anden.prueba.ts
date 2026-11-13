/**
 * Prueba de `inventario.anden` con los datos de la muestra y lo que pone cada caso: las cuatro cifras, los carriles en
 * su orden, lo que entra (las órdenes de compra de la ventana, un lote revisado sin lo aprobado, lo que viene de
 * Bodega), lo que está en aduana en el carril de su destino con su antigüedad y su «Sale hoy», el conteo de cada
 * pestaña, y que solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…») y docs/interfaz/fabrica/aduana.md
 * («Andén»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { traspasoEnAduana } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Anden {
	cifras: { por_recibir: number; salidas: number; parados: number; dias_parado: number };
	pestanas: { recepcion: number; parados: number };
	carriles: {
		clave: string;
		nombre: string;
		tarjetas: {
			titulo: string;
			detalle: string;
			cantidad: string;
			etiqueta: { texto: string; color: string } | null;
			marca: { texto: string; color: string | null };
			abre: { a: string; id: string };
		}[];
	}[];
}

describe("El andén de Aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const anden = async () => (await comoAduana(servidor, "inventario.anden")) as unknown as Anden;

	it("los carriles en su orden; «Entra» trae las órdenes de compra de la ventana, con su marca", async () => {
		const datos = await anden();
		expect(datos.carriles.map((carril) => carril.nombre)).toEqual([
			"Entra",
			"Tienda 1",
			"Tienda 2",
			"En línea",
			"Clientes externos",
			"Bodega",
			"Calidad",
		]);
		const entra = datos.carriles[0]?.tarjetas ?? [];
		const ordenes = entra.filter((tarjeta) => tarjeta.abre.a === "material");
		expect(ordenes.length).toBeGreaterThan(0);
		for (const orden of ordenes) {
			expect(orden.detalle).toMatch(/^OC-\d+ · /);
			expect(orden.marca.texto).toMatch(/^(mañana|hoy|en \d+ días|Debía llegar el .+)$/);
		}
		expect(datos.cifras.por_recibir).toBe(entra.length);
		expect(datos.pestanas.recepcion).toBe(entra.length);
	});

	it("lo que está en aduana va en el carril de su destino, con su antigüedad y «Sale hoy»; cuenta en sus cifras", async () => {
		const antes = await anden();
		const enTienda = await traspasoEnAduana(servidor, "T1");
		await servidor.base.dueno.query(
			`UPDATE traspasos SET llego_aduana_en = now() - interval '4 days', fecha_salida_esperada = (now() AT TIME ZONE 'America/Mexico_City')::date
			WHERE id = $1`,
			[enTienda.id],
		);
		const datos = await anden();
		const tienda1 = datos.carriles.find((carril) => carril.nombre === "Tienda 1");
		const tarjeta = tienda1?.tarjetas.find((una) => una.abre.id === enTienda.id);
		expect(tarjeta?.titulo).toBe("Solicitud de Tienda 1");
		expect(tarjeta?.detalle).toBe("8 prendas, surtido de bodega");
		expect(tarjeta?.cantidad).toBe("8 piezas");
		expect(tarjeta?.marca).toEqual({ texto: "4 días en aduana", color: "rojo" });
		expect(tarjeta?.etiqueta).toEqual({ texto: "Sale hoy", color: "rojo" });
		expect(tarjeta?.abre.a).toBe("despachar");
		expect(datos.cifras.salidas).toBe(antes.cifras.salidas + 1);
		expect(datos.cifras.parados).toBe(antes.cifras.parados + 1);
		expect(datos.cifras.dias_parado).toBe(3);
		expect(datos.pestanas.parados).toBe(antes.pestanas.parados + 1);
	});

	it("un lote revisado entra «Del taller» sin decir lo que aprobó Calidad", async () => {
		const lote = await loteRevisado(servidor, await siembraDelCatalogo(servidor), [5, 3, 0]);
		const datos = await anden();
		const tarjeta = datos.carriles[0]?.tarjetas.find((una) => una.abre.id === lote.loteId);
		expect(tarjeta?.abre.a).toBe("taller");
		expect(tarjeta?.detalle).toBe(`${lote.folio} · revisado por calidad`);
		expect(tarjeta?.marca.texto).toBe("Del taller");
		expect(tarjeta?.cantidad).toBe("8 piezas");
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.anden");
	});
});
