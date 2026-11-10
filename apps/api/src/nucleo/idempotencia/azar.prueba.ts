/**
 * Prueba con datos al azar de la idempotencia.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 3)
 *
 * Cada intención (una persona que aprieta un botón) se manda con una sola clave, de una a tres veces: a
 * veces al mismo tiempo, a veces después de perder la respuesta (el cliente no la lee y vuelve a mandar),
 * a veces con una falla pasajera del servidor en su primer envío (la bitácora falla y nada queda) y a
 * veces con un choque de Postgres (`40001`) que el corredor repite solo. Al final la base tiene que
 * quedar igual que sin fallas: una nota, un conteo de su interna, un comando y una bitácora por intención.
 */

import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contar, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** Una intención y cómo llega. */
const intencion = fc.record({
	monto: fc.integer({ min: 0, max: 1_000_000 }),
	veces: fc.integer({ min: 1, max: 3 }),
	alMismoTiempo: fc.boolean(),
	fallaPasajera: fc.boolean(),
	choque: fc.boolean(),
});

describe("con cualquier serie de reintentos, respuestas perdidas y llamadas al mismo tiempo, la base queda igual que sin fallas", () => {
	let servidor: ServidorDePrueba;
	let numero = 0;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("una nota, un conteo, un comando y una bitácora por intención, y la misma respuesta a cada envío que salió bien", {
		timeout: 600_000,
	}, async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(intencion, { minLength: 1, maxLength: 5 }), async (intenciones) => {
				const antes = {
					notas: await contar(servidor, "prueba_notas"),
					conteos: await contar(servidor, "prueba_conteos"),
					bitacora: servidor.pedidos.bitacora.length,
				};
				const claves: string[] = [];
				await Promise.all(
					intenciones.map(async (una) => {
						numero++;
						const texto = `intencion-${numero}`;
						const clave = nuevaClave();
						claves.push(clave);
						const datos = { texto, monto_centavos: una.monto, ...(una.choque ? { fallar: "con_choque_una_vez" } : {}) };
						if (una.fallaPasajera) {
							servidor.fallas.bitacoraUnaVez.add(texto);
							expect((await mandarAccion(servidor, "prueba.crear_nota", { clave, datos })).estado).toBe(500);
						}
						const respuestas: unknown[] = [];
						const enviar = async (leer: boolean) => {
							const respuesta = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
							expect(respuesta.estado).toBe(200);
							if (leer) respuestas.push(respuesta.cuerpo);
						};
						// El primer envío «pierde» su respuesta: el cliente no la lee y vuelve a mandar.
						if (una.alMismoTiempo) await Promise.all(Array.from({ length: una.veces }, (_, i) => enviar(i > 0)));
						else for (let i = 0; i < una.veces; i++) await enviar(i > 0 || una.veces === 1);
						for (const respuesta of respuestas) expect(respuesta).toEqual(respuestas[0]);
					}),
				);
				expect(await contar(servidor, "prueba_notas")).toBe(antes.notas + intenciones.length);
				expect(await contar(servidor, "prueba_conteos")).toBe(antes.conteos + intenciones.length);
				expect(servidor.pedidos.bitacora.length).toBe(antes.bitacora + intenciones.length);
				const { rows } = await servidor.base.dueno.query(
					"SELECT count(*)::int AS n FROM comandos_recibidos WHERE clave_idempotencia = ANY($1::uuid[])",
					[claves],
				);
				expect(rows[0]?.n).toBe(intenciones.length);
			}),
			{ numRuns: 150 },
		);
	});
});
