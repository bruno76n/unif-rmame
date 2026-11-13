/**
 * Prueba de `calidad.reclamos` y `calidad.buscar`: la lista (primero los por resolver, luego los más nuevos, con
 * «Ver más»), el rastreo del escogido en sus cinco pasos sin costos ni tarifas, lo resuelto con su resolución, y el
 * buscador por folio, lote o código de la prenda; y que solo Calidad las pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Reclamos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { reclamoDePrueba, revisadoConReproceso } from "./de-prueba.ts";

/** Un paso del rastreo. */
interface Paso {
	titulo: string;
	linea: string;
}

/** Lo que regresa `calidad.reclamos`. */
interface Reclamos {
	renglones: { reclamo_id: string; folio: string; estado: string; color: string; cliente: string; linea: string }[];
	cursor: string | null;
	hay_mas: boolean;
	escogido: {
		reclamo_id: string;
		version: number;
		folio: string;
		cliente: string;
		que_dice: string;
		por_resolver: boolean;
		resolucion: string | null;
		prenda: Paso;
		lote: Paso;
		operacion: Paso;
		persona: Paso;
		partidas: Paso[];
	} | null;
}

describe("calidad.reclamos y calidad.buscar: del código de la prenda a la partida de tela", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide una consulta como Calidad, sin dinero. */
	async function pedir<Resultado>(nombre: string, parametros: Record<string, string> = {}): Promise<Resultado> {
		const respuesta = await pedirConsulta(servidor, nombre, parametros, "calidad");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe|costo|tarifa|sueldo/);
		return respuesta.cuerpo.resultado as Resultado;
	}

	it("sin reclamos, la lista va vacía y no hay escogido", async () => {
		expect(await pedir<Reclamos>("calidad.reclamos")).toMatchObject({ renglones: [], escogido: null, hay_mas: false });
	});

	it("el rastreo del escogido: prenda, lote, operación, persona y partida de tela; resuelto, con su resolución", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const reclamo = await reclamoDePrueba(servidor, lote);
		const leido = await pedir<Reclamos>("calidad.reclamos");
		expect(leido.renglones[0]).toMatchObject({
			reclamo_id: reclamo.reclamoId,
			estado: "Por resolver",
			color: "rojo",
			cliente: reclamo.cliente,
		});
		expect(leido.renglones[0]?.linea).toMatch(new RegExp(`^${lote.defecto} · 4 piezas · \\d+ \\w+$`));
		const operacion = lote.prenda.flujo.operaciones[1]?.nombre ?? "";
		expect(leido.escogido).toMatchObject({
			reclamo_id: reclamo.reclamoId,
			folio: reclamo.folio,
			cliente: reclamo.cliente,
			que_dice: "La costura del costado se abrió a la semana",
			por_resolver: true,
			resolucion: null,
			prenda: { titulo: `${lote.prenda.nombre} · talla 4`, linea: `Código ${reclamo.codigo}` },
			operacion: { titulo: operacion, linea: lote.defecto },
			persona: { titulo: "Persona de prueba", linea: `Hizo ${operacion.toLocaleLowerCase("es-MX")} en ese lote` },
		});
		expect(leido.escogido?.lote.titulo).toBe(lote.folio);
		expect(leido.escogido?.lote.linea).toMatch(/^Cortado el \d+ \w+ · revisado el \d+ \w+ por Prueba calidad$/);
		expect(leido.escogido?.partidas.length).toBeGreaterThan(0);
		// Resuelto: verde, con su resolución, y deja de ser el primero.
		const resuelto = await mandarAccion(
			servidor,
			"calidad.resolver_reclamo",
			{
				datos: { reclamo_id: reclamo.reclamoId, resolucion: "Se repusieron las 4 piezas" },
				version: leido.escogido?.version ?? 0,
			},
			"calidad",
		);
		expect(resuelto.estado).toBe(200);
		const otro = await reclamoDePrueba(servidor, lote);
		const despues = await pedir<Reclamos>("calidad.reclamos", { reclamo_id: reclamo.reclamoId });
		expect(despues.renglones.map((renglon) => renglon.reclamo_id)).toEqual([otro.reclamoId, reclamo.reclamoId]);
		expect(despues.renglones[1]).toMatchObject({ estado: "Resuelto", color: "verde" });
		expect(despues.escogido).toMatchObject({ por_resolver: false });
		expect(despues.escogido?.resolucion).toMatch(/^Resuelto el \d+ \w+: Se repusieron las 4 piezas$/);
		// «Ver más»: de uno en uno.
		const primera = await pedir<Reclamos>("calidad.reclamos", { limite: "1" });
		expect(primera).toMatchObject({ hay_mas: true });
		const segunda = await pedir<Reclamos>("calidad.reclamos", { limite: "1", cursor: primera.cursor ?? "" });
		expect(segunda.renglones.map((renglon) => renglon.reclamo_id)).toEqual([reclamo.reclamoId]);
		expect(segunda.hay_mas).toBe(false);
	});

	it("el buscador da con un reclamo por su folio, su lote o el código; con una prenda sin reclamo; o con nada", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const reclamo = await reclamoDePrueba(servidor, lote);
		const buscar = (texto: string) => pedir<{ encontrado: Record<string, unknown> }>("calidad.buscar", { texto });
		for (const texto of [reclamo.folio.toLowerCase(), lote.folio, reclamo.codigo]) {
			expect((await buscar(texto)).encontrado).toEqual({ tipo: "reclamo", reclamo_id: reclamo.reclamoId });
		}
		const { rows } = await servidor.base.dueno.query("SELECT codigo FROM variantes WHERE id = $1", [
			lote.prenda.variantes["6"],
		]);
		const codigo6 = String(rows[0]?.codigo);
		expect((await buscar(codigo6)).encontrado).toEqual({
			tipo: "prenda",
			titulo: `${lote.prenda.nombre} · talla 6`,
			linea: `Código ${codigo6}. Se hizo en 1 lote: ${lote.folio}.`,
		});
		expect((await buscar("zzz")).encontrado).toEqual({
			tipo: "nada",
			texto: "No hay ninguna prenda, lote ni reclamo con «zzz»",
		});
	});

	it("solo Calidad las pide", async () => {
		expect((await pedirConsulta(servidor, "calidad.reclamos", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.buscar", { texto: "RC" }, "produccion")).estado).toBe(403);
	});
});
