/**
 * Prueba de `calidad.defectos`: el periodo sin revisiones, y con un lote revisado con un rechazo, las piezas revisadas
 * y rechazadas, cada defecto con su conteo y la tasa por operación y por persona (regla 9 de
 * docs/modulos/calidad/revision-de-lotes.md), en rojo arriba de `calidad.defectos_tasa_roja_porcentaje`; el catálogo
 * con sus operaciones; y que solo Calidad la pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Defectos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { revisadoConReproceso } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface Defectos {
	dias: number;
	revisadas: number;
	lotes: number;
	rechazadas: number;
	porcentaje: number;
	del_periodo: { nombre: string; piezas: number }[];
	por_operacion: {
		nombre: string;
		rechazadas: number;
		tasa: number;
		contra_la_mas_alta: number;
		roja: boolean;
		mas_comun: string;
	}[];
	por_persona: { nombre: string; rechazadas: number; tasa: number; roja: boolean; mas_comun: string }[];
	catalogo: { defecto_id: string; nombre: string; operaciones: string[] }[];
	operaciones: { operacion_id: string; nombre: string }[];
}

describe("calidad.defectos: la tasa de defectos del periodo y el catálogo", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide Defectos como Calidad, sin dinero. */
	async function defectos(): Promise<Defectos> {
		const respuesta = await pedirConsulta(servidor, "calidad.defectos", {}, "calidad");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe|tarifa|sueldo/);
		return respuesta.cuerpo.resultado as Defectos;
	}

	it("sin revisiones en el periodo, todo en cero; el catálogo de la muestra con sus operaciones", async () => {
		const leido = await defectos();
		expect(leido).toMatchObject({ dias: 30, revisadas: 0, lotes: 0, rechazadas: 0, porcentaje: 0 });
		expect(leido.del_periodo).toEqual([]);
		expect(leido.por_operacion).toEqual([]);
		expect(leido.catalogo.find((defecto) => defecto.nombre === "Costura abierta")?.operaciones).toEqual(
			expect.arrayContaining(["Costados", "Hombros"]),
		);
		expect(leido.operaciones.length).toBeGreaterThan(0);
	});

	it("con un rechazo: los conteos, el defecto y la tasa por operación y por persona, roja arriba del 2 %", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		await loteRevisado(servidor, siembra, [2, 0, 0], 0);
		const leido = await defectos();
		expect(leido).toMatchObject({ revisadas: 10, lotes: 2, rechazadas: 1, porcentaje: 10 });
		expect(leido.del_periodo).toEqual([{ nombre: lote.defecto, piezas: 1 }]);
		// La operación: 1 rechazada entre las 8 revisadas del lote cuyo flujo la tiene.
		expect(leido.por_operacion).toEqual([
			{
				nombre: lote.prenda.flujo.operaciones[1]?.nombre,
				rechazadas: 1,
				tasa: 12.5,
				contra_la_mas_alta: 1,
				roja: true,
				mas_comun: lote.defecto,
			},
		]);
		// La persona: 1 entre las revisadas de los lotes donde tiene registros (solo el suyo).
		expect(leido.por_persona).toEqual([
			expect.objectContaining({ nombre: "Persona de prueba", rechazadas: 1, tasa: 12.5, roja: true }),
		]);
	});

	it("solo Calidad la pide", async () => {
		expect((await pedirConsulta(servidor, "calidad.defectos", {}, "produccion")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "calidad.defectos", {}, "personal")).estado).toBe(403);
	});
});
