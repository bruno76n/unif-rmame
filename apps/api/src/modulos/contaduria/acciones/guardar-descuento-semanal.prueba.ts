/**
 * Prueba del descuento semanal: se pone, se cambia (termina el vigente y nace otro) y se quita con 0; no a quien está
 * dado de baja; sin «ven sueldos y tarifas» no se pone, y su bitácora llega sin montos.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Sin "ven sueldos y tarifas" no
 * se paga la nómina ni se pone un descuento, y su bitácora llega sin montos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { personaDeNomina } from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El descuento semanal se pone, se cambia y se quita, con «ven sueldos y tarifas» y sin montos en la bitácora", () => {
	let servidor: ServidorDePrueba;
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

	/** Guarda el descuento de una persona, con la versión de su vigente si tiene. */
	async function guardar(personaId: string, monto: number, motivo?: string, quien = "contaduria_sueldos") {
		const [vigente] = await consultar(
			"SELECT version::int AS v FROM descuentos_nomina WHERE persona_id = $1 AND estado = 'vigente'",
			[personaId],
		);
		return mandarAccion(
			servidor,
			"contaduria.guardar_descuento_semanal",
			{
				datos: { persona_id: personaId, monto_semanal_centavos: monto, ...(motivo === undefined ? {} : { motivo }) },
				...(vigente === undefined ? {} : { version: vigente.v }),
			},
			quien,
		);
	}

	it("se pone, se cambia y se quita con 0; los descuentos terminados quedan con quién y cuándo", async () => {
		const persona = await personaDeNomina(servidor, {
			nombre: "Sergio Gómez de prueba",
			formaPago: "tiempo",
			pagoDiaCentavos: 35_000,
		});
		expect((await guardar(persona, 0)).cuerpo).toMatchObject({
			codigo: "sin_descuento",
			mensaje: "Sergio Gómez de prueba no tiene descuento semanal.",
		});
		expect((await guardar(persona, 20_000)).cuerpo).toMatchObject({
			campos: { motivo: "Escribe por qué se le descuenta." },
		});
		expect((await guardar(persona, 20_050, "Préstamo para la moto")).estado).toBe(400);
		expect((await guardar(persona, 20_000, "Préstamo para la moto")).cuerpo.resultado).toMatchObject({
			mensaje: "Sergio Gómez de prueba: $200 de descuento cada semana, desde esta nómina",
		});
		expect((await guardar(persona, 30_000, "Préstamo más grande")).estado).toBe(200);
		expect((await guardar(persona, 0)).cuerpo.resultado).toMatchObject({
			mensaje: "Sergio Gómez de prueba ya no tiene descuento semanal",
		});
		expect(
			await consultar(
				`SELECT monto_semanal_centavos::int AS monto, estado, terminado_por IS NOT NULL AS con_quien
				 FROM descuentos_nomina WHERE persona_id = $1 ORDER BY creado_en, id`,
				[persona],
			),
		).toEqual([
			{ monto: 20_000, estado: "terminado", con_quien: true },
			{ monto: 30_000, estado: "terminado", con_quien: true },
		]);
	});

	it("no a quien está dado de baja; sin «ven sueldos y tarifas» no se pone; su bitácora llega sin montos", async () => {
		const persona = await personaDeNomina(servidor, { nombre: "Persona de baja de prueba", formaPago: "pieza" });
		expect((await guardar(persona, 10_000, "Adelanto de sueldo", "contaduria")).estado).toBe(403);
		const conDescuento = await personaDeNomina(servidor, { nombre: "Lupita Ramos de prueba", formaPago: "pieza" });
		expect((await guardar(conDescuento, 10_000, "Adelanto de sueldo")).estado).toBe(200);
		const [renglon] = await consultar(
			`SELECT descripcion, descripcion_recortada, sensible_sueldos FROM bitacora
			 WHERE accion = 'contaduria.guardar_descuento_semanal' AND descripcion LIKE '%Lupita Ramos de prueba%'`,
			[],
		);
		expect(renglon).toEqual({
			descripcion: "Descuento semanal de Lupita Ramos de prueba: sin descuento → $100 · Adelanto de sueldo",
			descripcion_recortada: "Descuento semanal de Lupita Ramos de prueba: sin descuento → •••• · Adelanto de sueldo",
			sensible_sueldos: true,
		});
		await consultar("UPDATE personas SET baja_en = now(), motivo_baja = 'Se fue del taller' WHERE id = $1", [persona]);
		expect((await guardar(persona, 10_000, "Adelanto de sueldo")).cuerpo).toMatchObject({
			codigo: "persona_de_baja",
			mensaje: "Persona de baja de prueba está dada de baja.",
		});
	});
});
