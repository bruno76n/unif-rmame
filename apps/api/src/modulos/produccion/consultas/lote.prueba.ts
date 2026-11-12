/**
 * Prueba de `produccion.lote` (el cajón del lote) y de `produccion.costo_lote` con los datos de la muestra: un lote en
 * proceso con sus operaciones, sus registros por páginas, sus bultos y sus rollos; uno por cortar; y lo que se recorta
 * según la cuenta: el precio por metro sin Compras ni Contaduría, la tarifa de cada registro y la mano de obra del costo
 * sin «ven sueldos y tarifas», y el costo entero sin Compras ni Contaduría.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un registro del cajón. */
interface Registro {
	registro_id: string;
	del_corte: boolean;
	cancelable: boolean;
	tarifa_centavos?: number | null;
}

/** Lo que regresa el cajón, lo que se revisa. */
interface Cajon {
	folio: string;
	etapa: string;
	estado: { texto: string; color: string };
	pedido_id: string | null;
	hilo: { parada: string }[];
	cifras: { planeadas: number; cortadas: number | null };
	operaciones: { operacion: string; hechas: number; puede_hasta: number }[];
	sin_cortar: string | null;
	registros: { renglones: Registro[]; total: number; cursor: string | null; hay_mas: boolean };
	bultos: { folio: string }[];
	rollos: { renglones: { rollo: string; costo_metro_centavos?: number }[]; rendimiento: string } | null;
	ver_costo: boolean;
}

describe("produccion.lote y produccion.costo_lote: el cajón del lote y su costo, con su recorte", () => {
	let servidor: ServidorDePrueba;
	let enProceso: string;
	let porCortar: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, folio FROM lotes WHERE folio IN ('L-2026-002', 'L-2026-019') ORDER BY folio",
		);
		enProceso = String(rows[0]?.id);
		porCortar = String(rows[1]?.id);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un lote en proceso: sus operaciones desde el corte, sus registros por páginas, sus bultos y sus rollos", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.lote", { lote_id: enProceso }, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const lote = respuesta.cuerpo.resultado as Cajon;
		expect(lote).toMatchObject({ folio: "L-2026-002", etapa: "en_proceso", pedido_id: null, sin_cortar: null });
		// Sin pedido, el hilo es el del lote, con sus seis paradas.
		expect(lote.hilo.map((parada) => parada.parada)).toEqual([
			"pedido",
			"corte",
			"costura",
			"calidad",
			"aduana",
			"entrega",
		]);
		expect(lote.operaciones[0]?.operacion).toBe("Corte");
		expect(lote.operaciones[0]?.hechas).toBe(lote.cifras.cortadas);
		// Los registros: diez por página, con cursor; los del corte no se cancelan.
		expect(lote.registros.renglones).toHaveLength(10);
		expect(lote.registros.hay_mas).toBe(true);
		expect(lote.registros.total).toBe(96);
		const siguiente = await pedirConsulta(
			servidor,
			"produccion.lote",
			{ lote_id: enProceso, cursor: lote.registros.cursor ?? "" },
			"produccion",
		);
		const otra = (siguiente.cuerpo.resultado as Cajon).registros.renglones;
		expect(otra.some((uno) => lote.registros.renglones.some((antes) => antes.registro_id === uno.registro_id))).toBe(
			false,
		);
		const { rows } = await servidor.base.dueno.query(
			"SELECT id FROM registros_operacion WHERE lote_id = $1 AND origen = 'corte' LIMIT 1",
			[enProceso],
		);
		const todos = [...lote.registros.renglones, ...otra];
		expect(lote.bultos.length).toBeGreaterThan(0);
		expect(lote.rollos?.rendimiento).toMatch(/^[+−]\d+% sobre el patrón$/);
		expect(lote.ver_costo).toBe(false);
		// Producción no ve el precio por metro ni las tarifas: no viajan y la respuesta dice que se recortaron.
		expect(JSON.stringify(respuesta.cuerpo.resultado)).not.toMatch(/centavos/);
		expect(respuesta.cuerpo.recortado).toEqual(expect.arrayContaining(["costo_metro_centavos", "tarifa_centavos"]));
		expect(todos.every((registro) => !registro.del_corte || !registro.cancelable)).toBe(true);
		expect(rows).toHaveLength(1);
	});

	it("la dueña ve el precio por metro y la tarifa de cada registro", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.lote", { lote_id: enProceso }, "duena");
		const lote = respuesta.cuerpo.resultado as Cajon;
		expect(lote.ver_costo).toBe(true);
		expect(lote.rollos?.renglones.every((rollo) => typeof rollo.costo_metro_centavos === "number")).toBe(true);
		expect(lote.registros.renglones.some((registro) => typeof registro.tarifa_centavos === "number")).toBe(true);
	});

	it("un lote por cortar dice cuándo se corta, sin operaciones ni rollos", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.lote", { lote_id: porCortar }, "produccion");
		const lote = respuesta.cuerpo.resultado as Cajon;
		expect(lote).toMatchObject({ etapa: "por_cortar", estado: { texto: "Por cortar", color: "gris" }, rollos: null });
		expect(lote.cifras.cortadas).toBeNull();
		expect(lote.operaciones).toEqual([]);
		expect(lote.sin_cortar).toMatch(/^Se corta el \d+ \w+\. 190 piezas en \d+ tallas\.$/);
		expect(lote.pedido_id).not.toBeNull();
		expect(lote.hilo).toEqual([]);
	});

	it("el cajón es de Producción; un lote que no existe, 404", async () => {
		expect((await pedirConsulta(servidor, "produccion.lote", { lote_id: enProceso }, "compras")).estado).toBe(403);
		expect(
			(
				await pedirConsulta(
					servidor,
					"produccion.lote",
					{ lote_id: "01936f2e-0000-7000-8000-00000000dead" },
					"produccion",
				)
			).estado,
		).toBe(404);
	});

	it("el costo: Compras ve tela y avíos sin la mano de obra; con «ven sueldos y tarifas», todo y cuadra", async () => {
		const deCompras = await pedirConsulta(servidor, "produccion.costo_lote", { lote_id: enProceso }, "compras");
		expect(deCompras.estado, JSON.stringify(deCompras.cuerpo)).toBe(200);
		expect(deCompras.cuerpo.resultado).not.toHaveProperty("mano_de_obra");
		expect(deCompras.cuerpo.resultado).not.toHaveProperty("total_centavos");
		expect(deCompras.cuerpo.recortado).toEqual(
			expect.arrayContaining(["mano_de_obra", "total_centavos", "costo_por_pieza_centavos"]),
		);
		const conSueldos = await pedirConsulta(
			servidor,
			"produccion.costo_lote",
			{ lote_id: enProceso },
			"contaduria_sueldos",
		);
		const costo = conSueldos.cuerpo.resultado as {
			cortadas: number;
			tela: { importe_centavos: number };
			avios: { importe_centavos: number };
			mano_de_obra: { importe_centavos: number; por_pieza_centavos: number; estimada: boolean };
			total_centavos: number;
			costo_por_pieza_centavos: number;
		};
		expect(costo.mano_de_obra.estimada).toBe(true);
		expect(costo.mano_de_obra.importe_centavos).toBe(costo.mano_de_obra.por_pieza_centavos * costo.cortadas);
		expect(costo.total_centavos).toBe(
			costo.tela.importe_centavos + costo.avios.importe_centavos + costo.mano_de_obra.importe_centavos,
		);
		expect(costo.costo_por_pieza_centavos).toBe(Math.round(costo.total_centavos / costo.cortadas));
		expect(costo.tela.importe_centavos).toBeGreaterThan(0);
	});

	it("el costo no es de Producción, ni de un lote sin cortar", async () => {
		expect((await pedirConsulta(servidor, "produccion.costo_lote", { lote_id: enProceso }, "produccion")).estado).toBe(
			403,
		);
		const sinCortar = await pedirConsulta(servidor, "produccion.costo_lote", { lote_id: porCortar }, "compras");
		expect(sinCortar.estado).toBe(422);
		expect(sinCortar.cuerpo).toMatchObject({ codigo: "lote_sin_cortar", mensaje: "L-2026-019 todavía no se corta." });
	});
});
