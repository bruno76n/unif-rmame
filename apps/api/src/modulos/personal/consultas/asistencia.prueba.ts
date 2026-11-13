/**
 * Prueba de `personal.asistencia` y de la pastilla de Personal con los datos de la muestra: la cuadrícula de la semana
 * (quien cobra por tiempo o mixta, cada día de trabajo, lo capturado con su versión y la suma de sus días), el renglón
 * de la semana en Pendientes, los PIN que faltan y los bloqueados, las operaciones sin tarifa solo con el permiso de
 * sueldos, las semanas cerradas que solo la dueña reabre, y que solo la piden las cuentas con Personal.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … sueldos y tarifas sin su permiso»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { flujoSinTarifas, idDePersona, valorDe } from "./de-prueba.ts";

/** Lo que se revisa de la respuesta. */
interface Asistencia {
	indicadores: {
		asistencia: { sin_capturar: number; cerrada: boolean; personas: number; completos: number; medios: number };
		personas: { activas: number; sin_cuenta: number };
		tablet: { sin_acceso: number; activos: number; bloqueados: number };
	};
	pendientes: {
		clave: string;
		grupo: string;
		tipo: string;
		referencia: string;
		detalle: string;
		fecha_texto: string | null;
		estado: { texto: string; color: string };
		boton: Record<string, unknown> | null;
	}[];
	pestanas: { asistencia: number; tablet: number; tarifas: number | null };
	semana: {
		asistencia_semana_id: string | null;
		inicio: string;
		fin: string;
		texto: string;
		cerrada: boolean;
		dias: { fecha: string; texto: string }[];
		personas: {
			persona_id: string;
			nombre: string;
			detalle: string;
			dias: {
				fecha: string;
				valor: string | null;
				version: number | null;
				capturable: boolean;
				por_llegar: boolean;
			}[];
			total: number;
		}[];
		sin_capturar: number;
		primero_sin_capturar: { persona_id: string; fecha: string } | null;
	};
	semanas_cerradas: { asistencia_semana_id: string; texto: string; faltas: number; reabrible: boolean }[];
	ve_tarifas: boolean;
	pastilla: { conteo: number; rojo: boolean };
}

describe("Personal · Asistencia: la cuadrícula de la semana, los pendientes y la pastilla", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como una cuenta, y revisa que salió. */
	async function asistencia(quien = "personal", parametros: Record<string, string> = {}): Promise<Asistencia> {
		const respuesta = await pedirConsulta(servidor, "personal.asistencia", parametros, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Asistencia;
	}

	/** Cuántas personas activas del Taller no tienen cuenta viva ni PIN vivo. */
	async function sinPinEnLaBase(): Promise<number> {
		return Number(
			await valorDe(
				servidor,
				`SELECT count(*) FROM personas p WHERE p.baja_en IS NULL AND p.area = 'taller'
				AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.persona_id = p.id AND u.estado IN ('activa', 'solicitada'))
				AND NOT EXISTS (SELECT 1 FROM pines x WHERE x.persona_id = p.id AND x.estado IN ('activo', 'bloqueado'))`,
			),
		);
	}

	it("solo la piden las cuentas con Personal", async () => {
		for (const quien of ["ventas", "produccion", "contaduria", "direccion"]) {
			expect((await pedirConsulta(servidor, "personal.asistencia", {}, quien)).estado, quien).toBe(403);
		}
		expect((await pedirConsulta(servidor, "personal.asistencia", {}, "personal")).estado).toBe(200);
	});

	it("la cuadrícula de la semana que corre: quien cobra por tiempo o mixta, cada día de trabajo, sin capturar al empezar", async () => {
		const { semana } = await asistencia();
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City");
		const lunes = hoy.subtract({ days: hoy.dayOfWeek - 1 });
		// `general.dias_de_trabajo` empieza de lunes a sábado.
		expect(semana.inicio).toBe(lunes.toString());
		expect(semana.fin).toBe(lunes.add({ days: 5 }).toString());
		expect(semana.dias).toHaveLength(6);
		expect(semana.dias[0]?.texto).toBe(`lun ${lunes.day}`);
		const conAsistencia = Number(
			await valorDe(
				servidor,
				"SELECT count(*) FROM personas WHERE baja_en IS NULL AND forma_pago IN ('tiempo', 'mixta')",
			),
		);
		expect(semana.personas).toHaveLength(conAsistencia);
		const nombres = semana.personas.map((persona) => persona.nombre);
		expect(nombres).toContain("Sergio Gómez");
		expect(nombres).not.toContain("Lupita Ramos");
		expect(semana.personas.find((persona) => persona.nombre === "Sergio Gómez")?.detalle).toBe("Taller · Mixta");
		expect(semana.sin_capturar).toBe(conAsistencia * 6);
		expect(semana.primero_sin_capturar).not.toBeNull();
	});

	it("los días que todavía no llegan van marcados para no pintarse en rojo; los de hoy y antes, no", async () => {
		const { semana } = await asistencia();
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City");
		const [persona] = semana.personas;
		expect(persona).toBeDefined();
		for (const dia of persona?.dias ?? []) {
			expect(dia.por_llegar, dia.fecha).toBe(Temporal.PlainDate.compare(Temporal.PlainDate.from(dia.fecha), hoy) > 0);
		}
	});

	it("un día capturado se pinta con su valor y su versión, y «Días» suma completo 1 y medio 0.5", async () => {
		const persona = await idDePersona(servidor, "Diana Vega");
		const antes = await asistencia();
		const [lunes, martes] = antes.semana.dias;
		if (lunes === undefined || martes === undefined) throw new Error("la semana no tiene días");
		for (const [fecha, valor] of [
			[lunes.fecha, "completo"],
			[martes.fecha, "medio"],
		] as const) {
			const capturado = await mandarAccion(
				servidor,
				"personal.cambiar_dia_asistencia",
				{ datos: { persona_id: persona, fecha, valor } },
				"personal",
			);
			expect(capturado.estado, JSON.stringify(capturado.cuerpo)).toBe(200);
		}
		const { semana, indicadores } = await asistencia();
		const diana = semana.personas.find((uno) => uno.persona_id === persona);
		expect(diana?.total).toBe(1.5);
		expect(diana?.dias[0]).toMatchObject({ fecha: lunes.fecha, valor: "completo", capturable: true });
		expect(diana?.dias[0]?.version).toEqual(expect.any(Number));
		expect(diana?.dias[1]).toMatchObject({ valor: "medio" });
		expect(diana?.dias[2]).toMatchObject({ valor: null, version: null, capturable: true });
		expect(semana.sin_capturar).toBe(antes.semana.sin_capturar - 2);
		expect(semana.asistencia_semana_id).toEqual(expect.any(String));
		expect(indicadores.asistencia).toMatchObject({ sin_capturar: semana.sin_capturar, cerrada: false });
		expect(indicadores.asistencia.completos).toBeGreaterThanOrEqual(1);
		expect(indicadores.asistencia.medios).toBeGreaterThanOrEqual(1);
	});

	it("un día antes del ingreso de la persona sale gris, sin botón, y no se exige", async () => {
		const { semana: antes } = await asistencia();
		const [, , miercoles] = antes.dias;
		if (miercoles === undefined) throw new Error("la semana no tiene miércoles");
		const alta = await mandarAccion(
			servidor,
			"personal.dar_alta_persona",
			{
				datos: {
					nombre: "Nadia Ochoa",
					area: "taller",
					puesto: "Empaque",
					forma_pago: "tiempo",
					pago_dia_centavos: 30_000,
					fecha_ingreso: miercoles.fecha,
				},
			},
			"personal_sueldos",
		);
		// Si hoy es lunes o martes, el ingreso del miércoles sería futuro: la prueba revisa lo que se pudo dar de alta.
		if (alta.estado !== 200) {
			expect(alta.cuerpo).toMatchObject({ campos: { fecha_ingreso: expect.any(String) } });
			return;
		}
		const { semana } = await asistencia();
		const nadia = semana.personas.find((persona) => persona.nombre === "Nadia Ochoa");
		expect(nadia?.dias.map((dia) => dia.capturable)).toEqual([false, false, true, true, true, true]);
		expect(semana.sin_capturar).toBe(antes.sin_capturar + 4);
	});

	it("Pendientes: el renglón de la semana, uno por persona del Taller sin PIN, y la pastilla y la pestaña que los cuentan", async () => {
		const datos = await asistencia();
		const semana = datos.pendientes.filter((renglon) => renglon.grupo === "asistencia");
		expect(semana).toHaveLength(1);
		expect(semana[0]).toMatchObject({
			tipo: "Asistencia",
			referencia: `Semana del ${datos.semana.texto}`,
			estado: { texto: "Por capturar", color: "ambar" },
			boton: { tipo: "cerrar_semana", principal: false },
		});
		expect(semana[0]?.detalle).toMatch(/^\d+ personas por tiempo · \d+ días sin capturar$/);
		expect(semana[0]?.fecha_texto).toMatch(/^Nómina \d+ [a-z]+$/);
		const sinPin = await sinPinEnLaBase();
		const pines = datos.pendientes.filter((renglon) => renglon.grupo === "pin");
		expect(pines).toHaveLength(sinPin);
		expect(pines[0]).toMatchObject({ tipo: "PIN", estado: { texto: "Sin PIN", color: "ambar" } });
		expect(pines[0]?.detalle).toMatch(/ · sin acceso a la tablet del taller$/);
		expect(datos.indicadores.tablet.sin_acceso).toBe(sinPin);
		// La cuenta de Personal sin el permiso no ve las tarifas.
		expect(datos.ve_tarifas).toBe(false);
		expect(datos.pendientes.filter((renglon) => renglon.grupo === "tarifas")).toHaveLength(0);
		expect(datos.pestanas.tarifas).toBeNull();
		expect(datos.pestanas.tablet).toBe(sinPin);
		expect(datos.pestanas.asistencia).toBe(datos.semana.sin_capturar);
		expect(datos.pastilla).toEqual({ conteo: 1 + sinPin, rojo: false });
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "personal");
		const { departamentos } = armazon.cuerpo.resultado as {
			departamentos: { clave: string; conteo: number | null; rojo: boolean }[];
		};
		expect(departamentos.find((uno) => uno.clave === "personal")).toMatchObject({ conteo: 1 + sinPin, rojo: false });
	});

	it("un PIN bloqueado sale en rojo con «Desbloquear» y la versión de su PIN, y pone roja la pastilla", async () => {
		const persona = await idDePersona(servidor, "Paty Lara");
		const asignado = await mandarAccion(
			servidor,
			"personal.asignar_pin",
			{ datos: { persona_id: persona } },
			"personal",
		);
		expect(asignado.estado, JSON.stringify(asignado.cuerpo)).toBe(200);
		await servidor.base.dueno.query(
			"UPDATE pines SET estado = 'bloqueado', bloqueado_en = now(), intentos_fallidos = 5 WHERE persona_id = $1 AND estado = 'activo'",
			[persona],
		);
		const version = Number(
			await valorDe(servidor, "SELECT version FROM pines WHERE persona_id = $1 AND estado = 'bloqueado'", persona),
		);
		const datos = await asistencia();
		const bloqueado = datos.pendientes.find((renglon) => renglon.referencia === "Paty Lara");
		expect(bloqueado).toMatchObject({
			grupo: "pin",
			detalle: "Se bloqueó por 5 PIN equivocados",
			estado: { texto: "Bloqueado", color: "rojo" },
			boton: { tipo: "desbloquear_pin", persona_id: persona, version },
		});
		// El rojo va primero.
		expect(datos.pendientes[0]?.referencia).toBe("Paty Lara");
		expect(datos.indicadores.tablet.bloqueados).toBe(1);
		expect(datos.pastilla.rojo).toBe(true);
		// El PIN y su hash nunca viajan.
		expect(JSON.stringify(datos)).not.toMatch(/argon2|pin_hash/);
	});

	it("con «ven sueldos y tarifas», cada operación sin tarifa da su renglón y su conteo; sin el permiso, no", async () => {
		const flujo = await flujoSinTarifas(servidor, "Flujo de prueba de Personal");
		const conPermiso = await asistencia("personal_sueldos");
		expect(conPermiso.ve_tarifas).toBe(true);
		const tarifas = conPermiso.pendientes.filter((renglon) => renglon.grupo === "tarifas");
		expect(tarifas).toHaveLength(flujo.operaciones.length);
		expect(tarifas[0]).toMatchObject({
			tipo: "Tarifa",
			estado: { texto: "Sin tarifa", color: "ambar" },
			boton: { tipo: "poner_tarifa", flujo_id: flujo.flujo_id },
		});
		expect(tarifas[0]?.referencia).toMatch(/ · Flujo de prueba de Personal$/);
		expect(tarifas[0]?.detalle).toBe("0 registros esperan su tarifa");
		expect(conPermiso.pestanas.tarifas).toBe(flujo.operaciones.length);
		const sinPermiso = await asistencia("personal");
		expect(sinPermiso.pendientes.filter((renglon) => renglon.grupo === "tarifas")).toHaveLength(0);
		expect(conPermiso.pastilla.conteo - sinPermiso.pastilla.conteo).toBe(flujo.operaciones.length);
	});

	it("las semanas cerradas: las últimas cuatro, con sus faltas; «Reabrir semana» solo para la dueña", async () => {
		// Una semana de hace tres semanas, cerrada como la deja Personal, con una falta.
		const { semana } = await asistencia();
		const inicio = Temporal.PlainDate.from(semana.inicio).subtract({ weeks: 3 });
		const fin = inicio.add({ days: 5 });
		const semanaId = z.uuid().parse(
			await valorDe(
				servidor,
				`INSERT INTO asistencia_semanas (id, fecha_inicio, fecha_fin, estado, cerrada_en, cerrada_por)
				VALUES (gen_random_uuid(), $1, $2, 'cerrada', now(), '01936f2e-0000-7000-8000-00000000000a') RETURNING id`,
				inicio.toString(),
				fin.toString(),
			),
		);
		await servidor.base.dueno.query(
			`INSERT INTO asistencia_dias (id, asistencia_semana_id, persona_id, fecha, valor, origen)
			VALUES (gen_random_uuid(), $1, $2, $3, 'falta', 'personal')`,
			[semanaId, await idDePersona(servidor, "Beto Aguilar"), inicio.toString()],
		);
		const dePersonal = (await asistencia("personal")).semanas_cerradas;
		const suya = dePersonal.find((uno) => uno.asistencia_semana_id === semanaId);
		expect(suya).toMatchObject({ faltas: 1, reabrible: false });
		expect(dePersonal.length).toBeLessThanOrEqual(4);
		const deLaDuena = (await asistencia("duena")).semanas_cerradas;
		expect(deLaDuena.find((uno) => uno.asistencia_semana_id === semanaId)).toMatchObject({ reabrible: true });
		// La cuadrícula de una semana cerrada se pide por su id: cerrada, sin días por capturar que pidan cierre.
		const cerrada = await asistencia("personal", { asistencia_semana_id: semanaId });
		expect(cerrada.semana).toMatchObject({ asistencia_semana_id: semanaId, cerrada: true });
	});
});
