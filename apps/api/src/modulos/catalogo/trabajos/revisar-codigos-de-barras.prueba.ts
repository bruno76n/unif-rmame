/**
 * Prueba del trabajo que avisa a la dueña cuando quedan pocos códigos de barras de fábrica.
 * Fase 8 · docs/fases/08-catalogo.md (parte 5)
 */

import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { revisarCodigosDeBarras } from "./revisar-codigos-de-barras.ts";

describe("Con menos de `catalogo.codigos_restantes_aviso` códigos, la dueña recibe el aviso una vez por semana, no cada noche", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lo que necesita el trabajo para correr, con la hora de verdad. */
	async function dependencias() {
		return {
			base: crearBase(servidor.base.app),
			registro: await cargarModulos(join(import.meta.dirname, "../..")),
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
			avisarFalla: async () => undefined,
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
		};
	}

	/** Corre el trabajo una vez. */
	async function correr(): Promise<void> {
		await correrTrabajo(await dependencias(), revisarCodigosDeBarras, {
			periodo: Temporal.Now.plainDateISO("America/Mexico_City").toString(),
		});
	}

	/** Los avisos de códigos que hay, con su texto y su cuenta. */
	async function avisosDeCodigos(): Promise<{ texto: string; cuenta: string; por_correo: boolean }[]> {
		const { rows } = await servidor.base.dueno.query(
			`SELECT a.texto, u.correo AS cuenta, a.por_correo FROM avisos a JOIN usuarios u ON u.id = a.usuario_id
			 WHERE a.tipo = 'codigos_por_acabarse' ORDER BY a.creado_en`,
		);
		return rows;
	}

	it("con códigos de sobra no avisa; con 100 avisa a la dueña, por correo; leído, no repite antes de 7 días; después sí", async () => {
		await correr();
		expect(await avisosDeCodigos()).toEqual([]);

		// Quedan 100: del siguiente al 499999.
		await servidor.base.dueno.query(
			"UPDATE contadores_folio SET siguiente = maximo - 99 WHERE tipo = 'codigo_barras' AND alcance = ''",
		);
		await correr();
		const [primero, ...otros] = await avisosDeCodigos();
		expect(otros).toEqual([]);
		expect(primero?.texto).toBe("Quedan 100 códigos de barras de fábrica (hasta 499999).");
		expect(primero?.por_correo).toBe(true);
		const { rows: duena } = await servidor.base.dueno.query(
			"SELECT u.correo FROM usuarios u WHERE u.es_duena AND u.estado = 'activa'",
		);
		expect(primero?.cuenta).toBe(duena[0]?.correo);

		// La dueña lo lee: la noche siguiente sigue abajo, pero no pasó una semana.
		await servidor.base.dueno.query("UPDATE avisos SET leido_en = now() WHERE tipo = 'codigos_por_acabarse'");
		await correr();
		expect(await avisosDeCodigos()).toHaveLength(1);

		// Ocho días después, otro.
		await servidor.base.dueno.query(
			"UPDATE avisos SET creado_en = now() - interval '8 days' WHERE tipo = 'codigos_por_acabarse'",
		);
		await correr();
		expect(await avisosDeCodigos()).toHaveLength(2);
	});

	it("corre cada día a las 04:00, hora de México", async () => {
		const horario = await revisarCodigosDeBarras.horario?.({
			...(await dependencias()),
			ahora: Temporal.Now.instant(),
			periodo: undefined,
			eventoId: undefined,
			respaldo: undefined,
			enTransaccion: async () => {
				throw new Error("el horario no escribe");
			},
		});
		expect(horario).toEqual({ cada: "dia", hora: "04:00" });
	});
});
