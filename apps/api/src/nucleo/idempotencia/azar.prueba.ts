/**
 * Prueba con datos al azar de la idempotencia.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 3)
 *
 * Cada intención (una persona que aprieta un botón) se manda de una a tres veces con la misma clave:
 * a veces al mismo tiempo, a veces después de perder la respuesta y a veces después de una falla
 * pasajera del servidor. Al final la base tiene que quedar igual que sin fallas: una nota por intención.
 */

import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contar, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** Una intención y cómo llega: cuántas veces, si algunas van al mismo tiempo y si la primera falla. */
const intencion = fc.record({
	texto: fc.string({ minLength: 1, maxLength: 12 }),
	monto: fc.integer({ min: 0, max: 1_000_000 }),
	veces: fc.integer({ min: 1, max: 3 }),
	alMismoTiempo: fc.boolean(),
	primeraFalla: fc.boolean(),
});

describe("con cualquier serie de reintentos, respuestas perdidas y llamadas al mismo tiempo, la base queda igual que sin fallas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("una nota por intención y la misma respuesta a cada envío que salió bien", { timeout: 120_000 }, async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(intencion, { minLength: 1, maxLength: 6 }), async (intenciones) => {
				const antes = await contar(servidor, "prueba_notas");
				await Promise.all(
					intenciones.map(async (una) => {
						const clave = nuevaClave();
						const datos = { texto: una.texto, monto_centavos: una.monto };
						const respuestas: unknown[] = [];
						// Una falla pasajera del servidor en el primer envío: no deja nada y el reintento aplica.
						if (una.primeraFalla) {
							const fallida = await mandarAccion(servidor, "prueba.provocar", { datos: { error: "no_disponible" } });
							expect(fallida.estado).toBe(503);
						}
						const enviar = async () => {
							const respuesta = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
							expect(respuesta.estado).toBe(200);
							respuestas.push(respuesta.cuerpo);
						};
						if (una.alMismoTiempo) await Promise.all(Array.from({ length: una.veces }, enviar));
						else for (let i = 0; i < una.veces; i++) await enviar();
						// Todas las respuestas, también las «perdidas» que el cliente no leyó, son la misma.
						for (const respuesta of respuestas) expect(respuesta).toEqual(respuestas[0]);
					}),
				);
				expect(await contar(servidor, "prueba_notas")).toBe(antes + intenciones.length);
			}),
			{ numRuns: 25 },
		);
	});
});
