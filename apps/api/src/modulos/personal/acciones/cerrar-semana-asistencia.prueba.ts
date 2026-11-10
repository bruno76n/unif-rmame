/**
 * Prueba de capturar la asistencia y cerrar la semana: un día fuera de lo que se puede no se captura, cambiar
 * uno capturado deja su bitácora, la semana no se cierra con días exigidos sin capturar y cerrada no cambia.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una semana ya terminada: del lunes 26 al sábado 31 de octubre de 2026. */
const lunes = "2026-10-26";
const sabado = "2026-10-31";

/** Lo que regresa capturar un día. */
const diaCapturado = z.object({ asistencia_dia_id: z.uuid(), version: z.number().int() });

describe("la semana no se cierra con días exigidos sin capturar; cerrada no se cambia", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Personal marca un día. */
	function marcar(personaId: string, fecha: string, valor: string, version?: number) {
		return mandarAccion(
			servidor,
			"personal.cambiar_dia_asistencia",
			{ datos: { persona_id: personaId, fecha, valor, ...(version === undefined ? {} : { version }) } },
			"personal",
		);
	}

	/** La semana que empieza en un lunes, con su id y su versión. */
	async function semana(inicio: string): Promise<{ id: string; version: number; estado: string }> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, version::int AS version, estado FROM asistencia_semanas WHERE fecha_inicio = $1",
			[inicio],
		);
		return z.object({ id: z.uuid(), version: z.number(), estado: z.string() }).parse(rows[0]);
	}

	/** Cierra la semana que empieza en un lunes. */
	async function cerrar(inicio: string) {
		const { id, version } = await semana(inicio);
		return mandarAccion(
			servidor,
			"personal.cerrar_semana_asistencia",
			{ datos: { asistencia_semana_id: id }, version },
			"personal",
		);
	}

	/** Captura directo en la base todos los días exigidos de la semana, menos los de `menos`. */
	async function capturarATodos(inicio: string, fin: string, menos: readonly string[]) {
		const { id } = await semana(inicio);
		await servidor.base.dueno.query(
			`INSERT INTO asistencia_dias (id, asistencia_semana_id, persona_id, fecha, valor, origen)
			 SELECT gen_random_uuid(), $1, p.id, d::date, 'completo', 'personal'
			 FROM personas p CROSS JOIN generate_series($2::date, $3::date, '1 day') d
			 WHERE p.forma_pago IN ('tiempo', 'mixta') AND p.fecha_ingreso <= d::date AND p.baja_en IS NULL
			   AND extract(isodow FROM d) BETWEEN 1 AND 6 AND NOT (p.id = ANY($4::uuid[]))
			 ON CONFLICT DO NOTHING`,
			[id, inicio, fin, menos],
		);
	}

	it("captura: pieza, día no laboral y antes de su ingreso no se capturan; la primera captura sin bitácora, el cambio con ella", async () => {
		const porPieza = await nuevaPersona(servidor.base.dueno, "taller");
		await servidor.base.dueno.query(
			"UPDATE personas SET forma_pago = 'pieza', pago_dia_centavos = NULL WHERE id = $1",
			[porPieza],
		);
		expect((await marcar(porPieza, lunes, "completo")).cuerpo).toMatchObject({ codigo: "persona_sin_asistencia" });
		const sergio = await nuevaPersona(servidor.base.dueno, "oficina");
		expect((await marcar(sergio, "2026-11-01", "completo")).cuerpo).toMatchObject({
			codigo: "dia_no_laboral",
			mensaje: "domingo, 1 de noviembre no es día laboral",
		});
		expect((await marcar(sergio, "2019-12-30", "completo")).cuerpo).toMatchObject({
			codigo: "antes_de_ingreso",
			mensaje: "Persona de prueba entró el 6 de enero",
		});
		const primera = await marcar(sergio, "2026-10-28", "completo");
		expect(primera.estado).toBe(200);
		const dia = diaCapturado.parse(primera.cuerpo.resultado);
		const sinBitacora = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE accion = 'personal.cambiar_dia_asistencia' AND entidad_id = $1",
			[sergio],
		);
		expect(sinBitacora.rows[0]).toEqual({ n: 0 });
		const vieja = dia.version;
		const cambio = await marcar(sergio, "2026-10-28", "medio", vieja);
		expect(cambio.estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, antes, despues FROM bitacora WHERE accion = 'personal.cambiar_dia_asistencia' AND entidad_id = $1",
			[sergio],
		);
		expect(rows).toEqual([
			{
				descripcion: "Cambió la asistencia de Persona de prueba del 28 de octubre: completo → medio día",
				antes: { fecha: "2026-10-28", valor: "completo" },
				despues: { fecha: "2026-10-28", valor: "medio" },
			},
		]);
		expect((await marcar(sergio, "2026-10-28", "falta", vieja)).cuerpo).toMatchObject({ error: "conflicto_version" });
	});

	it("no cierra con días sin capturar (dice cuántos y el primero); cerrada no se cambia ni se vuelve a cerrar", async () => {
		const falta = await nuevaPersona(servidor.base.dueno, "oficina");
		await marcar(falta, lunes, "completo");
		await capturarATodos(lunes, sabado, [falta]);
		const sinCapturar = await cerrar(lunes);
		expect(sinCapturar.estado).toBe(422);
		expect(sinCapturar.cuerpo).toMatchObject({
			codigo: "dias_sin_capturar",
			mensaje: "Faltan 5 días por capturar",
			datos: { persona_id: falta, fecha: "2026-10-27" },
		});
		for (const fecha of ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"])
			await marcar(falta, fecha, "completo");
		expect((await cerrar(lunes)).cuerpo).toMatchObject({ mensaje: "Falta 1 día por capturar" });
		await marcar(falta, sabado, "falta");
		const cerrada = await cerrar(lunes);
		expect(cerrada.cuerpo).toMatchObject({
			resultado: { mensaje: "Semana cerrada: contaduría ya puede pagar la nómina" },
		});
		expect((await semana(lunes)).estado).toBe("cerrada");
		expect((await marcar(falta, sabado, "completo")).cuerpo).toMatchObject({
			codigo: "semana_cerrada",
			mensaje: "La semana del 26 al 31 de octubre ya está cerrada: la tiene contaduría",
		});
		expect((await cerrar(lunes)).cuerpo).toMatchObject({ codigo: "semana_ya_cerrada" });
	});

	it("la semana que corre no se cierra antes de su último día; quien se dio de baja dentro de ella solo debe hasta su baja", async () => {
		// Una semana que todavía no termina: del lunes 7 al sábado 12 de enero de 2030.
		const futura = await nuevaPersona(servidor.base.dueno, "oficina");
		await marcar(futura, "2030-01-07", "completo");
		expect((await cerrar("2030-01-07")).cuerpo).toMatchObject({
			codigo: "semana_sin_terminar",
			mensaje: "La semana del 7 al 12 de enero termina el 12 de enero: ciérrala desde ese día",
		});
		// La semana del 2 al 7 de noviembre: la persona se dio de baja el miércoles 4.
		const semanaDos = "2026-11-02";
		const sabadoDos = "2026-11-07";
		const deBaja = await nuevaPersona(servidor.base.dueno, "oficina");
		await marcar(deBaja, semanaDos, "completo");
		await servidor.base.dueno.query(
			"UPDATE personas SET baja_en = '2026-11-04T12:00:00-06:00', motivo_baja = 'Renunció' WHERE id = $1",
			[deBaja],
		);
		expect((await marcar(deBaja, "2026-11-05", "completo")).cuerpo).toMatchObject({
			codigo: "despues_de_baja",
			mensaje: "Persona de prueba se dio de baja el 4 de noviembre",
		});
		await capturarATodos(semanaDos, sabadoDos, [deBaja]);
		expect((await cerrar(semanaDos)).cuerpo).toMatchObject({ mensaje: "Faltan 2 días por capturar" });
		await marcar(deBaja, "2026-11-03", "completo");
		await marcar(deBaja, "2026-11-04", "medio");
		expect((await cerrar(semanaDos)).cuerpo).toMatchObject({
			resultado: { mensaje: expect.stringContaining("Semana cerrada") },
		});
	});
});
