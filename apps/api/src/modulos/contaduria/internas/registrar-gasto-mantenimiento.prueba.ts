/**
 * Prueba de `contaduria.registrar_gasto_mantenimiento`: un servicio con costo deja su gasto con la categoría y la
 * ubicación de sus parámetros, sin decir de dónde salió, y lo guarda en el servicio; uno sin costo no lleva gasto.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «"Reparación de máquinas" solo la
 * pone un servicio»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { servicioConCostoDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un servicio con costo deja su gasto de «Reparación de máquinas» en el Taller", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("«Reparación de máquinas» solo la pone un servicio: con su máquina, en el Taller, sin medio, ligado al servicio y con su renglón", async () => {
		const servicio = await servicioConCostoDePrueba(servidor, 45_050);
		const { rows } = await servidor.base.dueno.query(
			`SELECT g.folio, c.nombre AS categoria, g.monto_centavos::int AS monto, u.codigo AS ubicacion, g.medio, g.origen,
				g.maquina_id = $2 AS de_su_maquina, s.gasto_id = g.id AS ligado
			 FROM gastos g JOIN lista_valores c ON c.id = g.categoria_id JOIN ubicaciones u ON u.id = g.ubicacion_id
			 JOIN servicios s ON s.id = g.servicio_id WHERE g.servicio_id = $1`,
			[servicio.servicioId, servicio.maquina.id],
		);
		expect(rows).toEqual([
			{
				folio: expect.stringMatching(/^G-\d{4}$/),
				categoria: "Reparación de máquinas",
				monto: 45_050,
				ubicacion: "TAL",
				medio: null,
				origen: "mantenimiento",
				de_su_maquina: true,
				ligado: true,
			},
		]);
		const { rows: renglones } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE comando_id = (SELECT comando_id FROM bitacora WHERE entidad_id = $1 LIMIT 1) ORDER BY ocurrido_en, id",
			[servicio.servicioId],
		);
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual([
			`Registró el servicio ${servicio.folio} a ${servicio.maquina.nombre}`,
			`Registró el gasto ${rows[0]?.folio}: Reparación de máquinas, $450.50 (${servicio.maquina.nombre}, ${servicio.folio})`,
		]);
	});

	it("un servicio sin costo no lleva gasto", async () => {
		const servicio = await servicioConCostoDePrueba(servidor, 0);
		const { rows } = await servidor.base.dueno.query(
			"SELECT s.gasto_id, (SELECT count(*)::int FROM gastos g WHERE g.servicio_id = s.id) AS gastos FROM servicios s WHERE s.id = $1",
			[servicio.servicioId],
		);
		expect(rows).toEqual([{ gasto_id: null, gastos: 0 }]);
	});
});
