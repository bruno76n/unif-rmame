/**
 * Prueba de `compras.ordenes_por_recibir` y `compras.precio_vigente_lineas`: Aduana ve las enviadas y las recibidas
 * en parte, sin precios, con lo que falta, cuándo se espera y si están atrasadas; el precio vigente de una línea es
 * el de la nota, si cobró otro.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { ordenDePrueba, ordenEnEstado } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Aduana ve lo que falta de cada orden por recibir, sin precios, con cuándo se espera y si está atrasada", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee una lectura de Compras como lo haría Inventario. */
	function leer(nombre: string, datos: Record<string, unknown>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura(`compras.${nombre}`, datos),
		);
	}

	/** Pone la fecha prometida de una orden a tantos días de hoy y regresa ese día. */
	async function prometida(ordenId: string, dias: number): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			`UPDATE ordenes_compra SET fecha_prometida = (now() AT TIME ZONE 'America/Mexico_City')::date + $2::int
			 WHERE id = $1 RETURNING fecha_prometida::text AS dia`,
			[ordenId, dias],
		);
		return String(rows[0]?.dia);
	}

	/** Hoy más unos días, en hora de México. */
	async function hoyMas(dias: number): Promise<string> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT ((now() AT TIME ZONE 'America/Mexico_City')::date + $1::int)::text AS dia",
			[dias],
		);
		return String(rows[0]?.dia);
	}

	const deLaLectura = z.object({ ordenes: z.array(z.object({ folio: z.string() }).passthrough()) });

	it("las enviadas y recibidas en parte, sin precios; la atrasada se espera hoy más los días de espera; el borrador no viene", async () => {
		const atrasada = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, atrasada.id, "enviada");
		await prometida(atrasada.id, -5);
		const aTiempo = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, aTiempo.id, "recibida_en_parte");
		const dia = await prometida(aTiempo.id, 4);
		const borrador = await ordenDePrueba(servidor);
		const { ordenes } = deLaLectura.parse(await leer("ordenes_por_recibir", {}));
		const mias = ordenes.filter((orden) => [atrasada.folio, aTiempo.folio, borrador.folio].includes(orden.folio));
		expect(mias).toEqual([
			{
				orden_compra_id: atrasada.id,
				folio: atrasada.folio,
				proveedor_id: atrasada.proveedor,
				proveedor: expect.any(String),
				estado: "enviada",
				se_puede_recibir: true,
				llegada_esperada: await hoyMas(3),
				atrasada: true,
				dias_atraso: 5,
				lineas: [
					{
						orden_compra_linea_id: expect.any(String),
						material_id: atrasada.material,
						material: expect.stringMatching(/^Botón /),
						unidad: "pza",
						tipo: "avio",
						se_cuenta_entera: true,
						pedido: "100.000",
						falta: "100.000",
					},
				],
			},
			expect.objectContaining({
				folio: aTiempo.folio,
				estado: "recibida_en_parte",
				llegada_esperada: dia,
				atrasada: false,
				dias_atraso: 0,
			}),
		]);
		// Nada de precios en lo que ve Aduana.
		expect(JSON.stringify(mias)).not.toMatch(/precio|centavos/);
		// Pedida por id, una que no se puede recibir viene marcada así.
		const { ordenes: porId } = deLaLectura.parse(
			await leer("ordenes_por_recibir", { orden_compra_ids: [borrador.id] }),
		);
		expect(porId).toMatchObject([
			{ folio: borrador.folio, estado: "borrador", se_puede_recibir: false, atrasada: false },
		]);
	});

	it("el precio vigente de una línea es el de la orden, o el de la nota si cobró otro", async () => {
		const orden = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, orden.id, "enviada");
		const { rows } = await servidor.base.dueno.query("SELECT id FROM orden_compra_lineas WHERE orden_compra_id = $1", [
			orden.id,
		]);
		const linea = String(rows[0]?.id);
		expect(await leer("precio_vigente_lineas", { orden_compra_linea_ids: [linea] })).toEqual({ [linea]: 38 });
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("compras.registrar_precios_nota", {
				orden_compra_id: orden.id,
				lineas: [{ orden_compra_linea_id: linea, precio_centavos: 41 }],
			}),
		);
		expect(await leer("precio_vigente_lineas", { orden_compra_linea_ids: [linea] })).toEqual({ [linea]: 41 });
	});
});
