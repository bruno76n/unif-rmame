/**
 * Prueba de `linea.recibir_pedido`: un W- pagado nunca se rechaza. Con pieza se aparta y promete; sin pieza se aparta
 * en Bodega con su excepción; con totales que no cuadran o una prenda que no se vende en línea, se guarda y abre la
 * suya. La misma referencia de pago no entra a dos W-, y el mismo comando contesta lo mismo.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterios «Un W- pagado nunca se rechaza» y «La
 * misma referencia de pago no entra a dos W-, y un comando repetido contesta lo mismo»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaComoQuedo,
	prendaEnLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion, nuevaClave } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un W- pagado nunca se rechaza; la misma referencia de pago no entra a dos W-", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Las excepciones abiertas de un W-. */
	async function excepcionesDe(id: string) {
		const filas = await consultar(
			"SELECT tipo, area FROM excepciones WHERE documento_id = $1 AND estado = 'por_revisar' ORDER BY tipo",
			[id],
		);
		return filas.map((fila) => `${fila.tipo}:${fila.area}`);
	}

	it("Un W- pagado con pieza en Bodega queda por surtir, sale hoy, con lo congelado y su bitácora del sitio", async () => {
		const [cuatro = "", seis = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", cuatro, 2);
		await meterPiezas(servidor, ubicacion.BOD ?? "", seis, 1);
		const pedido = pedidoDelSitio([
			{ variante_id: cuatro, cantidad: 2, descuento_centavos: 2_000 },
			{ variante_id: seis, cantidad: 1 },
		]);
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			pedido_linea_id: pedido.id,
			folio: expect.stringMatching(/^W-\d{4}$/),
			estado: "por_surtir",
			promesa: "sale_hoy",
		});
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			estado: "por_surtir",
			promesa: "sale_hoy",
			pago_estado: "pagado",
			reservas: [
				{ ubicacion: "BOD", piezas: 1, vence: false },
				{ ubicacion: "BOD", piezas: 2, vence: false },
			],
		});
		expect(
			await consultar(
				`SELECT renglon, producto_nombre <> '' AS con_nombre, talla, cantidad, importe_centavos::int AS importe
				 FROM pedido_linea_renglones WHERE pedido_linea_id = $1 ORDER BY renglon`,
				[pedido.id],
			),
		).toEqual([
			{ renglon: 1, con_nombre: true, talla: "4", cantidad: 2, importe: 48_000 },
			{ renglon: 2, con_nombre: true, talla: "6", cantidad: 1, importe: 25_000 },
		]);
		expect(await excepcionesDe(pedido.id)).toEqual([]);
		const [renglon] = await consultar(
			"SELECT descripcion, origen, despues ? 'pago_respuesta' AS con_respuesta FROM bitacora WHERE entidad_id = $1",
			[pedido.id],
		);
		expect(renglon).toEqual({
			descripcion: expect.stringMatching(/^Llegó W-\d{4} de Laura Méndez: 3 prendas, por surtir$/),
			origen: "servidor_linea",
			con_respuesta: false,
		});
		const eventos = await consultar("SELECT tipo FROM eventos WHERE entidad_id = $1", [pedido.id]);
		expect(eventos.map((evento) => evento.tipo)).toContain("pedido_linea.recibido");
	});

	it("Sin pieza en ningún lado se aparta igual en Bodega, en negativo, con su excepción; el W- entra", async () => {
		const [cuatro = ""] = await prendaEnLinea(servidor);
		const pedido = pedidoDelSitio([{ variante_id: cuatro, cantidad: 3 }]);
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado).toBe(200);
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			estado: "por_surtir",
			reservas: [{ ubicacion: "BOD", piezas: 3 }],
		});
		expect(await excepcionesDe(pedido.id)).toEqual(["pedido_linea_sin_pieza:bodega"]);
	});

	it("Con totales que no cuadran o una prenda que no se vende en línea, se guarda como llegó y abre la suya", async () => {
		const [enLinea = ""] = await prendaEnLinea(servidor);
		const [soloMostrador = ""] = await prendaEnLinea(servidor, false);
		await meterPiezas(servidor, ubicacion.BOD ?? "", enLinea, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", soloMostrador, 1);
		const pedido = pedidoDelSitio(
			[
				{ variante_id: enLinea, cantidad: 1 },
				{ variante_id: soloMostrador, cantidad: 1 },
			],
			{ subtotal_centavos: 40_000 },
		);
		const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(await excepcionesDe(pedido.id)).toEqual([
			"totales_no_cuadran:contaduria",
			"variante_sin_canal_linea:bodega",
		]);
		const [totales] = await consultar("SELECT descripcion FROM excepciones WHERE documento_id = $1 AND tipo = $2", [
			pedido.id,
			"totales_no_cuadran",
		]);
		expect(totales?.descripcion).toMatch(/el subtotal dice \$400 y sus renglones suman \$500/);
		expect(await consultar("SELECT subtotal_centavos::int AS s FROM pedidos_linea WHERE id = $1", [pedido.id])).toEqual(
			[{ s: 40_000 }],
		);
	});

	it("La misma referencia de pago no entra a dos W-, y el mismo comando contesta lo mismo sin otro W-", async () => {
		const [cuatro = ""] = await prendaEnLinea(servidor);
		const pedido = pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }]);
		const clave = nuevaClave();
		const primera = await comoElSitio(servidor, "linea.recibir_pedido", pedido, clave);
		const otraVez = await comoElSitio(servidor, "linea.recibir_pedido", pedido, clave);
		expect(otraVez).toEqual(primera);
		const { folio } = primera.cuerpo.resultado as { folio: string };
		const otro = pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }], {
			pago: pedido.pago as Record<string, unknown>,
		});
		expect((await comoElSitio(servidor, "linea.recibir_pedido", otro)).cuerpo).toMatchObject({
			codigo: "pago_repetido",
			mensaje: `Ese pago ya está en ${folio}.`,
		});
		// El mismo W- con otra clave tampoco entra dos veces.
		expect((await comoElSitio(servidor, "linea.recibir_pedido", pedido)).cuerpo).toMatchObject({
			codigo: "pago_repetido",
		});
		expect(await consultar("SELECT count(*)::int AS n FROM pedidos_linea WHERE id = $1", [pedido.id])).toEqual([
			{ n: 1 },
		]);
	});

	it("Con pago pendiente: apagado, 422; prendido, espera el pago con reservas que vencen y sin promesa", async () => {
		const [cuatro = ""] = await prendaEnLinea(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", cuatro, 1);
		const pendiente = { pago: { estado: "pendiente", pagado_en: undefined, metodo: "oxxo" } };
		const apagado = await comoElSitio(
			servidor,
			"linea.recibir_pedido",
			pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }], pendiente),
		);
		expect(apagado.cuerpo).toMatchObject({
			codigo: "pago_pendiente_apagado",
			mensaje: "La tienda en línea no acepta pago pendiente.",
		});
		await consultar("UPDATE parametros SET valor_booleano = true WHERE clave = 'linea.acepta_pago_pendiente'", []);
		try {
			const pedido = pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }], pendiente);
			const respuesta = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
			expect(respuesta.cuerpo.resultado).toMatchObject({ estado: "esperando_pago", promesa: null });
			expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
				pago_estado: "pendiente",
				reservas: [{ ubicacion: "BOD", piezas: 1, vence: true }],
			});
		} finally {
			await consultar("UPDATE parametros SET valor_booleano = false WHERE clave = 'linea.acepta_pago_pendiente'", []);
		}
	});

	it("Una variante que no existe o un dato que falta: 400; solo la credencial del sitio lo manda", async () => {
		const sinVariante = pedidoDelSitio([{ variante_id: "01936f2e-0000-7000-8000-00000000dead", cantidad: 1 }]);
		expect((await comoElSitio(servidor, "linea.recibir_pedido", sinVariante)).estado).toBe(400);
		const [cuatro = ""] = await prendaEnLinea(servidor);
		const sinCliente = { ...pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }]), cliente: undefined };
		expect((await comoElSitio(servidor, "linea.recibir_pedido", sinCliente)).estado).toBe(400);
		const desdeLaWeb = await mandarAccion(
			servidor,
			"linea.recibir_pedido",
			{ datos: pedidoDelSitio([{ variante_id: cuatro, cantidad: 1 }]) },
			"duena",
		);
		expect(desdeLaWeb.cuerpo).toMatchObject({ codigo: "fuera_de_alcance" });
	});
});
