/**
 * Prueba de `linea.confirmar_pago`: el pago de un W- esperando el pago lo deja por surtir con su promesa y sin
 * vencimiento; un comando repetido y un W- ya pagado contestan lo mismo; la misma referencia no entra a dos W-; el pago
 * tardío vuelve a apartar o abre `pago_despues_de_vencer`; uno cancelado guarda el pago y abre su excepción; un monto
 * distinto del total abre `totales_no_cuadran`.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterios «La misma referencia de pago no entra a
 * dos W-, y un comando repetido contesta lo mismo» y «el pago tardío vuelve a apartar o abre
 * `pago_despues_de_vencer`»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llamarInterna, meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaComoQuedo,
	pedidoLineaDePrueba,
	prendaEnLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { conGoogle, mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El pago confirma un W-; la misma referencia no entra a dos W- y un comando repetido contesta lo mismo", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'linea.acepta_pago_pendiente'",
		);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un W- con pago pendiente de una prenda (con `piezas` en Bodega). */
	async function pendiente(piezas = 1) {
		const [cuatro = ""] = await prendaEnLinea(servidor);
		if (piezas > 0) await meterPiezas(servidor, ubicacion.BOD ?? "", cuatro, piezas);
		const pedido = pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }], {
			pago: { estado: "pendiente", pagado_en: undefined, metodo: "oxxo" },
		});
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return { pedido, variante: cuatro, folio: (respuesta.cuerpo.resultado as { folio: string }).folio };
	}

	/** El pago de un W-, como lo manda el sitio. */
	function pagoDe(pedido: { id: string; total_centavos?: unknown }, cambios: Record<string, unknown> = {}) {
		return {
			pedido_linea_id: pedido.id,
			pasarela: "mercado_pago",
			referencia: `OXXO-${pedido.id.slice(-10)}`,
			monto_centavos: pedido.total_centavos,
			pagado_en: new Date().toISOString(),
			...cambios,
		};
	}

	/** Las excepciones abiertas de un W-. */
	async function excepcionesDe(id: string) {
		const filas = await consultar(
			"SELECT tipo FROM excepciones WHERE documento_id = $1 AND estado = 'por_revisar' ORDER BY tipo",
			[id],
		);
		return filas.map((fila) => fila.tipo);
	}

	it("esperando el pago pasa a por surtir con su promesa y sin vencimiento; el mismo comando y otro pago contestan lo mismo", async () => {
		const { pedido } = await pendiente();
		const clave = nuevaClave();
		const pago = pagoDe(pedido);
		const primera = await comoElSitio(servidor, "linea.confirmar_pago", pago, clave);
		expect(primera.cuerpo.resultado).toMatchObject({ estado: "por_surtir", promesa: "sale_hoy" });
		expect(await comoElSitio(servidor, "linea.confirmar_pago", pago, clave)).toEqual(primera);
		// Otra confirmación del mismo W- ya pagado contesta lo mismo, sin otro pago.
		const otra = await comoElSitio(servidor, "linea.confirmar_pago", pagoDe(pedido, { referencia: "OTRA-1" }));
		expect(otra.cuerpo.resultado, JSON.stringify(otra.cuerpo)).toMatchObject({
			estado: "por_surtir",
			promesa: "sale_hoy",
		});
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			pago_estado: "pagado",
			promesa: "sale_hoy",
			reservas: [{ ubicacion: "BOD", piezas: 1, vence: false }],
		});
		const [guardado] = await consultar("SELECT pago_referencia FROM pedidos_linea WHERE id = $1", [pedido.id]);
		expect(guardado?.pago_referencia).toBe(`OXXO-${pedido.id.slice(-10)}`);
	});

	it("La misma referencia de pago no entra a dos W-; un W- que no existe responde 404", async () => {
		const { pedido, folio } = await pendiente();
		await comoElSitio(servidor, "linea.confirmar_pago", pagoDe(pedido));
		const { pedido: otro } = await pendiente();
		expect(
			(
				await comoElSitio(
					servidor,
					"linea.confirmar_pago",
					pagoDe(otro, { referencia: `OXXO-${pedido.id.slice(-10)}` }),
				)
			).cuerpo,
		).toMatchObject({ codigo: "pago_repetido", mensaje: `Ese pago ya está en ${folio}.` });
		const noExiste = await comoElSitio(
			servidor,
			"linea.confirmar_pago",
			pagoDe({ id: "01936f2e-0000-7000-8000-00000000beef", total_centavos: 100 }),
		);
		expect(noExiste.estado).toBe(404);
	});

	it("el pago tardío de un W- vencido vuelve a apartar; sin pieza, abre pago_despues_de_vencer", async () => {
		for (const piezas of [1, 0]) {
			const { pedido, variante } = await pendiente(1);
			// Venció: sus reservas se liberaron y el W- quedó vencido.
			await consultar(
				"UPDATE reservas SET estado = 'liberada', motivo_fin = 'vencio_pago', terminada_en = now() WHERE pedido_linea_id = $1",
				[pedido.id],
			);
			await consultar("UPDATE pedidos_linea SET estado = 'vencido', pago_estado = 'vencido' WHERE id = $1", [
				pedido.id,
			]);
			// Sin pieza: otro W- apartó la que quedó libre mientras tanto.
			if (piezas === 0) {
				await llamarInterna(servidor, "inventario.reservar", {
					motivo: "pedido_linea",
					pedido_linea_id: await pedidoLineaDePrueba(servidor, "por_surtir"),
					renglones: [{ variante_id: variante, piezas: 1 }],
				});
			}
			const respuesta = await comoElSitio(servidor, "linea.confirmar_pago", pagoDe(pedido));
			expect(respuesta.cuerpo.resultado).toMatchObject({ estado: "por_surtir" });
			expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
				pago_estado: "pagado",
				reservas: [{ ubicacion: "BOD", piezas: 1, vence: false }],
			});
			expect(await excepcionesDe(pedido.id)).toEqual(piezas === 0 ? ["pago_despues_de_vencer"] : []);
		}
	});

	it("a un W- cancelado se le guarda el pago y abre pago_de_pedido_cancelado; un monto distinto abre totales_no_cuadran", async () => {
		const { pedido } = await pendiente();
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM pedidos_linea WHERE id = $1", [
			pedido.id,
		]);
		const cancelado = await mandarAccion(
			servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: pedido.id, motivo: "La clienta ya no lo quiere" }, version: v },
			"linea",
			conGoogle(),
		);
		expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
		const respuesta = await comoElSitio(servidor, "linea.confirmar_pago", pagoDe(pedido, { monto_centavos: 1 }));
		expect(respuesta.cuerpo.resultado).toMatchObject({ estado: "cancelado" });
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ pago_estado: "pagado", reservas: [] });
		expect(await excepcionesDe(pedido.id)).toEqual(["pago_de_pedido_cancelado", "totales_no_cuadran"]);
	});
});
