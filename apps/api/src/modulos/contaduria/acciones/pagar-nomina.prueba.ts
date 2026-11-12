/**
 * Prueba de pagar la nómina: pide «Confirmar con Google» y el total visto; se paga en orden, con su semana cerrada,
 * una sola vez aunque se apriete dos veces, y queda congelada; lo que llega tarde, toma su tarifa después o se cancela
 * después de pagado entra a la siguiente; sin «ven sueldos y tarifas» no se paga, y su bitácora llega sin montos.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterios «Pagar la nómina pide
 * "Confirmar con Google" y el total visto» y «Sin "ven sueldos y tarifas" no se paga la nómina»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	cancelarRegistroDeNomina,
	cuentaDePrueba,
	pagarNominaDePrueba,
	personaDeNomina,
	ponerTarifaDeNomina,
	registroDeNomina,
	renglonPagado,
	type SemanaDePrueba,
	semanaConNomina,
} from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Pagar la nómina pide Google y el total visto; se paga en orden, una sola vez, y queda congelada", () => {
	let servidor: ServidorDePrueba;
	let lupita: string;
	const semanas: SemanaDePrueba[] = [];
	let primerRegistro: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		lupita = await personaDeNomina(servidor, { nombre: "Lupita Ramos de prueba", formaPago: "pieza" });
		for (const lunes of ["2025-01-06", "2025-01-13", "2025-01-20"])
			semanas.push(await semanaConNomina(servidor, lunes));
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La semana de prueba número `i`. */
	function semana(i: number): SemanaDePrueba {
		const una = semanas[i];
		if (una === undefined) throw new Error(`no hay semana ${i}`);
		return una;
	}

	it("Pagar la nómina pide «Confirmar con Google» y el total visto; se paga en orden, con su semana cerrada", async () => {
		primerRegistro = await registroDeNomina(servidor, {
			personaId: lupita,
			fecha: "2025-01-08",
			buenas: 100,
			danadas: 3,
			tarifaCentavos: 120,
		});
		expect((await pagarNominaDePrueba(servidor, semana(1).nominaId)).cuerpo).toMatchObject({
			codigo: "semana_anterior_sin_pagar",
			mensaje: "Primero paga la nómina del 6 al 11 de enero",
		});
		await consultar("UPDATE asistencia_semanas SET estado = 'abierta', cerrada_en = NULL WHERE id = $1", [
			semana(0).semanaId,
		]);
		expect((await pagarNominaDePrueba(servidor, semana(0).nominaId)).cuerpo).toMatchObject({
			codigo: "asistencia_sin_cerrar",
			mensaje: "Asistencia sin cerrar: Personal tiene que cerrar la semana del 6 al 11 de enero",
		});
		await consultar("UPDATE asistencia_semanas SET estado = 'cerrada', cerrada_en = now() WHERE id = $1", [
			semana(0).semanaId,
		]);
		expect((await pagarNominaDePrueba(servidor, semana(0).nominaId, { encabezados: {} })).estado).toBe(401);
		const total = (await cuentaDePrueba(servidor, semana(0).nominaId)).totalCentavos;
		expect((await pagarNominaDePrueba(servidor, semana(0).nominaId, { total: total + 100 })).cuerpo).toMatchObject({
			codigo: "nomina_cambio",
			mensaje: expect.stringMatching(
				/^La nómina cambió desde que la abriste: ahora suma \$[\d,.]+\. Revísala y vuelve a pagar$/,
			),
		});
		const fuera = await personaDeNomina(servidor, { nombre: "Persona sin nada de prueba", formaPago: "pieza" });
		expect(
			(
				await pagarNominaDePrueba(servidor, semana(0).nominaId, {
					renglones: [{ persona_id: fuera, medio_pago: "efectivo" }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "persona_fuera_de_nomina",
			mensaje: "Persona sin nada de prueba no está en esta nómina.",
		});
		const pagada = await pagarNominaDePrueba(servidor, semana(0).nominaId, {
			renglones: [{ persona_id: lupita, medio_pago: "transferencia", referencia_pago: "SPEI 881" }],
		});
		expect(pagada.cuerpo.resultado).toMatchObject({ mensaje: "Nómina del 6 al 11 de enero pagada" });
		expect(await renglonPagado(servidor, semana(0).nominaId, lupita)).toMatchObject({
			piezas: 100,
			importe_piezas: 12_000,
			total: 12_000,
		});
		const [nomina] = await consultar(
			`SELECT estado, total_centavos::int AS total, regla_piezas_danadas, regla_descuento_mayor,
				confirmado_con_google_en IS NOT NULL AS con_google FROM nominas WHERE id = $1`,
			[semana(0).nominaId],
		);
		expect(nomina).toEqual({
			estado: "pagada",
			total,
			regla_piezas_danadas: false,
			regla_descuento_mayor: "perdonar",
			con_google: true,
		});
		const [medio] = await consultar(
			"SELECT medio_pago, referencia_pago FROM nomina_lineas WHERE nomina_id = $1 AND persona_id = $2",
			[semana(0).nominaId, lupita],
		);
		expect(medio).toEqual({ medio_pago: "transferencia", referencia_pago: "SPEI 881" });
		// Pagada, se congela: ya no se paga y su renglón no cambia aunque cambie la tarifa.
		expect((await pagarNominaDePrueba(servidor, semana(0).nominaId, { total })).cuerpo).toMatchObject({
			codigo: "nomina_pagada",
			mensaje: "La nómina del 6 al 11 de enero ya está pagada",
		});
		await ponerTarifaDeNomina(servidor, primerRegistro, 200);
		expect(await renglonPagado(servidor, semana(0).nominaId, lupita)).toMatchObject({ importe_piezas: 12_000 });
	});

	it("se paga una sola vez aunque se apriete dos veces", async () => {
		const registro = await registroDeNomina(servidor, {
			personaId: lupita,
			fecha: "2025-01-14",
			buenas: 50,
			tarifaCentavos: 100,
		});
		const total = (await cuentaDePrueba(servidor, semana(1).nominaId)).totalCentavos;
		const [uno, dos] = await Promise.all([
			pagarNominaDePrueba(servidor, semana(1).nominaId, { total }),
			pagarNominaDePrueba(servidor, semana(1).nominaId, { total }),
		]);
		const estados = [uno.estado, dos.estado].sort();
		expect(estados[0]).toBe(200);
		expect([409, 422]).toContain(estados[1]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM nomina_linea_piezas WHERE registro_operacion_id = $1", [
				registro,
			]),
		).toEqual([{ n: 1 }]);
		expect(await renglonPagado(servidor, semana(1).nominaId, lupita)).toMatchObject({ importe_piezas: 5_000 });
	});

	it("lo que llega tarde, toma su tarifa después o se cancela después de pagado entra a la siguiente nómina", async () => {
		// Llega hoy un registro del 8 de enero, ya pagado ese periodo; otro del 15 toma su tarifa hoy; el del 8 que se pagó
		// se cancela; y uno del 28 todavía no entra.
		await registroDeNomina(servidor, { personaId: lupita, fecha: "2025-01-08", buenas: 10, tarifaCentavos: 150 });
		const sinTarifa = await registroDeNomina(servidor, {
			personaId: lupita,
			fecha: "2025-01-15",
			buenas: 20,
			tarifaCentavos: null,
		});
		await ponerTarifaDeNomina(servidor, sinTarifa, 100);
		await cancelarRegistroDeNomina(servidor, primerRegistro);
		const despues = await registroDeNomina(servidor, {
			personaId: lupita,
			fecha: "2025-01-28",
			buenas: 5,
			tarifaCentavos: 100,
		});
		expect((await pagarNominaDePrueba(servidor, semana(2).nominaId)).estado).toBe(200);
		expect(await renglonPagado(servidor, semana(2).nominaId, lupita)).toMatchObject({
			piezas: 30,
			importe_piezas: 1_500 + 2_000,
			correcciones: -12_000,
			bruto: 3_500 - 12_000,
			total: 0,
			no_alcanzo: 8_500,
			destino: "perdonado",
		});
		const piezas = await consultar(
			`SELECT p.tipo, p.importe_centavos::int AS importe FROM nomina_linea_piezas p
			 JOIN nomina_lineas l ON l.id = p.nomina_linea_id WHERE l.nomina_id = $1 AND l.persona_id = $2 ORDER BY p.tipo, p.importe_centavos`,
			[semana(2).nominaId, lupita],
		);
		expect(piezas).toEqual([
			{ tipo: "correccion", importe: -12_000 },
			{ tipo: "pago", importe: 1_500 },
			{ tipo: "pago", importe: 2_000 },
		]);
		expect(
			await consultar("SELECT count(*)::int AS n FROM nomina_linea_piezas WHERE registro_operacion_id = $1", [despues]),
		).toEqual([{ n: 0 }]);
	});

	it("Sin «ven sueldos y tarifas» no se paga la nómina, y su bitácora llega sin montos", async () => {
		const otra = await semanaConNomina(servidor, "2025-01-27");
		expect((await pagarNominaDePrueba(servidor, otra.nominaId, { quien: "contaduria" })).estado).toBe(403);
		const [renglon] = await consultar(
			"SELECT descripcion, descripcion_recortada, sensible_sueldos, despues FROM bitacora WHERE entidad_id = $1",
			[semana(0).nominaId],
		);
		expect(renglon).toMatchObject({
			descripcion: "Pagó la nómina del 6 al 11 de enero · confirmado con Google",
			sensible_sueldos: true,
			despues: expect.objectContaining({ total_nomina_centavos: expect.any(Number) }),
		});
	});
});
