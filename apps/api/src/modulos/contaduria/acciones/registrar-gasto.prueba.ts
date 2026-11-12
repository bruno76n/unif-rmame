/**
 * Prueba de registrar un gasto: guarda su categoría, dónde se gastó y de dónde salió; «Reparación de máquinas» solo
 * la pone un servicio.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Un gasto guarda su categoría,
 * dónde se gastó y de dónde salió; "Reparación de máquinas" solo la pone un servicio»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { hoyEnMexico, registrarGastoDePrueba, valorDeListaDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un gasto guarda su categoría, dónde se gastó y de dónde salió; «Reparación de máquinas» solo la pone un servicio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Cómo quedó un gasto. */
	async function gasto(id: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT g.folio, c.nombre AS categoria, g.monto_centavos::int AS monto, g.area, u.codigo AS ubicacion, g.medio,
				g.cuenta_fabrica_id IS NOT NULL AS con_cuenta, t.clave AS comprobante, g.origen, g.estado
			 FROM gastos g JOIN lista_valores c ON c.id = g.categoria_id
			 LEFT JOIN ubicaciones u ON u.id = g.ubicacion_id LEFT JOIN lista_valores t ON t.id = g.tipo_comprobante_id
			 WHERE g.id = $1`,
			[id],
		);
		return rows[0];
	}

	it("Un gasto guarda su categoría, dónde se gastó y de dónde salió; sin comprobante queda «Sin comprobante»", async () => {
		const respuesta = await registrarGastoDePrueba(servidor);
		expect(respuesta.cuerpo.resultado).toMatchObject({ mensaje: expect.stringMatching(/^G-\d{4} registrado$/) });
		const { gasto_id: id } = z.object({ gasto_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		expect(await gasto(id)).toMatchObject({
			categoria: "Luz",
			monto: 125_000,
			area: "fabrica",
			ubicacion: null,
			medio: "efectivo",
			con_cuenta: false,
			comprobante: "sin_comprobante",
			origen: "manual",
			estado: "registrado",
		});
		const { rows } = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [id]);
		expect(rows[0]?.descripcion).toMatch(/ registró el gasto G-\d{4}: Luz, \$1,250$/);
		// En una ubicación, desde la cuenta de la fábrica, con su tipo de comprobante.
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const enTaller = await registrarGastoDePrueba(servidor, {
			categoria_id: await valorDeListaDePrueba(servidor, "categorias_gasto", "Paquetería"),
			area: "ubicacion",
			ubicacion_id: ubicacion.TAL,
			medio: "cuenta_fabrica",
			tipo_comprobante_id: await valorDeListaDePrueba(servidor, "tipos_comprobante_gasto", "Nota o ticket"),
		});
		const { gasto_id: otro } = z.object({ gasto_id: z.uuid() }).parse(enTaller.cuerpo.resultado);
		expect(await gasto(otro)).toMatchObject({
			categoria: "Paquetería",
			area: "ubicacion",
			ubicacion: "TAL",
			medio: "cuenta_fabrica",
			con_cuenta: true,
			comprobante: "nota_ticket",
		});
	});

	it("«Reparación de máquinas» solo la pone un servicio; lo demás que se rechaza", async () => {
		expect(
			(
				await registrarGastoDePrueba(servidor, {
					categoria_id: await valorDeListaDePrueba(servidor, "categorias_gasto", "Reparación de máquinas"),
				})
			).cuerpo,
		).toMatchObject({ codigo: "categoria_del_sistema", mensaje: "Esa categoría la pone el sistema." });
		const agua = await valorDeListaDePrueba(servidor, "categorias_gasto", "Agua");
		await servidor.base.dueno.query("UPDATE lista_valores SET baja_en = now(), motivo_baja = 'Prueba' WHERE id = $1", [
			agua,
		]);
		expect((await registrarGastoDePrueba(servidor, { categoria_id: agua })).cuerpo).toMatchObject({
			codigo: "categoria_de_baja",
		});
		expect((await registrarGastoDePrueba(servidor, { area: "ubicacion" })).cuerpo).toMatchObject({
			campos: { ubicacion_id: "Escoge la ubicación" },
		});
		expect((await registrarGastoDePrueba(servidor, { fecha: "2099-01-01" })).cuerpo).toMatchObject({
			campos: { fecha: "La fecha no puede ser futura" },
		});
		expect((await registrarGastoDePrueba(servidor, { monto_centavos: 125_050 })).estado).toBe(400);
		expect((await registrarGastoDePrueba(servidor, { fecha: hoyEnMexico() })).estado).toBe(200);
	});
});
