/**
 * Prueba de `patronaje.desarrollos` y `patronaje.desarrollo` con los datos de la muestra: el tablero en sus cinco
 * columnas con cómo va cada muestra, los descartados, las opciones de una solicitud nueva, y el cajón con sus pasos,
 * sus datos, su historial y los botones de su etapa (también sin escuela, que aprueba Dirección). Solo Patronaje las
 * pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/patronaje.md («Desarrollo de producto» y
 * el cajón del desarrollo)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa el tablero, lo que se revisa. */
interface Tablero {
	en_proceso: number;
	columnas: {
		etapa: string;
		nombre: string;
		tarjetas: {
			desarrollo_id: string;
			folio: string;
			desde: string;
			muestra: string | null;
			para: { nombre: string };
		}[];
	}[];
	descartados: { folio: string; motivo: string; por: string }[];
	opciones: { escuelas: { escuela_id: string }[]; telas: { material_id: string; nombre: string }[] };
}

/** Lo que regresa el cajón, lo que se revisa. */
interface Desarrollo {
	folio: string;
	version: number;
	paso: number;
	con_escuela: boolean;
	para: { nombre: string };
	datos: { muestra: string; en_catalogo: { nombre: string } | null };
	ficha: { tela: string; receta: string };
	autorizacion: string | null;
	historial: { quien: string; que: string; fecha: string }[];
	botones: string[];
}

describe("patronaje.desarrollos y patronaje.desarrollo: el tablero y el cajón de un desarrollo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide el tablero como Patronaje. */
	async function tablero(): Promise<Tablero> {
		const respuesta = await pedirConsulta(servidor, "patronaje.desarrollos", {}, "patronaje");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Tablero;
	}

	/** Pide un desarrollo como Patronaje. */
	async function desarrollo(id: string): Promise<Desarrollo> {
		const respuesta = await pedirConsulta(servidor, "patronaje.desarrollo", { desarrollo_id: id }, "patronaje");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		return respuesta.cuerpo.resultado as Desarrollo;
	}

	/** La tarjeta de un folio. */
	function tarjeta(leido: Tablero, folio: string) {
		return leido.columnas.flatMap((columna) => columna.tarjetas).find((uno) => uno.folio === folio);
	}

	it("el tablero: cinco columnas en su orden, cómo va cada muestra, y las opciones de una solicitud", async () => {
		const leido = await tablero();
		expect(leido.columnas.map((columna) => columna.nombre)).toEqual([
			"Solicitud",
			"Muestra",
			"Aprobación",
			"Ficha técnica",
			"En catálogo",
		]);
		expect(leido.columnas.map((columna) => columna.tarjetas.map((uno) => uno.folio))).toEqual([
			["DS-005"],
			["DS-003"],
			["DS-004"],
			["DS-002"],
			["DS-001"],
		]);
		expect(leido.en_proceso).toBe(4);
		expect(tarjeta(leido, "DS-003")?.muestra).toBe("En costura, talla M");
		expect(tarjeta(leido, "DS-004")?.muestra).toMatch(/^Talla 6, entregada el \d{1,2} [a-z]{3}$/);
		expect(tarjeta(leido, "DS-002")?.muestra).toMatch(/^Aprobada el \d{1,2} [a-z]{3}$/);
		expect(tarjeta(leido, "DS-005")?.muestra).toBeNull();
		expect(tarjeta(leido, "DS-005")?.desde).toMatch(/^desde el \d{1,2} [a-z]{3}$/);
		expect(leido.descartados).toEqual([]);
		expect(leido.opciones.escuelas.length).toBeGreaterThan(0);
		expect(leido.opciones.telas.map((tela) => tela.nombre)).toContain("Gabardina azul marino");
		expect(leido.opciones.telas.map((tela) => tela.nombre)).not.toContain("Botón 4 hoyos blanco");
	});

	it("el cajón: los pasos, los datos, la ficha, el historial y los botones de cada etapa", async () => {
		const leido = await tablero();
		const id = (folio: string) => tarjeta(leido, folio)?.desarrollo_id ?? "";
		const solicitud = await desarrollo(id("DS-005"));
		expect(solicitud).toMatchObject({ paso: 0, con_escuela: true, botones: ["descartar", "empezar_muestra"] });
		expect(solicitud.datos.muestra).toBe("Todavía no");
		expect(solicitud.ficha.receta).toBe("Se captura al dar de alta el producto en catálogo");
		expect(solicitud.historial[0]?.que).toBe("registró la solicitud");
		expect((await desarrollo(id("DS-003"))).botones).toEqual(["descartar", "entregar_muestra"]);
		expect((await desarrollo(id("DS-004"))).botones).toEqual(["descartar", "pedir_cambios", "aprobo_cliente"]);
		expect((await desarrollo(id("DS-002"))).botones).toEqual(["descartar", "alta_en_catalogo"]);
		const enCatalogo = await desarrollo(id("DS-001"));
		expect(enCatalogo).toMatchObject({ paso: 4, botones: ["abrir_receta"] });
		expect(enCatalogo.datos.en_catalogo?.nombre).toBe("Playera polo blanca con escudo");
		expect(enCatalogo.ficha.receta).toMatch(/^Sin receta$|^Versión \d+, (sin verificar|verificada)$/);
		// El historial va de lo más nuevo a lo más viejo.
		expect(enCatalogo.historial.map((paso) => paso.que)[0]).toBe("dio de alta el producto en catálogo");
	});

	it("sin escuela: la muestra lista pide la autorización y Patronaje solo puede descartar", async () => {
		const leido = await tablero();
		const tela = leido.opciones.telas[0]?.material_id;
		const registrada = await mandarAccion(
			servidor,
			"patronaje.registrar_solicitud",
			{ datos: { escuela_id: null, prenda: "Mandil liso azul", tela_material_id: tela, tallas: "CH a G" } },
			"patronaje",
		);
		expect(registrada.estado, JSON.stringify(registrada.cuerpo)).toBe(200);
		const desarrolloId = String((registrada.cuerpo.resultado as { desarrollo_id: string }).desarrollo_id);
		const pasos = [
			["patronaje.empezar_muestra", {}],
			["patronaje.entregar_muestra", {}],
		] as const;
		for (const [accion, datos] of pasos) {
			const antes = await desarrollo(desarrolloId);
			const hecho = await mandarAccion(
				servidor,
				accion,
				{ datos: { desarrollo_id: desarrolloId, ...datos }, version: antes.version },
				"patronaje",
			);
			expect(hecho.estado, JSON.stringify(hecho.cuerpo)).toBe(200);
		}
		const sinEscuela = await desarrollo(desarrolloId);
		expect(sinEscuela).toMatchObject({ con_escuela: false, para: { nombre: "Básico o general" }, paso: 2 });
		expect(sinEscuela.botones).toEqual(["descartar"]);
		expect(sinEscuela.autorizacion).toMatch(/^AU-\d+ · Esperando aprobación de Dirección$/);
		// Descartado: sale abajo con su motivo.
		const descartado = await mandarAccion(
			servidor,
			"patronaje.descartar_desarrollo",
			{ datos: { desarrollo_id: desarrolloId, motivo: "El cliente ya no lo quiere" }, version: sinEscuela.version },
			"patronaje",
		);
		expect(descartado.estado, JSON.stringify(descartado.cuerpo)).toBe(200);
		const despues = await tablero();
		expect(despues.descartados).toEqual([
			expect.objectContaining({ prenda: "Mandil liso azul", motivo: "El cliente ya no lo quiere" }),
		]);
		expect(tarjeta(despues, sinEscuela.folio)).toBeUndefined();
		expect((await desarrollo(desarrolloId)).botones).toEqual([]);
	});

	it("solo Patronaje las pide", async () => {
		expect((await pedirConsulta(servidor, "patronaje.desarrollos", {}, "ventas")).estado).toBe(403);
		const id = (await tablero()).columnas[0]?.tarjetas[0]?.desarrollo_id ?? "";
		expect((await pedirConsulta(servidor, "patronaje.desarrollo", { desarrollo_id: id }, "ventas")).estado).toBe(403);
	});
});
