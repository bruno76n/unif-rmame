/**
 * Prueba de registrar una deuda: nace con una cuenta por pagar por mensualidad, iguales con el ajuste de centavos en la
 * última o escritas a mano; el acreedor nuevo o el que ya existe; y queda saldada cuando se pagan todas.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Una deuda nace con una cuenta
 * por pagar por mensualidad»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { deudaDePrueba, pagarCuentaDePrueba } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una deuda nace con una cuenta por pagar por mensualidad", () => {
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

	/** Registra una deuda con lo que se diga. */
	function registrar(datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"contaduria.registrar_deuda",
			{
				datos: {
					descripcion: "Préstamo para la cortadora",
					monto_total_centavos: 1_000_000,
					numero_mensualidades: 3,
					primer_vencimiento: "2027-01-15",
					...datos,
				},
			},
			"contaduria",
		);
	}

	it("Una deuda nace con una cuenta por pagar por mensualidad: iguales, una por mes, con el ajuste de centavos en la última", async () => {
		const respuesta = await registrar({ tercero_nuevo: { nombre: "Banco del Bajío de prueba", clase: "banco" } });
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				/^PR-\d{2,} registrada: \$10,000 a Banco del Bajío de prueba, vence el 15 de enero$/,
			),
		});
		const { deuda_id: id } = respuesta.cuerpo.resultado as { deuda_id: string };
		const cuentas = await consultar(
			`SELECT m.numero, m.vence::text AS vence, c.importe_centavos::int AS importe, c.saldo_centavos::int AS saldo,
				c.estado, c.tipo, t.es_acreedor, t.clase
			 FROM deuda_mensualidades m JOIN cuentas_por_pagar c ON c.deuda_mensualidad_id = m.id
			 JOIN terceros t ON t.id = c.tercero_id WHERE m.deuda_id = $1 ORDER BY m.numero`,
			[id],
		);
		const comun = { estado: "por_pagar", tipo: "acreedor", es_acreedor: true, clase: "banco" };
		expect(cuentas).toEqual([
			{ numero: 1, vence: "2027-01-15", importe: 333_333, saldo: 333_333, ...comun },
			{ numero: 2, vence: "2027-02-15", importe: 333_333, saldo: 333_333, ...comun },
			{ numero: 3, vence: "2027-03-15", importe: 333_334, saldo: 333_334, ...comun },
		]);
		const renglones = await consultar(
			"SELECT descripcion FROM bitacora WHERE comando_id = (SELECT comando_id FROM bitacora WHERE entidad_id = $1)",
			[id],
		);
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual([
			expect.stringMatching(/ registró la deuda PR-\d+ con Banco del Bajío de prueba: \$10,000 en 3 mensualidades$/),
			expect.stringMatching(/ dio de alta al tercero Banco del Bajío de prueba \(acreedor\)$/),
		]);
	});

	it("las mensualidades a mano suman el total y vencen una después de otra; con un nombre que ya existe pregunta «¿Es el mismo?»", async () => {
		const desordenadas = await registrar({
			tercero_nuevo: { nombre: "Don Ramiro de prueba", clase: "persona" },
			numero_mensualidades: 2,
			mensualidades: [
				{ numero: 1, vence: "2027-02-01", importe_centavos: 500_000 },
				{ numero: 2, vence: "2027-01-01", importe_centavos: 500_000 },
			],
		});
		expect(desordenadas.cuerpo).toMatchObject({ codigo: "vencimientos_desordenados" });
		const noSuman = await registrar({
			tercero_nuevo: { nombre: "Don Ramiro de prueba", clase: "persona" },
			numero_mensualidades: 2,
			mensualidades: [
				{ numero: 1, vence: "2027-01-01", importe_centavos: 500_000 },
				{ numero: 2, vence: "2027-02-01", importe_centavos: 400_000 },
			],
		});
		expect(noSuman.cuerpo).toMatchObject({
			codigo: "mensualidades_no_suman",
			mensaje: "Las mensualidades suman $9,000 y la deuda es $10,000.",
		});
		expect((await registrar({ tercero_nuevo: { nombre: "Don Ramiro de prueba", clase: "persona" } })).estado).toBe(200);
		const repetido = await registrar({ tercero_nuevo: { nombre: "don  ramiro de prueba", clase: "persona" } });
		expect(repetido.cuerpo).toMatchObject({ codigo: "tercero_ya_existe" });
		const { tercero_id: mismo } = (repetido.cuerpo as { datos: { tercero_id: string } }).datos;
		const ligada = await registrar({
			tercero_nuevo: { nombre: "don  ramiro de prueba", clase: "persona" },
			ligar_a_tercero_id: mismo,
		});
		expect(ligada.estado).toBe(200);
		expect((await registrar({})).cuerpo).toMatchObject({ campos: { tercero_id: "¿A quién le debemos?" } });
		// Una que ya venció avisa sin detener.
		const vencida = await registrar({ tercero_id: mismo, primer_vencimiento: "2026-01-15" });
		expect(vencida.cuerpo.avisos).toEqual(["Ojo: la primera mensualidad ya venció"]);
	});

	it("queda saldada cuando se pagan todas sus mensualidades", async () => {
		const deuda = await deudaDePrueba(servidor, { totalCentavos: 200_000, mensualidades: 2 });
		const [primera, segunda] = deuda.cuentas;
		expect((await pagarCuentaDePrueba(servidor, primera ?? "", 100_000)).estado).toBe(200);
		expect(await consultar("SELECT estado FROM deudas WHERE id = $1", [deuda.id])).toEqual([{ estado: "abierta" }]);
		const ultima = await pagarCuentaDePrueba(servidor, segunda ?? "", 100_000);
		expect(ultima.estado).toBe(200);
		expect(
			await consultar("SELECT estado, saldada_en IS NOT NULL AS con_fecha FROM deudas WHERE id = $1", [deuda.id]),
		).toEqual([{ estado: "saldada", con_fecha: true }]);
		const [renglon] = await consultar("SELECT descripcion, despues FROM bitacora WHERE entidad_id = $1", [
			(ultima.cuerpo.resultado as { pago_id: string }).pago_id,
		]);
		expect(renglon?.descripcion).toMatch(new RegExp(`\\(${deuda.folio} · mensualidad 2 de 2\\)$`));
		expect(renglon?.despues).toMatchObject({ deudas_saldadas: [deuda.folio] });
	});
});
