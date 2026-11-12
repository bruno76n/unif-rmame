/**
 * Prueba de `produccion.ordenes` y de `produccion.opciones_orden_nueva` con los datos de la muestra: una tarjeta por
 * pedido y una por orden de reabasto o de temporada, con su estado, su plazo y su hilo chico; el filtro; las que ya
 * salieron del taller por páginas; y las opciones de la ventana (para quién, las prendas que pasan por el taller y la
 * entrega que propone). Solo Producción, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una tarjeta, lo que se revisa. */
interface Tarjeta {
	tipo: string;
	nombre: string;
	referencia: string;
	plazo: { texto: string; tono: string } | null;
	folios: string[];
	levanto: string;
	estado: { texto: string; color: string; abajo: string | null };
	renglones: { prenda: string; lotes: string[]; lote_id: string | null; hilo: { parada: string }[] }[];
}

/** Lo que regresa la consulta. */
interface Ordenes {
	sugerencias: unknown[];
	conteos: { todas: number; clientes: number; reabasto: number; temporada: number };
	en_taller: Tarjeta[];
	salieron: { renglones: Tarjeta[]; cursor: string | null; hay_mas: boolean };
}

describe("produccion.ordenes y produccion.opciones_orden_nueva", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide las órdenes como Producción. */
	async function ordenes(parametros: Record<string, string> = {}): Promise<Ordenes> {
		const respuesta = await pedirConsulta(servidor, "produccion.ordenes", parametros, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|tarifa/);
		return respuesta.cuerpo.resultado as Ordenes;
	}

	it("una tarjeta por pedido y una por cada orden de reabasto o temporada, con su hilo y su plazo", async () => {
		const leidas = await ordenes();
		const { rows } = await servidor.base.dueno.query(
			`SELECT count(DISTINCT pedido_id)::int AS pedidos, count(*) FILTER (WHERE pedido_id IS NULL)::int AS otras
			 FROM ordenes_produccion WHERE estado = 'abierta'`,
		);
		expect(leidas.conteos.clientes).toBe(rows[0]?.pedidos);
		expect(leidas.conteos.reabasto + leidas.conteos.temporada).toBe(rows[0]?.otras);
		expect(leidas.conteos.todas).toBe(leidas.en_taller.length + leidas.salieron.renglones.length);
		const zamora = leidas.en_taller.find((tarjeta) => tarjeta.referencia.startsWith("PE-0016"));
		expect(zamora).toMatchObject({ tipo: "pedido", nombre: "Distribuidora Escolar Zamora" });
		expect(zamora?.levanto).toMatch(/^Pedido de cliente · .+$/);
		expect(zamora?.plazo?.tono).toBe("rojo");
		expect(zamora?.estado.abajo).toMatch(/^Atrasado \d+ días?$/);
		for (const tarjeta of leidas.en_taller) {
			for (const renglon of tarjeta.renglones) {
				expect(renglon.hilo.map((parada) => parada.parada)).toEqual([
					"pedido",
					"corte",
					"costura",
					"calidad",
					"aduana",
					"entrega",
				]);
			}
		}
		const temporada = leidas.en_taller.find((tarjeta) => tarjeta.tipo === "temporada");
		expect(temporada?.nombre).toBe("Temporada · bodega");
		expect(temporada?.renglones[0]?.lote_id).not.toBeNull();
		// Las de entrega más cercana primero.
		expect(leidas.salieron).toMatchObject({ hay_mas: false, cursor: null });
	});

	it("el filtro deja solo las de clientes, de reabasto o de temporada", async () => {
		expect((await ordenes({ filtro: "clientes" })).en_taller.every((tarjeta) => tarjeta.tipo === "pedido")).toBe(true);
		const reabasto = await ordenes({ filtro: "reabasto" });
		expect(reabasto.en_taller.length).toBe(reabasto.conteos.reabasto);
		expect(reabasto.en_taller.every((tarjeta) => tarjeta.tipo === "reabasto")).toBe(true);
	});

	it("las que ya salieron del taller van por páginas", async () => {
		// Todos los lotes llegan a aduana: todas las tarjetas pasan abajo, diez por página.
		await servidor.base.dueno.query(
			`UPDATE lotes SET estado = 'en_aduana', en_aduana_en = now(),
			 flujo_id = coalesce(flujo_id, (SELECT id FROM flujos LIMIT 1)),
			 receta_version_id = coalesce(receta_version_id, (SELECT version_vigente_id FROM recetas LIMIT 1))
			 WHERE estado <> 'cancelado'`,
		);
		const primera = await ordenes();
		expect(primera.en_taller).toEqual([]);
		expect(primera.salieron.renglones).toHaveLength(10);
		expect(primera.salieron.hay_mas).toBe(true);
		expect(primera.salieron.renglones.every((tarjeta) => tarjeta.plazo === null)).toBe(true);
		const segunda = await ordenes({ cursor: primera.salieron.cursor ?? "" });
		expect(segunda.salieron.renglones.length).toBe(primera.conteos.todas - 10);
		expect(segunda.salieron.hay_mas).toBe(false);
		const folios = (pagina: Ordenes) => pagina.salieron.renglones.flatMap((tarjeta) => tarjeta.folios);
		expect(folios(segunda).some((folio) => folios(primera).includes(folio))).toBe(false);
	});

	it("las opciones de la orden nueva: Bodega como temporada, las tiendas, las prendas y la entrega que propone", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"produccion.opciones_orden_nueva",
			{ texto: "pantalón" },
			"produccion",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const opciones = respuesta.cuerpo.resultado as {
			destinos: { nombre: string }[];
			prendas: { nombre: string; con_receta: boolean; tallas: unknown[] }[];
			entrega_propuesta: string;
		};
		expect(opciones.destinos.map((destino) => destino.nombre)).toEqual(["Temporada · bodega", "Tienda 1", "Tienda 2"]);
		expect(opciones.prendas.length).toBeGreaterThan(0);
		expect(opciones.prendas.every((prenda) => /pantalón/i.test(prenda.nombre) && prenda.tallas.length > 0)).toBe(true);
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City");
		expect(opciones.entrega_propuesta).toBe(hoy.add({ days: 21 }).toString());
		expect((await pedirConsulta(servidor, "produccion.opciones_orden_nueva", {}, "ventas")).estado).toBe(403);
	});

	it("solo Producción las pide", async () => {
		expect((await pedirConsulta(servidor, "produccion.ordenes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.ordenes", {}, "bodega")).estado).toBe(403);
	});
});
