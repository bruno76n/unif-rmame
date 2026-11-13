/**
 * Prueba de `calidad.por_revisar` y `calidad.revision_lote` con los datos de la muestra y lotes de prueba: la lista de
 * lotes por revisar con su «para quién», los revisados hoy, los reprocesos con «Aprobar» apagado hasta que Aduana
 * recibe el lote, y lo que necesita la revisión de un lote (sus tallas con sus listas, la operación y la persona que se
 * proponen por la regla 3 y quién revisa); y que solo Calidad las pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Por revisar» y «Revisión de
 * un lote»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aprobarReprocesoDePrueba, defectoDePrueba, loteTerminado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { loteEnAduana, revisadoConReproceso } from "./de-prueba.ts";

/** Lo que regresa `calidad.por_revisar`. */
interface PorRevisar {
	lotes: {
		lote_id: string;
		folio: string;
		prenda: string;
		linea: string;
		listas: number;
		urgente: boolean;
		para: { nombre: string };
	}[];
	revisados_hoy: {
		lote_id: string;
		aprobadas: number;
		a_reproceso: number;
		reviso: string;
		reviso_quien_coso: boolean;
	}[];
	reprocesos: {
		reproceso_id: string;
		linea: string;
		defecto: string;
		talla: string;
		piezas: number;
		estado: string;
		color: string;
		puede_aprobar: boolean;
		motivo_apagado: string | null;
	}[];
}

/** Lo que regresa `calidad.revision_lote`. */
interface Revision {
	folio: string;
	por_revisar: boolean;
	tallas: { variante_id: string; talla: string; listas: number }[];
	defectos: { id: string; nombre: string; flujo_operacion_id: string }[];
	operaciones: { id: string; nombre: string }[];
	personas: { id: string; nombre: string }[];
	propuestas: { flujo_operacion_id: string; variante_id: string; persona_id: string }[];
	revisa: string;
	coso_en_el_lote: boolean;
}

describe("calidad.por_revisar y calidad.revision_lote", () => {
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
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe|tarifa|sueldo/);
		return respuesta.cuerpo.resultado as Resultado;
	}

	it("el lote terminado de la muestra espera revisión, «Por revisar hoy», con sus listas y para quién", async () => {
		const { lotes } = await pedir<PorRevisar>("calidad.por_revisar");
		const lote = lotes.find((uno) => uno.folio === "L-2026-001");
		expect(lote).toMatchObject({ prenda: "Pants marino liso", listas: 118, urgente: true });
		expect(lote?.linea).toMatch(/^L-2026-001( · terminado el \d+ \w+)?$/);
		expect(lote?.para.nombre).not.toBe("");
	});

	it("un lote revisado sale en «Revisados hoy» y su reproceso con «Aprobar» apagado hasta que Aduana recibe el lote", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const antes = await pedir<PorRevisar>("calidad.por_revisar");
		expect(antes.lotes.some((uno) => uno.lote_id === lote.loteId)).toBe(false);
		expect(antes.revisados_hoy.find((uno) => uno.lote_id === lote.loteId)).toMatchObject({
			aprobadas: 7,
			a_reproceso: 1,
			reviso: "Prueba calidad",
			reviso_quien_coso: false,
		});
		expect(antes.reprocesos.find((uno) => uno.reproceso_id === lote.reprocesoId)).toMatchObject({
			defecto: lote.defecto,
			talla: "4",
			piezas: 1,
			estado: "En reproceso",
			color: "azul",
			puede_aprobar: false,
			motivo_apagado: `Aduana todavía no recibe ${lote.folio}: el reproceso se aprueba después.`,
		});
		await loteEnAduana(servidor, lote.loteId);
		expect(
			(await pedir<PorRevisar>("calidad.por_revisar")).reprocesos.find((uno) => uno.reproceso_id === lote.reprocesoId),
		).toMatchObject({ puede_aprobar: true, motivo_apagado: null });
		expect((await aprobarReprocesoDePrueba(servidor, lote.reprocesoId)).estado).toBe(200);
		expect(
			(await pedir<PorRevisar>("calidad.por_revisar")).reprocesos.find((uno) => uno.reproceso_id === lote.reprocesoId),
		).toMatchObject({ estado: "Aprobado", color: "verde", puede_aprobar: false, motivo_apagado: null });
	});

	it("la revisión de un lote: sus tallas con sus listas y la operación y la persona que se proponen (regla 3)", async () => {
		const lote = await loteTerminado(servidor, siembra, [3, 2, 0]);
		const defectoId = await defectoDePrueba(servidor, lote);
		const revision = await pedir<Revision>("calidad.revision_lote", { lote_id: lote.loteId });
		expect(revision).toMatchObject({
			folio: lote.folio,
			por_revisar: true,
			revisa: "Prueba calidad",
			coso_en_el_lote: false,
		});
		expect(revision.tallas).toEqual([
			{ variante_id: lote.prenda.variantes["4"], talla: "4", listas: 3 },
			{ variante_id: lote.prenda.variantes["6"], talla: "6", listas: 2 },
		]);
		const [corte, primera, ultima] = lote.prenda.flujo.operaciones;
		expect(revision.operaciones.map((operacion) => operacion.id)).toEqual(
			[corte, primera, ultima].map((operacion) => operacion?.flujoOperacionId),
		);
		// El defecto de prueba suele causarlo la primera operación después del corte; uno que no es de este flujo, la última.
		expect(revision.defectos.find((defecto) => defecto.id === defectoId)?.flujo_operacion_id).toBe(
			primera?.flujoOperacionId,
		);
		expect(revision.defectos.find((defecto) => defecto.nombre === "Mancha")?.flujo_operacion_id).toBe(
			ultima?.flujoOperacionId,
		);
		// La persona: quien hizo más piezas de esa operación en esa talla (aquí, la del lote).
		expect(
			revision.propuestas.find(
				(uno) => uno.flujo_operacion_id === primera?.flujoOperacionId && uno.variante_id === lote.prenda.variantes["4"],
			)?.persona_id,
		).toBe(lote.personaId);
		expect(revision.personas.some((persona) => persona.id === lote.personaId)).toBe(true);
	});

	it("solo Calidad las pide", async () => {
		const lote = await loteTerminado(servidor, siembra, [1, 0, 0]);
		expect((await pedirConsulta(servidor, "calidad.por_revisar", {}, "produccion")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.revision_lote", { lote_id: lote.loteId }, "aduana")).estado).toBe(
			403,
		);
	});
});
