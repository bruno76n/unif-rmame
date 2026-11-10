/**
 * Prueba de capturar la asistencia y cerrar la semana: un día fuera de lo que se puede no se captura, cambiar
 * uno capturado deja su bitácora, la semana no se cierra con días exigidos sin capturar y cerrada no cambia.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
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

	/** La semana guardada de la semana de lunes a domingo de un día, con su id y su versión. */
	async function semana(inicio: string): Promise<{ id: string; version: number; estado: string }> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, version::int AS version, estado FROM asistencia_semanas WHERE date_trunc('week', fecha_inicio::timestamp) = date_trunc('week', $1::timestamp)",
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
			 WHERE p.forma_pago IN ('tiempo', 'mixta') AND p.fecha_ingreso <= d::date
			   AND (p.baja_en IS NULL OR (p.baja_en AT TIME ZONE 'America/Mexico_City')::date >= d::date)
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

	it("si la dueña cambia los días de trabajo, un día de la semana cerrada sigue sin cambiarse y no se abre otra semana encimada", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "oficina");
		const dia = diaCapturado.parse((await marcar(persona, "2026-09-30", "completo")).cuerpo.resultado);
		await capturarATodos("2026-09-28", "2026-10-03", []);
		expect((await cerrar("2026-09-28")).estado).toBe(200);
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_texto = '2,3,4,5,6' WHERE clave = 'general.dias_de_trabajo'",
		);
		try {
			expect((await marcar(persona, "2026-09-30", "falta", dia.version)).cuerpo).toMatchObject({
				codigo: "semana_cerrada",
			});
			expect((await marcar(persona, "2026-09-29", "falta")).cuerpo).toMatchObject({ codigo: "semana_cerrada" });
			const { rows } = await servidor.base.dueno.query(
				"SELECT fecha_inicio::text AS inicio, estado FROM asistencia_semanas WHERE fecha_inicio BETWEEN '2026-09-28' AND '2026-10-04'",
			);
			expect(rows).toEqual([{ inicio: "2026-09-28", estado: "cerrada" }]);
			const valor = await servidor.base.dueno.query("SELECT valor FROM asistencia_dias WHERE id = $1", [
				dia.asistencia_dia_id,
			]);
			expect(valor.rows[0]).toEqual({ valor: "completo" });
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_texto = '1,2,3,4,5,6' WHERE clave = 'general.dias_de_trabajo'",
			);
		}
	});

	it("la regla 4: quien entró a media semana, quien cobra mixto y quien se dio de baja a las 23:30 de México", async () => {
		const entro = await nuevaPersona(servidor.base.dueno, "oficina");
		await servidor.base.dueno.query("UPDATE personas SET fecha_ingreso = '2026-09-16' WHERE id = $1", [entro]);
		const mixta = await nuevaPersona(servidor.base.dueno, "oficina");
		await servidor.base.dueno.query("UPDATE personas SET forma_pago = 'mixta' WHERE id = $1", [mixta]);
		const salio = await nuevaPersona(servidor.base.dueno, "oficina");
		await marcar(entro, "2026-09-16", "completo");
		await servidor.base.dueno.query(
			"UPDATE personas SET baja_en = '2026-09-16T23:30:00-06:00', motivo_baja = 'Renunció' WHERE id = $1",
			[salio],
		);
		expect((await marcar(entro, "2026-09-15", "completo")).cuerpo).toMatchObject({ codigo: "antes_de_ingreso" });
		expect((await marcar(salio, "2026-09-17", "completo")).cuerpo).toMatchObject({ codigo: "despues_de_baja" });
		await capturarATodos("2026-09-14", "2026-09-19", [entro, mixta, salio]);
		// Entró el miércoles: 3 días más; mixta: los 6; salió el miércoles en la noche: lunes a miércoles.
		expect((await cerrar("2026-09-14")).cuerpo).toMatchObject({ mensaje: "Faltan 12 días por capturar" });
	});

	it("capturar el último día mientras se cierra: o se captura y luego cierra, o cierra sin él y la captura se rechaza", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "oficina");
		await marcar(persona, "2026-09-07", "completo");
		await capturarATodos("2026-09-07", "2026-09-12", [persona]);
		for (const fecha of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"])
			await marcar(persona, fecha, "completo");
		const [cerrada, capturada] = await Promise.all([cerrar("2026-09-07"), marcar(persona, "2026-09-12", "completo")]);
		if (capturada.estado === 200) {
			expect([200, 422]).toContain(cerrada.estado);
		} else {
			expect(capturada.cuerpo).toMatchObject({ codigo: "semana_cerrada" });
			expect(cerrada.cuerpo).toMatchObject({ codigo: "dias_sin_capturar" });
		}
		// Nunca queda cerrada con el día sin capturar.
		const { rows } = await servidor.base.dueno.query(
			`SELECT s.estado, (SELECT count(*)::int FROM asistencia_dias d WHERE d.persona_id = $1 AND d.fecha = '2026-09-12') AS dia
			 FROM asistencia_semanas s WHERE s.fecha_inicio = '2026-09-07'`,
			[persona],
		);
		expect(rows[0]?.estado === "cerrada" ? rows[0]?.dia : 1).toBe(1);
	});

	it("si la dueña suma un día de trabajo a una semana abierta, la misma semana lo muestra y lo exige al cerrar", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "oficina");
		const dias = (valor: string) =>
			servidor.base.dueno.query("UPDATE parametros SET valor_texto = $1 WHERE clave = 'general.dias_de_trabajo'", [
				valor,
			]);
		await dias("2,3,4,5,6");
		try {
			for (const fecha of ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"])
				await marcar(persona, fecha, "completo");
			await capturarATodos("2026-10-05", "2026-10-10", [persona]);
			await dias("1,2,3,4,5,6");
			const leidos = await enAccionDePrueba(
				crearBase(servidor.base.app),
				servidor.modulos,
				(contexto) => contexto.lectura("personal.dias_de_semana", { persona_id: persona }),
				{ ahora: Temporal.Instant.from("2026-10-07T18:00:00Z") },
			);
			expect(leidos).toMatchObject({ inicio: "2026-10-05", estado: "abierta" });
			expect((leidos as { dias: { fecha: string; valor: string | null }[] }).dias[0]).toEqual({
				fecha: "2026-10-05",
				valor: null,
			});
			expect((await cerrar("2026-10-06")).cuerpo).toMatchObject({
				mensaje: "Falta 1 día por capturar",
				datos: { persona_id: persona, fecha: "2026-10-05" },
			});
			expect((await marcar(persona, "2026-10-05", "completo")).estado).toBe(200);
			const { rows } = await servidor.base.dueno.query(
				"SELECT count(*)::int AS n FROM asistencia_semanas WHERE fecha_inicio BETWEEN '2026-10-05' AND '2026-10-11'",
			);
			expect(rows[0]).toEqual({ n: 1 });
			expect((await cerrar("2026-10-06")).estado).toBe(200);
		} finally {
			await dias("1,2,3,4,5,6");
		}
	});
});
