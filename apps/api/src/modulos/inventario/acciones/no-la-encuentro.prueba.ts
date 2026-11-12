/**
 * Prueba de `inventario.no_la_encuentro`: la pieza apartada para un pedido externo que Bodega no encuentra abre su DF-
 * por contar y su reserva se libera; una que ya no está apartada no. La de un W- se vuelve a apartar y dice de dónde se
 * surte, o que queda sin pieza; con todo ya en Aduana, el W- queda listo para empacar.
 * Fase 16 · docs/fases/16-ventas-a-externos.md (parte 4)
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «"No la encuentro" con un W- abre su DF- y
 * reasigna la reserva, o la deja sin pieza con su excepción»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaComoQuedo,
	pedidoLineaEnBodega,
	prendaEnLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("«No la encuentro» abre la DF- por contar y la pieza vuelve a lo que falta mandar del pedido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la DF- nace por contar en Bodega con lo que decía el sistema; la reserva se libera; otra vez, `reserva_no_activa`", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = await pedidoDePrueba(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		const reserva = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
			 VALUES ($1, $2, $3, 2, 'pedido_externo', $4, 'activa')`,
			[reserva, ubicacion.BOD, variante, pedido],
		);
		const buscar = () =>
			mandarAccion(
				servidor,
				"inventario.no_la_encuentro",
				{ datos: { reserva_id: reserva, nota: "No está en su anaquel" } },
				"bodega",
			);
		const respuesta = await buscar();
		const { rows: folio } = await servidor.base.dueno.query("SELECT folio FROM pedidos WHERE id = $1", [pedido]);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^DF-\\d+: .+ talla .+ queda en diferencias\\. Vuelve a lo que falta mandar de ${folio[0]?.folio}$`),
			),
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT d.origen, d.estado, d.piezas, d.sistema_decia, u.codigo FROM diferencias d
			 JOIN ubicaciones u ON u.id = d.ubicacion_id WHERE d.variante_id = $1`,
			[variante],
		);
		expect(rows).toEqual([
			{ origen: "no_la_encontro", estado: "por_contar", piezas: -2, sistema_decia: 5, codigo: "BOD" },
		]);
		const { rows: suya } = await servidor.base.dueno.query(
			"SELECT estado, motivo_fin, nota_fin FROM reservas WHERE id = $1",
			[reserva],
		);
		expect(suya).toEqual([{ estado: "liberada", motivo_fin: "no_la_encontro", nota_fin: "No está en su anaquel" }]);
		expect((await buscar()).cuerpo).toMatchObject({
			codigo: "reserva_no_activa",
			mensaje: "Esa pieza ya no está apartada aquí.",
		});
	});

	it("con una pieza de un W-: la DF- nace igual y la reserva pasa a otra ubicación con libres, o se queda con su excepción (fase 18)", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		for (const otraPieza of [true, false]) {
			const pedido = await pedidoLineaEnBodega(servidor);
			// Hay otra pieza en Aduana, con destino a Bodega, para tomarla.
			if (otraPieza) {
				await nuevoTraspaso(servidor, {
					tipo: "lote_temporada",
					estado: "en_aduana",
					origen: { ubicacionId: ubicacion.TAL ?? "" },
					destino: { ubicacionId: ubicacion.BOD ?? "" },
					renglones: [{ varianteId: pedido.variante, piezas: 1 }],
				});
				await meterPiezas(servidor, ubicacion.ADU ?? "", pedido.variante, 1);
			}
			const { rows } = await servidor.base.dueno.query(
				"SELECT id FROM reservas WHERE pedido_linea_id = $1 AND estado = 'activa'",
				[pedido.id],
			);
			const respuesta = await mandarAccion(
				servidor,
				"inventario.no_la_encuentro",
				{ datos: { reserva_id: rows[0]?.id } },
				"bodega",
			);
			const { rows: aduana } = await servidor.base.dueno.query("SELECT nombre FROM ubicaciones WHERE codigo = 'ADU'");
			const comoQueda = otraPieza ? `se surte de ${aduana[0]?.nombre}` : "queda sin pieza";
			expect(respuesta.cuerpo.resultado).toMatchObject({
				mensaje: expect.stringMatching(new RegExp(`queda en diferencias\\. ${pedido.folio} ${comoQueda}$`)),
			});
			// Con su única prenda ya en Aduana, no queda nada que surtir: listo para empacar.
			expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
				estado: otraPieza ? "listo_para_empacar" : "por_surtir",
				reservas: [{ ubicacion: otraPieza ? "ADU" : "BOD", piezas: 1 }],
			});
			const { rows: excepciones } = await servidor.base.dueno.query(
				"SELECT tipo FROM excepciones WHERE documento_id = $1 AND estado = 'por_revisar'",
				[pedido.id],
			);
			expect(excepciones).toEqual(otraPieza ? [] : [{ tipo: "pedido_linea_sin_pieza" }]);
		}
	});

	it("con una pieza de un W- que espera su pago, la reserva nueva vence cuando vencía la que no se encontró", async () => {
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'linea.acepta_pago_pendiente'",
		);
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const [variante = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 1);
		const pedido = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }], {
			pago: { estado: "pendiente", pagado_en: undefined, metodo: "oxxo" },
		});
		expect((await comoElSitio(servidor, "linea.recibir_pedido", pedido)).estado).toBe(200);
		const { rows: antes } = await servidor.base.dueno.query(
			"SELECT id, vence_en FROM reservas WHERE pedido_linea_id = $1 AND estado = 'activa'",
			[pedido.id],
		);
		const respuesta = await mandarAccion(
			servidor,
			"inventario.no_la_encuentro",
			{ datos: { reserva_id: antes[0]?.id } },
			"bodega",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { rows: despues } = await servidor.base.dueno.query(
			"SELECT vence_en FROM reservas WHERE pedido_linea_id = $1 AND estado = 'activa'",
			[pedido.id],
		);
		expect(despues).toEqual([{ vence_en: antes[0]?.vence_en }]);
		expect(antes[0]?.vence_en).not.toBeNull();
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "esperando_pago" });
	});
});
