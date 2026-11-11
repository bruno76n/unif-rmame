/**
 * Prueba del trabajo «Cuadre nocturno»: un cuadre que no termina avisa a la dueña; al terminar se encola la
 * depuración de eventos.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 5)
 */

import { join } from "node:path";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { correrTrabajo } from "../../../nucleo/trabajos/trabajador.ts";
import { cuadreNocturno } from "./cuadre-nocturno.ts";

describe("Un cuadre que no termina avisa a la dueña; al terminar se encola la depuración de eventos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre el trabajo a esa hora, como el worker en su vuelta del día. */
	async function correr(ahora: string) {
		await correrTrabajo(
			{
				base: crearBase(servidor.base.app),
				registro: await cargarModulos(join(import.meta.dirname, "../..")),
				servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
				avisarFalla: async () => undefined,
				enviarCorreo: async () => undefined,
				dominioWeb: "https://fabrica.prueba.invalid",
				reloj: () => Temporal.Instant.from(ahora),
			},
			cuadreNocturno,
			{ periodo: ahora.slice(0, 10) },
		);
	}

	it("corre a la hora de `inventario.hora_cuadre` el cuadre del día que terminó; al terminar se encola la depuración", async () => {
		// Las 03:00 del 11 de noviembre en México: cuadra el 10.
		await correr("2026-11-11T09:00:00Z");
		const { rows } = await servidor.base.dueno.query("SELECT fecha::text, estado FROM cuadres");
		expect(rows).toEqual([{ fecha: "2026-11-10", estado: "cuadro" }]);
		await procesarComoElWorker(servidor);
		const { rows: tareas } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'admin.depurar_eventos'",
		);
		expect(tareas[0]?.n).toBe(1);
		const horario = await cuadreNocturno.horario?.({
			base: crearBase(servidor.base.app),
			ahora: Temporal.Now.instant(),
			periodo: undefined,
			eventoId: undefined,
			respaldo: undefined,
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			avisarFalla: async () => undefined,
			enTransaccion: async () => {
				throw new Error("el horario no escribe");
			},
		});
		expect(horario).toEqual({ cada: "dia", hora: "03:00" });
		// Correrlo otra vez no hace un segundo cuadre.
		await correr("2026-11-11T09:30:00Z");
		expect((await servidor.base.dueno.query("SELECT count(*)::int AS n FROM cuadres")).rows[0]?.n).toBe(1);
	});

	it("si el cuadre no termina, queda en `fallo` con su error y la dueña recibe `cuadre_fallido`", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 3);
		// Una existencia alterada que el cuadre no puede corregir: a la app se le quitó escribir existencias.
		await servidor.base.dueno.query("UPDATE existencias SET piezas = 8 WHERE ubicacion_id = $1 AND variante_id = $2", [
			ubicacion.BOD,
			variante,
		]);
		await servidor.base.dueno.query("REVOKE UPDATE ON existencias FROM uniformame_app");
		try {
			await expect(correr("2026-11-12T09:00:00Z")).rejects.toThrow();
		} finally {
			await servidor.base.dueno.query("GRANT UPDATE ON existencias TO uniformame_app");
		}
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, error IS NOT NULL AS con_error, terminado_en IS NOT NULL AS terminado FROM cuadres WHERE fecha = '2026-11-11'",
		);
		expect(rows).toEqual([{ estado: "fallo", con_error: true, terminado: true }]);
		const { rows: avisos } = await servidor.base.dueno.query(
			"SELECT a.texto, a.por_correo, u.es_duena FROM avisos a JOIN usuarios u ON u.id = a.usuario_id WHERE a.tipo = 'cuadre_fallido'",
		);
		expect(avisos).toEqual([
			{
				texto: "El cuadre de inventario del 11 de noviembre no terminó. Soporte ya lo está revisando.",
				por_correo: true,
				es_duena: true,
			},
		]);
	});
});
