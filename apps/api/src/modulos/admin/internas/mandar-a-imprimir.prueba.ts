/**
 * Prueba de `admin.mandar_a_imprimir` y `admin.guardar_impresora`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 6)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** El puente de Aduana y el del Taller. */
const puenteAduana = "01936f2e-0000-7000-8000-000000000031";
const puenteTaller = "01936f2e-0000-7000-8000-000000000032";
const nota = "01936f2e-0000-7000-8000-0000000000a1";

describe("sin puente conectado responde impresora_sin_puente; con él, el trabajo nace por imprimir", () => {
	let servidor: ServidorDePrueba;
	const ubicacion: Record<string, string> = {};
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones");
		for (const renglon of rows) ubicacion[renglon.codigo] = renglon.id;
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Guarda una impresora como la dueña. */
	function guardar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "admin.guardar_impresora", { datos }, "duena");
	}

	/** Pide imprimir en una ubicación como Ventas. */
	function imprimir(codigo: string, copias = 2) {
		return mandarAccion(servidor, "prueba.imprimir", {
			datos: { ubicacion_id: ubicacion[codigo], ids: [nota], copias },
		});
	}

	it("una ubicación sin impresora, o con una sin puente, responde impresora_sin_puente", async () => {
		expect((await imprimir("ADU")).cuerpo).toMatchObject({
			error: "regla",
			codigo: "impresora_sin_puente",
			mensaje: "La impresora de Aduana no está conectada. Usa el PDF.",
		});
		expect((await guardar({ nombre: "Zebra Aduana", modelo: "ZD421", ubicacion_id: ubicacion.ADU })).estado).toBe(200);
		expect((await imprimir("ADU")).cuerpo).toMatchObject({ codigo: "impresora_sin_puente" });
	});

	it("el puente tiene que ser un programa de impresión sin revocar y no atender otra impresora", async () => {
		const tablet = "01936f2e-0000-7000-8000-000000000021";
		expect(
			(await guardar({ nombre: "Otra", modelo: "ZD421", ubicacion_id: ubicacion.TAL, dispositivo_id: tablet })).cuerpo,
		).toMatchObject({
			codigo: "puente_no_valido",
			mensaje: "Ese aparato no es un programa de impresión.",
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, version FROM impresoras WHERE nombre = 'Zebra Aduana'",
		);
		const aduana = rows[0];
		const cambiada = await guardar({
			impresora_id: aduana.id,
			nombre: "Zebra Aduana",
			modelo: "ZD421",
			ubicacion_id: ubicacion.ADU,
			dispositivo_id: puenteAduana,
			version: Number(aduana.version),
		});
		expect(cambiada.cuerpo.resultado).toMatchObject({ mensaje: "Zebra Aduana guardada" });
		expect(
			(
				await guardar({
					nombre: "Zebra Taller",
					modelo: "ZD421",
					ubicacion_id: ubicacion.TAL,
					dispositivo_id: puenteAduana,
				})
			).cuerpo,
		).toMatchObject({ codigo: "puente_ocupado", mensaje: "Puente de Aduana ya atiende Zebra Aduana." });
		expect(
			(
				await guardar({
					nombre: "Zebra Taller",
					modelo: "ZD421",
					ubicacion_id: ubicacion.TAL,
					dispositivo_id: puenteTaller,
				})
			).estado,
		).toBe(200);
	});

	it("con su puente conectado, el trabajo nace por imprimir con quién lo pidió y su evento", async () => {
		const respuesta = await imprimir("ADU", 3);
		expect(respuesta.estado).toBe(200);
		const trabajo = String((respuesta.cuerpo.resultado as { trabajo_id: string }).trabajo_id);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, tipo, ids, copias, pedido_por, sesion_id FROM trabajos_impresion WHERE id = $1",
			[trabajo],
		);
		expect(rows[0]).toEqual({
			estado: "por_imprimir",
			tipo: "prueba",
			ids: [nota],
			copias: 3,
			pedido_por: "01936f2e-0000-7000-8000-000000000002",
			sesion_id: "01936f2e-0000-7000-8000-000000000012",
		});
		const evento = await servidor.base.dueno.query("SELECT tipo, datos FROM eventos WHERE entidad_id = $1", [trabajo]);
		expect(evento.rows).toEqual([
			{ tipo: "impresion.pedida", datos: { trabajo_id: trabajo, dispositivo_id: puenteAduana } },
		]);
	});

	it("un puente callado más de 5 minutos, con versión vieja o revocado no está conectado; más copias que el máximo, 400", async () => {
		const puente = servidor.aparatos.get(puenteAduana);
		if (puente === undefined) throw new Error("falta el puente de prueba");
		const conectado = { ...puente };
		try {
			servidor.aparatos.set(puenteAduana, {
				...conectado,
				ultimo_contacto_en: new Date(Date.now() - 6 * 60_000).toISOString(),
			});
			expect((await imprimir("ADU")).cuerpo).toMatchObject({ codigo: "impresora_sin_puente" });
			servidor.aparatos.set(puenteAduana, { ...conectado, version_app: "0.9.0" });
			expect((await imprimir("ADU")).cuerpo).toMatchObject({ codigo: "impresora_sin_puente" });
			servidor.aparatos.set(puenteAduana, { ...conectado, revocado: true });
			expect((await imprimir("ADU")).cuerpo).toMatchObject({ codigo: "impresora_sin_puente" });
		} finally {
			servidor.aparatos.set(puenteAduana, conectado);
		}
		expect((await imprimir("ADU", 101)).cuerpo).toMatchObject({ campos: { copias: "Escribe de 1 a 100 copias." } });
	});
});
