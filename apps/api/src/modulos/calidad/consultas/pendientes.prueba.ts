/**
 * Prueba de `calidad.pendientes` y de la pastilla de Calidad con los datos de la muestra y lo que Calidad revisa aquí:
 * las tres cifras, el lote por revisar de la muestra, el reproceso (con «Aprobar» solo con el lote en aduana), el
 * reclamo por resolver, el filtro, la pastilla, y que solo Calidad la pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Pendientes» y «Quién entra»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { loteEnAduana, reclamoDePrueba, revisadoConReproceso } from "./de-prueba.ts";

/** Un renglón de Pendientes, lo que se revisa. */
interface Renglon {
	tipo: string;
	titulo: string;
	detalle: string;
	fecha: string | null;
	cifra: string;
	estado: string;
	color: string;
	lote_id?: string;
	urgente?: boolean;
	reproceso_id?: string;
	puede_aprobar?: boolean;
	reclamo_id?: string;
}

/** Lo que regresa la consulta. */
interface Pendientes {
	indicadores: {
		por_revisar: { lotes: number; piezas: number; en_reproceso: number };
		defectos: { dias: number; porcentaje: number; comunes: { nombre: string; piezas: number }[] };
		reclamos: { por_resolver: number; en_el_anio: number };
	};
	conteos: Record<string, number>;
	hay_rojo: boolean;
	renglones: Renglon[];
}

describe("calidad.pendientes: las cifras y la cola de trabajo de Calidad", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Pendientes como Calidad. */
	async function pendientes(grupo?: string): Promise<Pendientes> {
		const respuesta = await pedirConsulta(
			servidor,
			"calidad.pendientes",
			grupo === undefined ? {} : { grupo },
			"calidad",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe|tarifa|sueldo/);
		return respuesta.cuerpo.resultado as Pendientes;
	}

	/** La pastilla de Calidad en el armazón. */
	async function pastilla() {
		const respuesta = await pedirConsulta(servidor, "admin.armazon", {}, "calidad");
		const { departamentos } = respuesta.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		return departamentos.find((departamento) => departamento.clave === "calidad");
	}

	it("el lote terminado de la muestra sale «Por revisar hoy» en rojo, con sus piezas, y la pastilla va en rojo", async () => {
		const leido = await pendientes();
		const lote = leido.renglones.find((renglon) => renglon.titulo.startsWith("L-2026-001"));
		expect(lote).toMatchObject({
			tipo: "lote",
			titulo: "L-2026-001 · Pants marino liso",
			fecha: "Entrega 15 oct",
			cifra: "118 pz",
			estado: "Por revisar hoy",
			color: "rojo",
			urgente: true,
		});
		expect(leido.indicadores.por_revisar).toMatchObject({ lotes: 1, piezas: 118 });
		expect(leido.indicadores.defectos.dias).toBe(30);
		expect(leido.hay_rojo).toBe(true);
		expect(leido.conteos.todos).toBe(leido.renglones.length);
		expect(await pastilla()).toMatchObject({ conteo: 1, rojo: true });
	});

	it("un reproceso sale «En reproceso» en azul y solo se puede aprobar con su lote en aduana; la pastilla lo cuenta entonces", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const antes = await pendientes("lotes");
		const reproceso = antes.renglones.find((renglon) => renglon.reproceso_id === lote.reprocesoId);
		expect(reproceso).toMatchObject({
			tipo: "reproceso",
			titulo: `${lote.reprocesoFolio} · ${lote.prenda.nombre}`,
			cifra: "1 pz",
			estado: "En reproceso",
			color: "azul",
			puede_aprobar: false,
		});
		expect(reproceso?.detalle).toMatch(/^.+ · .+$/);
		expect(antes.indicadores.por_revisar.en_reproceso).toBe(1);
		// Los defectos del periodo: 1 rechazada de 8 revisadas.
		expect(antes.indicadores.defectos.porcentaje).toBe(12.5);
		expect(antes.indicadores.defectos.comunes).toEqual([{ nombre: lote.defecto, piezas: 1 }]);
		const conteoAntes = (await pastilla())?.conteo ?? 0;
		await loteEnAduana(servidor, lote.loteId);
		const despues = (await pendientes("lotes")).renglones.find((renglon) => renglon.reproceso_id === lote.reprocesoId);
		expect(despues?.puede_aprobar).toBe(true);
		expect((await pastilla())?.conteo).toBe(conteoAntes + 1);
	});

	it("un reclamo por resolver sale en rojo con «Ver reclamo», y el filtro deja solo su grupo", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const reclamo = await reclamoDePrueba(servidor, lote);
		const leido = await pendientes("reclamos");
		expect(leido.renglones.every((renglon) => renglon.tipo === "reclamo")).toBe(true);
		const suyo = leido.renglones.find((renglon) => renglon.reclamo_id === reclamo.reclamoId);
		expect(suyo).toMatchObject({
			titulo: `${reclamo.folio} · ${reclamo.cliente}`,
			cifra: "4 pz",
			estado: "Por resolver",
			color: "rojo",
		});
		expect(suyo?.detalle).toBe(
			`La costura del costado se abrió a la semana · ${lote.folio}, ${lote.prenda.flujo.operaciones[1]?.nombre}`,
		);
		expect(leido.indicadores.reclamos).toEqual({ por_resolver: 1, en_el_anio: 1 });
		expect(leido.conteos.reclamos).toBe(leido.renglones.length);
		expect(leido.conteos.todos).toBeGreaterThan(leido.renglones.length);
	});

	it("solo Calidad la pide", async () => {
		expect((await pedirConsulta(servidor, "calidad.pendientes", {}, "produccion")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.pendientes", {}, "ventas")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.pendientes", {}, "duena")).estado).toBe(200);
	});
});
