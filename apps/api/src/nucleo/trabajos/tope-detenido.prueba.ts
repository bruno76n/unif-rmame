/**
 * Prueba del tope detenido: una transacción abierta que frena el tope seguro avisa a soporte una vez.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../acciones/corredor.ts";
import { crearBase } from "../base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { revisarTopeDetenido } from "./tope-detenido.ts";
import { contextoDeTrabajo, type DependenciasDelTrabajador } from "./trabajador.ts";

describe("un tope que no avanza en sync.minutos_tope_detenido avisa a soporte", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/**
	 * Revisa el tope como el reloj, con la hora `minutos` después de ahora.
	 * @returns Lo que respondió y los avisos a soporte.
	 */
	async function revisar(minutos: number) {
		const avisos: string[] = [];
		const dependencias: DependenciasDelTrabajador = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant().add({ minutes: minutos }),
			avisarFalla: async (trabajo, error) => {
				avisos.push(`${trabajo} falló: ${error}`);
			},
		};
		const detenido = await revisarTopeDetenido(contextoDeTrabajo(dependencias, "reloj"));
		return { detenido, avisos };
	}

	it("sin transacciones abiertas, nada; con una abierta antes del límite, nada; al llegar, un solo aviso por episodio", async () => {
		expect(await revisar(30)).toEqual({ detenido: undefined, avisos: [] });
		const abierta = await servidor.base.app.connect();
		try {
			await abierta.query("BEGIN");
			await abierta.query(
				"INSERT INTO prueba_lotes (id, nombre, ubicacion_id) SELECT $1, 'L-abierto', id FROM ubicaciones WHERE codigo = 'TAL'",
				[uuidv7()],
			);
			const antes = await revisar(5);
			expect(antes.avisos).toEqual([]);
			expect(antes.detenido).toBeGreaterThanOrEqual(4);
			const alLimite = await revisar(11);
			expect(alLimite.avisos).toEqual([
				expect.stringMatching(
					/^El tope de la sincronización falló: una transacción abierta desde hace 1[01] minutos no deja bajar los cambios a ningún aparato$/,
				),
			]);
			// La misma transacción no vuelve a avisar.
			expect((await revisar(12)).avisos).toEqual([]);
		} finally {
			await abierta.query("ROLLBACK");
			abierta.release();
		}
		expect((await revisar(30)).detenido).toBeUndefined();
	});
});
