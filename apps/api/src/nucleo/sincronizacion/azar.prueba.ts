/**
 * Prueba con datos al azar de la subida: la cola de la tablet llega en tandas de cualquier tamaño, con
 * respuestas perdidas, tandas cortadas por una falla del servidor y la misma tanda mandada dos veces a la vez.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 *
 * La tablet hace lo que dice su archivo: manda desde el primero sin respuesta, quita de su cola lo que tuvo
 * respuesta y vuelve a mandar lo demás. Algunos bultos llegan antes que su lote y esperan. Al final la base
 * tiene que quedar igual que sin fallas: cada lote y cada bulto una sola vez, cada comando una sola vez y
 * ninguno apartado.
 */

import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llaveDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

/** Un comando de la cola, con lo que hace falta para saber cómo debe quedar la base. */
interface ComandoDeLaCola {
	clave_idempotencia: string;
	accion: string;
	datos: Record<string, unknown>;
	ocurrido_en: string;
	/** El texto único de su bitácora, para hacerla fallar una vez; vacío si no tiene uno (los bultos). */
	texto: string;
}

/** Una tanda: cuántos comandos lleva y qué le pasa. */
const tanda = fc.record({
	tamano: fc.integer({ min: 1, max: 4 }),
	respuestaPerdida: fc.boolean(),
	cortada: fc.boolean(),
	doble: fc.boolean(),
});

/** La cola: lotes con sus bultos; un bulto puede ir antes que su lote (llega antes y espera). */
const cola = fc.array(
	fc.record({
		bultos: fc.array(fc.integer({ min: 1, max: 150 }), { maxLength: 3 }),
		bultoAntes: fc.boolean(),
	}),
	{ minLength: 1, maxLength: 3 },
);

describe("con cualquier orden de tandas, respuestas perdidas, tandas cortadas y reintentos, la base queda igual que sin fallas", () => {
	let servidor: ServidorDePrueba;
	let numero = 0;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La tablet sube una tanda; regresa sus respuestas, o nada si la respuesta se perdió. */
	async function subir(comandos: readonly ComandoDeLaCola[]) {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/sync/subir",
			headers: { authorization: llaveDePrueba("tablet"), "x-app-version": "1.0.0" },
			payload: {
				enviado_en: new Date().toISOString(),
				pendientes_por_subir: comandos.length,
				comandos: comandos.map(({ texto: _texto, ...comando }) => comando),
			},
		});
		expect(respuesta.statusCode).toBe(200);
		const cuerpo: { respuestas: { clave_idempotencia: string }[]; detenido: boolean } = respuesta.json();
		return cuerpo;
	}

	/**
	 * Arma la cola de la tablet, en el orden en que pasó.
	 * @returns Los comandos, y los lotes y los bultos que tienen que quedar.
	 */
	function armarCola(lotes: { bultos: number[]; bultoAntes: boolean }[]) {
		const comandos: ComandoDeLaCola[] = [];
		const esperados = { lotes: new Set<string>(), bultos: new Map<string, number>() };
		let minuto = 0;
		const hora = () => new Date(Date.UTC(2026, 10, 10, 16, minuto++)).toISOString();
		for (const lote of lotes) {
			numero++;
			const loteId = uuidv7();
			esperados.lotes.add(loteId);
			const nombre = `L-azar-${numero}`;
			const abrir: ComandoDeLaCola = {
				clave_idempotencia: nuevaClave(),
				accion: "prueba.abrir_lote",
				datos: { id: loteId, nombre },
				ocurrido_en: hora(),
				texto: `Abrió el lote ${nombre}`,
			};
			const bultos = lote.bultos.map((piezas): ComandoDeLaCola => {
				const id = uuidv7();
				esperados.bultos.set(id, piezas);
				return {
					clave_idempotencia: nuevaClave(),
					accion: "prueba.registrar_bulto",
					datos: { id, lote_id: loteId, piezas },
					ocurrido_en: hora(),
					texto: "",
				};
			});
			const [primero, ...demas] = bultos;
			if (lote.bultoAntes && primero !== undefined) comandos.push(primero, abrir, ...demas);
			else comandos.push(abrir, ...bultos);
		}
		return { comandos, esperados };
	}

	it("cada lote, cada bulto y cada comando una sola vez, y ninguno apartado", { timeout: 600_000 }, async () => {
		await fc.assert(
			fc.asyncProperty(cola, fc.array(tanda, { minLength: 1, maxLength: 12 }), async (lotes, tandas) => {
				const { comandos, esperados } = armarCola(lotes);
				const pendientes = [...comandos];
				// La tablet sigue subiendo hasta vaciar su cola; las tandas al azar, y luego sin fallas.
				for (let vuelta = 0; pendientes.length > 0; vuelta++) {
					const azar = tandas[vuelta] ?? { tamano: 4, respuestaPerdida: false, cortada: false, doble: false };
					const envio = pendientes.slice(0, azar.tamano);
					// Una falla del servidor a media tanda: la bitácora del último lote de la tanda falla una vez.
					const ultimoLote = envio.findLast((comando) => comando.texto !== "");
					if (azar.cortada && ultimoLote !== undefined) servidor.fallas.bitacoraUnaVez.add(ultimoLote.texto);
					const respuestas = azar.doble ? (await Promise.all([subir(envio), subir(envio)]))[0] : await subir(envio);
					servidor.fallas.bitacoraUnaVez.clear();
					if (azar.respuestaPerdida) continue;
					// Sale de la cola lo que tuvo respuesta, en orden.
					pendientes.splice(0, respuestas.respuestas.length);
				}
				const claves = comandos.map((comando) => comando.clave_idempotencia);
				const recibidos = await servidor.base.dueno.query(
					"SELECT resultado, count(*)::int AS n FROM comandos_recibidos WHERE clave_idempotencia = ANY($1) GROUP BY resultado",
					[claves],
				);
				const porResultado = Object.fromEntries(recibidos.rows.map((renglon) => [renglon.resultado, renglon.n]));
				expect((porResultado.aplicado ?? 0) + (porResultado.excepcion ?? 0)).toBe(comandos.length);
				expect(porResultado.apartado).toBeUndefined();
				const lotesEnLaBase = await servidor.base.dueno.query("SELECT id FROM prueba_lotes WHERE id = ANY($1)", [
					[...esperados.lotes],
				]);
				expect(new Set(lotesEnLaBase.rows.map((renglon) => renglon.id))).toEqual(esperados.lotes);
				const bultosEnLaBase = await servidor.base.dueno.query(
					"SELECT id, piezas FROM prueba_bultos WHERE lote_id = ANY($1)",
					[[...esperados.lotes]],
				);
				expect(new Map(bultosEnLaBase.rows.map((renglon) => [renglon.id, renglon.piezas]))).toEqual(esperados.bultos);
			}),
			{ numRuns: 60 },
		);
	});
});
