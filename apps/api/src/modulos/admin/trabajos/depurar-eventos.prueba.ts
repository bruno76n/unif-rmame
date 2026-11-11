/**
 * Prueba de `admin.depurar_eventos`.
 * Fase 4 · docs/fases/04-servicios-comunes.md («Excepciones permitidas»: se construye y se prueba aquí)
 */

import { join } from "node:path";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { cargarModulos } from "../../../nucleo/modulos.ts";
import { correrTrabajo, type DependenciasDelTrabajador } from "../../../nucleo/trabajos/trabajador.ts";
import { depurarEventos } from "./depurar-eventos.ts";

describe("depurar quita los eventos procesados de hace más de admin.dias_guardar_eventos soltando sus particiones; repetirlo no hace nada", () => {
	let prueba: BaseDePrueba;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		dependencias = {
			base: crearBase(prueba.app),
			registro: await cargarModulos(join(import.meta.dirname, "../..")),
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
			avisarFalla: async () => undefined,
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Instant.from("2026-11-10T18:00:00Z"),
		};
		// Las particiones de dos meses viejos, como las dejó el reloj en su momento.
		await prueba.dueno.query(`
			CREATE TABLE eventos_2026_05 PARTITION OF eventos FOR VALUES FROM ('2026-05-01Z') TO ('2026-06-01Z');
			CREATE TABLE eventos_2026_06 PARTITION OF eventos FOR VALUES FROM ('2026-06-01Z') TO ('2026-07-01Z');
			INSERT INTO eventos (id, tipo, modulo, tablas, ocurrido_en, creado_en, procesado_en) VALUES
				('01936f2e-0000-7000-8000-0000000000f1', 'nota.creada', 'prueba', '{x}', '2026-05-10Z', '2026-05-10Z', '2026-05-10Z'),
				('01936f2e-0000-7000-8000-0000000000f2', 'nota.creada', 'prueba', '{x}', '2026-06-10Z', '2026-06-10Z', NULL),
				('01936f2e-0000-7000-8000-0000000000f3', 'nota.creada', 'prueba', '{x}', now(), now(), now());
		`);
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	/** Los eventos de esta prueba que quedan (los de la muestra son del mes que corre). */
	async function quedan(): Promise<string[]> {
		const { rows } = await prueba.dueno.query("SELECT id FROM eventos WHERE modulo = 'prueba' ORDER BY id");
		return rows.map((renglon) => renglon.id);
	}

	it("suelta el mes viejo ya procesado; deja el que tiene algo sin procesar y lo reciente; otra vez no hace nada", async () => {
		await correrTrabajo(dependencias, depurarEventos, {});
		expect(await quedan()).toEqual(["01936f2e-0000-7000-8000-0000000000f2", "01936f2e-0000-7000-8000-0000000000f3"]);
		const { rows } = await prueba.dueno.query(
			"SELECT to_regclass('eventos_2026_05') AS mayo, to_regclass('eventos_2026_06') AS junio",
		);
		expect(rows[0]).toEqual({ mayo: null, junio: "eventos_2026_06" });
		await correrTrabajo(dependencias, depurarEventos, {});
		expect(await quedan()).toHaveLength(2);
	});
});
