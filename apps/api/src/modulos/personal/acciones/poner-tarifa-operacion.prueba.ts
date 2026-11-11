/**
 * Prueba de las tarifas: la nueva cierra la vigente, cero no se acepta, sin el permiso no se pone ni viaja,
 * la misma tarifa no escribe, la vigente de un momento, y copiar las de un flujo.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { operacionDePrueba } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa poner una tarifa. */
const tarifaPuesta = z.object({ tarifa_operacion_id: z.uuid(), version: z.number().int(), mensaje: z.string() });

describe("la tarifa nueva cierra la vigente; una tarifa en cero no se acepta; una tarifa no viaja sin el permiso", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pone la tarifa como `quien` (por omisión, Personal con «ven sueldos y tarifas»). */
	function poner(operacion: string, tarifa: unknown, version?: number, quien = "personal_sueldos") {
		return mandarAccion(
			servidor,
			"personal.poner_tarifa_operacion",
			{
				datos: {
					flujo_operacion_id: operacion,
					tarifa_centavos: tarifa,
					...(version === undefined ? {} : { version }),
				},
			},
			quien,
		);
	}

	/** Las tarifas de una operación, de la más vieja a la nueva. */
	async function tarifasDe(operacion: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT tarifa_centavos::int AS tarifa, vigente_hasta IS NULL AS vigente FROM tarifas_operacion WHERE flujo_operacion_id = $1 ORDER BY vigente_desde, id",
			[operacion],
		);
		return rows;
	}

	it("la primera abre la vigente; la nueva cierra la anterior; la misma no escribe; con la versión vieja, 409", async () => {
		const deLaPrueba = await operacionDePrueba(servidor.base.dueno);
		const operacion = deLaPrueba.id;
		const primera = tarifaPuesta.parse((await poner(operacion, 100)).cuerpo.resultado);
		expect(primera.mensaje).toBe(`${deLaPrueba.nombre}: $1.00 por pieza desde ahora`);
		const nueva = await poner(operacion, 120, primera.version);
		expect(nueva.estado).toBe(200);
		expect(await tarifasDe(operacion)).toEqual([
			{ tarifa: 100, vigente: false },
			{ tarifa: 120, vigente: true },
		]);
		const vigente = tarifaPuesta.parse(nueva.cuerpo.resultado);
		const huella = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT version::int AS version, xid_escritura::text AS xid, actualizado_en FROM tarifas_operacion WHERE id = $1",
					[vigente.tarifa_operacion_id],
				)
			).rows[0];
		const antesDeLaMisma = await huella();
		const misma = await poner(operacion, 120, vigente.version);
		expect(misma.estado).toBe(200);
		expect(await tarifasDe(operacion)).toHaveLength(2);
		// La misma tarifa no escribe nada: ni la versión, ni el número de transacción, ni cuándo cambió.
		expect(await huella()).toEqual(antesDeLaMisma);
		expect((await poner(operacion, 150, primera.version)).cuerpo).toMatchObject({ error: "conflicto_version" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion_recortada, sensible_sueldos FROM bitacora WHERE accion = 'personal.poner_tarifa_operacion' AND entidad_id = $1",
			[vigente.tarifa_operacion_id],
		);
		expect(rows).toEqual([
			{
				descripcion_recortada: `Tarifa de «${deLaPrueba.nombre}» en ${deLaPrueba.flujo}: •••• → ••••`,
				sensible_sueldos: true,
			},
		]);
	});

	it("cero o texto no se aceptan; sin «ven sueldos y tarifas», 403 sin_permiso_fino y nada se escribe", async () => {
		const operacion = (await operacionDePrueba(servidor.base.dueno)).id;
		const cero = await poner(operacion, 0);
		expect(cero.estado).toBe(400);
		expect(cero.cuerpo).toMatchObject({ campos: { tarifa_centavos: "Escribe la tarifa en pesos, por ejemplo 1.50" } });
		expect((await poner(operacion, "1.50")).estado).toBe(400);
		const sinPermiso = await poner(operacion, 100, undefined, "personal");
		expect(sinPermiso.estado).toBe(403);
		expect(sinPermiso.cuerpo).toMatchObject({ codigo: "sin_permiso_fino" });
		expect(await tarifasDe(operacion)).toEqual([]);
	});

	it("la vigente de un momento es la de entonces; copiar un flujo copia las vigentes y deja «Sin tarifa» las que no tenían", async () => {
		const conTarifa = (await operacionDePrueba(servidor.base.dueno)).id;
		const sinTarifa = (await operacionDePrueba(servidor.base.dueno)).id;
		const primera = tarifaPuesta.parse((await poner(conTarifa, 100)).cuerpo.resultado);
		const antes = Temporal.Now.instant().toString();
		await new Promise((listo) => setTimeout(listo, 20));
		await poner(conTarifa, 130, primera.version);
		const base = crearBase(servidor.base.app);
		const enAntes = await enAccionDePrueba(base, servidor.modulos, (contexto) =>
			contexto.lectura("personal.tarifa_vigente", { flujo_operacion_id: conTarifa, en: antes }),
		);
		expect(enAntes).toMatchObject({ tarifa_centavos: 100 });
		const ahora = await enAccionDePrueba(base, servidor.modulos, (contexto) =>
			contexto.lectura("personal.tarifa_vigente", {
				flujo_operacion_id: conTarifa,
				en: Temporal.Now.instant().toString(),
			}),
		);
		expect(ahora).toMatchObject({ tarifa_centavos: 130 });
		const nuevas = {
			conTarifa: (await operacionDePrueba(servidor.base.dueno)).id,
			sinTarifa: (await operacionDePrueba(servidor.base.dueno)).id,
		};
		const copiadas = await enAccionDePrueba(
			base,
			servidor.modulos,
			(contexto) =>
				contexto.interna("personal.copiar_tarifas_flujo", {
					flujo_origen_id: uuidv7(),
					flujo_id: uuidv7(),
					origen: "Playera polo",
					flujo: "Playera polo manga larga",
					operaciones: [
						{ origen_id: conTarifa, nueva_id: nuevas.conTarifa },
						{ origen_id: sinTarifa, nueva_id: nuevas.sinTarifa },
					],
				}),
			{ escribirBitacora: true },
		);
		expect(copiadas).toEqual({ copiadas: 1 });
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion_recortada, sensible_sueldos FROM bitacora WHERE descripcion LIKE 'Copió 1 tarifas%'",
		);
		expect(bitacora.rows).toEqual([
			{ descripcion_recortada: "Copió 1 tarifas de Playera polo a Playera polo manga larga", sensible_sueldos: true },
		]);
		expect(await tarifasDe(nuevas.conTarifa)).toEqual([{ tarifa: 130, vigente: true }]);
		expect(await tarifasDe(nuevas.sinTarifa)).toEqual([]);
	});

	it("tres primeras tarifas a la vez sobre la misma operación: una entra y las otras responden 409; queda una sola vigente", async () => {
		const operacion = (await operacionDePrueba(servidor.base.dueno)).id;
		const respuestas = await Promise.all([poner(operacion, 100), poner(operacion, 110), poner(operacion, 120)]);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 409, 409]);
		expect((await tarifasDe(operacion)).filter((tarifa) => tarifa.vigente)).toHaveLength(1);
	});

	it("una operación que ya no está en el flujo no recibe tarifa (fase 12)", async () => {
		const operacion = await operacionDePrueba(servidor.base.dueno);
		await servidor.base.dueno.query("UPDATE flujo_operaciones SET baja_en = now() WHERE id = $1", [operacion.id]);
		expect((await poner(operacion.id, 100)).cuerpo).toMatchObject({
			codigo: "operacion_de_baja",
			mensaje: "Esa operación ya no está en el flujo",
		});
		expect(await tarifasDe(operacion.id)).toEqual([]);
	});
});
