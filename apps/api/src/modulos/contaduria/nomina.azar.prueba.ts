/**
 * Prueba al azar de la nómina a lo largo de varias semanas: con registros que llegan tarde, que toman su tarifa
 * después o que se cancelan después de pagados, cada registro se paga una vez y se corrige una vez, y lo pagado por
 * piezas, con sus correcciones, es lo que valen los registros vigentes con tarifa.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «A lo largo de varias semanas,
 * cada registro se paga una vez y se corrige una vez»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cancelarRegistroDeNomina,
	pagarNominaDePrueba,
	personaDeNomina,
	ponerTarifaDeNomina,
	registroDeNomina,
	semanaConNomina,
} from "../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que pasa antes de pagar una semana. */
const suceso = fc.oneof(
	fc.record({
		tipo: fc.constant("registro" as const),
		persona: fc.nat(1),
		semanasAtras: fc.nat(2),
		buenas: fc.integer({ min: 1, max: 200 }),
		danadas: fc.integer({ min: 0, max: 5 }),
		tarifa: fc.option(fc.integer({ min: 1, max: 300 }), { freq: 3 }),
	}),
	fc.record({ tipo: fc.constant("tarifa" as const), cual: fc.nat(30), tarifa: fc.integer({ min: 1, max: 300 }) }),
	fc.record({ tipo: fc.constant("cancelar" as const), cual: fc.nat(30) }),
);

/** Uno de esos sucesos. */
type Suceso = typeof suceso extends fc.Arbitrary<infer T> ? T : never;

/** Un registro de la prueba, como lo lleva la prueba. */
interface RegistroDeLaPrueba {
	id: string;
	personaId: string;
	buenas: number;
	tarifa: number | null;
	cancelado: boolean;
}

/** El lunes de la primera semana de prueba: cada vuelta usa las semanas que siguen. */
const primerLunes = Temporal.PlainDate.from("2023-01-02");

describe("A lo largo de varias semanas, cada registro se paga una vez y se corrige una vez", () => {
	let servidor: ServidorDePrueba;
	let semanasUsadas = 0;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La siguiente semana de prueba, con su nómina. */
	async function siguienteSemana() {
		const lunes = primerLunes.add({ weeks: semanasUsadas });
		semanasUsadas += 1;
		return semanaConNomina(servidor, lunes.toString());
	}

	/** Paga una semana y revisa que entre. */
	async function pagar(nominaId: string) {
		const respuesta = await pagarNominaDePrueba(servidor, nominaId);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
	}

	/** Hace lo que pasa antes de pagar una semana. */
	async function hacer(evento: Suceso, lunes: Temporal.PlainDate, personas: string[], registros: RegistroDeLaPrueba[]) {
		if (evento.tipo === "registro") {
			const personaId = personas[evento.persona] ?? "";
			const fecha = lunes.subtract({ weeks: evento.semanasAtras }).add({ days: 2 }).toString();
			const id = await registroDeNomina(servidor, {
				personaId,
				fecha,
				buenas: evento.buenas,
				danadas: evento.danadas,
				tarifaCentavos: evento.tarifa,
			});
			registros.push({ id, personaId, buenas: evento.buenas, tarifa: evento.tarifa, cancelado: false });
			return;
		}
		const registro = registros[evento.cual % Math.max(1, registros.length)];
		if (registro === undefined) return;
		if (evento.tipo === "tarifa") {
			if (registro.tarifa !== null) return;
			await ponerTarifaDeNomina(servidor, registro.id, evento.tarifa);
			registro.tarifa = evento.tarifa;
			return;
		}
		if (registro.cancelado) return;
		await cancelarRegistroDeNomina(servidor, registro.id);
		registro.cancelado = true;
	}

	it("con registros tardíos, tarifas después y cancelaciones después de pagados, nada se paga dos veces ni se queda sin pagar", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.array(suceso, { maxLength: 6 }), { minLength: 2, maxLength: 4 }),
				async (semanas) => {
					const personas = [
						await personaDeNomina(servidor, { nombre: "Pieza al azar de prueba", formaPago: "pieza" }),
						await personaDeNomina(servidor, {
							nombre: "Mixta al azar de prueba",
							formaPago: "mixta",
							pagoDiaCentavos: 30_000,
						}),
					];
					const registros: RegistroDeLaPrueba[] = [];
					const nominas: string[] = [];
					for (const sucesos of semanas) {
						const semana = await siguienteSemana();
						for (const evento of sucesos)
							await hacer(evento, Temporal.PlainDate.from(semana.inicio), personas, registros);
						await pagar(semana.nominaId);
						nominas.push(semana.nominaId);
					}
					// Una semana más, sin nada nuevo: entran las últimas correcciones y tarifas.
					const ultima = await siguienteSemana();
					await pagar(ultima.nominaId);
					nominas.push(ultima.nominaId);
					for (const registro of registros) {
						const piezas = await consultar(
							"SELECT tipo, count(*)::int AS n FROM nomina_linea_piezas WHERE registro_operacion_id = $1 GROUP BY tipo",
							[registro.id],
						);
						const cuantas = (tipo: string) => piezas.find((pieza) => pieza.tipo === tipo)?.n ?? 0;
						// Una vez a lo más; sin tarifa, nunca; vigente con tarifa, siempre. Se corrige solo si se pagó y se canceló.
						expect(cuantas("pago")).toBeLessThanOrEqual(1);
						if (registro.tarifa === null) expect(cuantas("pago")).toBe(0);
						if (registro.tarifa !== null && !registro.cancelado) expect(cuantas("pago")).toBe(1);
						expect(cuantas("correccion")).toBe(registro.cancelado && cuantas("pago") === 1 ? 1 : 0);
					}
					// Lo pagado por piezas más sus correcciones es lo que valen los vigentes con tarifa.
					for (const personaId of personas) {
						const [pagado] = await consultar(
							`SELECT coalesce(sum(importe_piezas_centavos + correcciones_centavos), 0)::int AS total
							 FROM nomina_lineas WHERE persona_id = $1 AND nomina_id = ANY($2::uuid[])`,
							[personaId, nominas],
						);
						const vale = registros
							.filter((registro) => registro.personaId === personaId && !registro.cancelado && registro.tarifa !== null)
							.reduce((suma, registro) => suma + registro.buenas * (registro.tarifa ?? 0), 0);
						expect(pagado?.total).toBe(vale);
					}
				},
			),
			{ numRuns: 12 },
		);
	});
});
