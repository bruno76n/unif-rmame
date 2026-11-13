/**
 * Prueba de `personal.persona`, el cajón de una persona: abrir su ficha deja «Consultó la ficha de {persona}» en la
 * bitácora; el pago por día solo viaja con «ven sueldos y tarifas»; trae su semana (días de asistencia y piezas), si
 * puede tener PIN y si lo tiene, las tiendas para el área y si la cuenta ve sueldos; sin persona, los valores del alta.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Las consultas sensibles (… la ficha … de una persona …) dejan su
 * renglón en la bitácora» y «Cada consulta … no manda lo que la cuenta no debe ver: … sueldos y tarifas sin su
 * permiso»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { idDePersona, valorDe } from "./de-prueba.ts";

/** Lo que se revisa de la respuesta. */
interface Ficha {
	id: string | null;
	nombre: string;
	area: string;
	forma_pago: string;
	pago_dia_centavos?: number | null;
	fecha_ingreso: string;
	esta_semana: { dias: number | null; piezas: number | null } | null;
	tablet: { puede: boolean; tiene: boolean } | null;
	tiendas: { id: string; nombre: string }[];
	ve_sueldos: boolean;
}

describe("El cajón de la persona: su ficha queda en la bitácora y el sueldo solo viaja con el permiso", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la ficha como una cuenta. */
	async function ficha(quien: string, personaId?: string): Promise<{ estado: number; ficha: Ficha; texto: string }> {
		const respuesta = await pedirConsulta(
			servidor,
			"personal.persona",
			personaId === undefined ? {} : { persona_id: personaId },
			quien,
		);
		return {
			estado: respuesta.estado,
			ficha: respuesta.cuerpo.resultado as Ficha,
			texto: JSON.stringify(respuesta.cuerpo),
		};
	}

	/** Cuántos renglones «Consultó la ficha de {nombre}» hay. */
	async function consultasDeLaFicha(nombre: string): Promise<number> {
		return Number(
			await valorDe(servidor, "SELECT count(*) FROM bitacora WHERE descripcion = $1", `Consultó la ficha de ${nombre}`),
		);
	}

	it("abrir la ficha de una persona deja «Consultó la ficha de {persona}» en la bitácora; el alta no", async () => {
		const sergio = await idDePersona(servidor, "Sergio Gómez");
		const antes = await consultasDeLaFicha("Sergio Gómez");
		const abierta = await ficha("personal", sergio);
		expect(abierta.estado, abierta.texto).toBe(200);
		expect(await consultasDeLaFicha("Sergio Gómez")).toBe(antes + 1);
		const bitacoras = Number(await valorDe(servidor, "SELECT count(*) FROM bitacora"));
		const alta = await ficha("personal");
		expect(alta.estado, alta.texto).toBe(200);
		expect(Number(await valorDe(servidor, "SELECT count(*) FROM bitacora"))).toBe(bitacoras);
	});

	it("sin «ven sueldos y tarifas» el pago por día no viaja; con él, sí; la dueña siempre", async () => {
		const sergio = await idDePersona(servidor, "Sergio Gómez");
		const sinPermiso = await ficha("personal", sergio);
		// El recorte común lo quita y lo dice en `recortado`.
		expect(JSON.stringify(sinPermiso.ficha)).not.toContain("pago_dia_centavos");
		expect(sinPermiso.texto).toContain('"recortado":["pago_dia_centavos"]');
		expect(sinPermiso.ficha.ve_sueldos).toBe(false);
		const conPermiso = await ficha("personal_sueldos", sergio);
		expect(conPermiso.ficha).toMatchObject({ pago_dia_centavos: 22_000, ve_sueldos: true });
		expect((await ficha("duena", sergio)).ficha).toMatchObject({ pago_dia_centavos: 22_000, ve_sueldos: true });
	});

	it("sin persona: los valores del alta (Taller, por pieza, hoy) y las tiendas para escoger", async () => {
		const { ficha: alta } = await ficha("personal");
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City").toString();
		expect(alta).toMatchObject({
			id: null,
			area: "taller",
			forma_pago: "pieza",
			fecha_ingreso: hoy,
			esta_semana: null,
			tablet: null,
		});
		expect(alta.tiendas.map((tienda) => tienda.nombre)).toEqual(["Tienda 1", "Tienda 2"]);
	});

	it("su semana: los días de asistencia de quien cobra por tiempo y las piezas de la gente del Taller", async () => {
		const diana = await idDePersona(servidor, "Diana Vega");
		const hoy = Temporal.Now.plainDateISO("America/Mexico_City");
		const lunes = hoy.subtract({ days: hoy.dayOfWeek - 1 });
		for (const [fecha, valor] of [
			[lunes, "completo"],
			[lunes.add({ days: 1 }), "medio"],
		] as const) {
			const capturado = await mandarAccion(
				servidor,
				"personal.cambiar_dia_asistencia",
				{ datos: { persona_id: diana, fecha: fecha.toString(), valor } },
				"personal",
			);
			expect(capturado.estado, JSON.stringify(capturado.cuerpo)).toBe(200);
		}
		const deDiana = (await ficha("personal", diana)).ficha;
		expect(deDiana.esta_semana?.dias).toBe(1.5);
		expect(deDiana.esta_semana?.piezas).toEqual(expect.any(Number));
		// Quien cobra por pieza no lleva asistencia; fuera del Taller no hay piezas.
		const lupita = (await ficha("personal", await idDePersona(servidor, "Lupita Ramos"))).ficha;
		expect(lupita.esta_semana?.dias).toBeNull();
		const rosa = (await ficha("personal", await idDePersona(servidor, "Rosa Méndez"))).ficha;
		expect(rosa.esta_semana?.piezas).toBeNull();
	});

	it("el PIN del taller: solo puede tenerlo quien está activa en el Taller sin cuenta, y dice si lo tiene", async () => {
		const juana = await idDePersona(servidor, "Juana Pérez");
		expect((await ficha("personal", juana)).ficha.tablet).toEqual({ puede: true, tiene: false });
		const asignado = await mandarAccion(servidor, "personal.asignar_pin", { datos: { persona_id: juana } }, "personal");
		expect(asignado.estado, JSON.stringify(asignado.cuerpo)).toBe(200);
		expect((await ficha("personal", juana)).ficha.tablet).toEqual({ puede: true, tiene: true });
		// Tomás entra con su cuenta de Google: no puede tener PIN.
		expect((await ficha("personal", await idDePersona(servidor, "Tomás Ruiz"))).ficha.tablet).toEqual({
			puede: false,
			tiene: false,
		});
	});

	it("solo la piden las cuentas con Personal", async () => {
		const sergio = await idDePersona(servidor, "Sergio Gómez");
		for (const quien of ["produccion", "contaduria", "ventas"]) {
			expect((await ficha(quien, sergio)).estado, quien).toBe(403);
		}
	});
});
