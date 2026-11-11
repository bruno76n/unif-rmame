/**
 * Prueba de `produccion.crear_flujo`: un flujo nuevo copia las operaciones, el orden y las personas de su origen, y
 * Personal copia sus tarifas; el de una sola operación lleva el corte y las de su parámetro.
 * Fase 12 · docs/fases/12-produccion.md (parte 1)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { flujoDePrueba } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa crear un flujo. */
const flujoCreado = z.object({
	flujo_id: z.uuid(),
	mensaje: z.string(),
	operaciones: z.array(
		z
			.object({ flujo_operacion_id: z.uuid(), operacion_id: z.uuid(), nombre: z.string(), orden: z.number() })
			.passthrough(),
	),
});

describe("Un flujo nuevo copia las operaciones, el orden y las personas de su origen, y Personal copia sus tarifas; el de una sola operación lleva el corte y las de su parámetro", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Producción crea un flujo. */
	function crear(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "produccion.crear_flujo", { datos }, "produccion");
	}

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("a partir de otro: sus operaciones con su orden y su persona, sus tarifas copiadas, y la bitácora", async () => {
		const origen = await flujoDePrueba(servidor.base.dueno, 2);
		const [, conTarifa] = origen.operaciones;
		await servidor.base.dueno.query(
			"INSERT INTO tarifas_operacion (id, flujo_operacion_id, tarifa_centavos) VALUES ($1, $2, 120)",
			[uuidv7(), conTarifa?.flujoOperacionId],
		);
		const nombre = `Chamarra con forro ${uuidv7().slice(-6)}`;
		const respuesta = await crear({ nombre, parte_de: "flujo", flujo_origen_id: origen.flujoId });
		const creado = flujoCreado.parse(respuesta.cuerpo.resultado);
		expect(creado.mensaje).toBe(`Flujo «${nombre}» creado con 3 operaciones. Se escoge al dar de alta un producto`);
		expect(creado.operaciones.map(({ nombre: suyo, orden }) => ({ nombre: suyo, orden }))).toEqual(
			origen.operaciones.map((operacion, i) => ({ nombre: operacion.nombre, orden: i + 1 })),
		);
		expect(
			await consultar("SELECT DISTINCT persona_base_id FROM flujo_operaciones WHERE flujo_id = $1", [creado.flujo_id]),
		).toEqual([{ persona_base_id: origen.personaId }]);
		expect(
			await consultar(
				`SELECT o.nombre, t.tarifa_centavos::int AS tarifa FROM tarifas_operacion t
				 JOIN flujo_operaciones f ON f.id = t.flujo_operacion_id JOIN operaciones o ON o.id = f.operacion_id
				 WHERE f.flujo_id = $1`,
				[creado.flujo_id],
			),
		).toEqual([{ nombre: conTarifa?.nombre, tarifa: 120 }]);
		expect(await consultar("SELECT copiado_de_flujo_id FROM flujos WHERE id = $1", [creado.flujo_id])).toEqual([
			{ copiado_de_flujo_id: origen.flujoId },
		]);
		expect(
			await consultar("SELECT descripcion FROM bitacora WHERE accion = 'produccion.crear_flujo' AND entidad_id = $1", [
				creado.flujo_id,
			]),
		).toEqual([{ descripcion: `Creó el flujo ${nombre} a partir de ${origen.nombre}` }]);
		// El mismo nombre, con otras mayúsculas, ya existe.
		expect(
			(await crear({ nombre: nombre.toUpperCase(), parte_de: "flujo", flujo_origen_id: origen.flujoId })).cuerpo,
		).toMatchObject({
			codigo: "flujo_repetido",
			mensaje: "Ya hay un flujo con ese nombre.",
		});
	});

	it("de una sola operación: el corte con quien corta y las del parámetro con la otra persona", async () => {
		const corta = await nuevaPersona(servidor.base.dueno, "taller");
		const hace = await nuevaPersona(servidor.base.dueno, "taller");
		const creado = flujoCreado.parse(
			(
				await crear({
					nombre: `Mandil ${uuidv7().slice(-6)}`,
					parte_de: "una_sola_operacion",
					persona_corte_id: corta,
					persona_base_id: hace,
				})
			).cuerpo.resultado,
		);
		expect(creado.operaciones).toMatchObject([
			{ nombre: "Corte", orden: 1, persona_base_id: corta },
			{ nombre: "Confección completa", orden: 2, persona_base_id: hace },
			{ nombre: "Empaque", orden: 3, persona_base_id: hace },
		]);
	});

	it("los datos que faltan, una persona que no es del Taller y un origen dado de baja no crean nada", async () => {
		const deLaOficina = await nuevaPersona(servidor.base.dueno);
		const delTaller = await nuevaPersona(servidor.base.dueno, "taller");
		expect((await crear({ nombre: " ", parte_de: "flujo" })).cuerpo).toMatchObject({
			campos: { nombre: "Escribe el nombre del flujo." },
		});
		expect((await crear({ nombre: "Sin origen", parte_de: "flujo" })).cuerpo).toMatchObject({
			campos: { flujo_origen_id: "Escoge de cuál parte." },
		});
		expect(
			(
				await crear({
					nombre: `Otro ${uuidv7().slice(-6)}`,
					parte_de: "una_sola_operacion",
					persona_corte_id: delTaller,
					persona_base_id: deLaOficina,
				})
			).cuerpo,
		).toMatchObject({ codigo: "persona_no_valida", mensaje: "¿Quién la hace?" });
		const deBaja = await flujoDePrueba(servidor.base.dueno);
		await servidor.base.dueno.query("UPDATE flujos SET baja_en = now() WHERE id = $1", [deBaja.flujoId]);
		const nombre = `Desde uno de baja ${uuidv7().slice(-6)}`;
		expect((await crear({ nombre, parte_de: "flujo", flujo_origen_id: deBaja.flujoId })).cuerpo).toMatchObject({
			codigo: "flujo_origen_de_baja",
		});
		expect(await consultar("SELECT id FROM flujos WHERE nombre = $1", [nombre])).toEqual([]);
	});
});
