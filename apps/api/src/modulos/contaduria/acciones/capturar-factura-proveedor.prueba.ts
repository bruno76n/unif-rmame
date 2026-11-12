/**
 * Prueba de capturar la factura de un proveedor: las tres puntas, los precios de la nota y lo que se rechaza.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterios «Las tres puntas» y «Los
 * precios de la nota pasan a Compras antes de comparar»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ordenParaRecibir } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { ordenEnEstado } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import {
	capturarDePrueba,
	facturaComoQuedo,
	facturaDePrueba,
	leerDePrueba,
	recibirOrden,
	valorDeLaOrdenDePrueba,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Las tres puntas y los precios de la nota al capturar la factura de un proveedor", () => {
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

	it("Las tres puntas: sin nada recibido, detenida a cargo de Aduana", async () => {
		const factura = await facturaDePrueba(servidor, { metros: 0, piezas: 0 });
		expect(factura.estado).toBe("detenida");
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "detenida",
			responsable: "aduana",
			motivo: "Ya facturaron y la mercancía no ha llegado a aduana",
			cuenta: "detenida",
			importe: valorDeLaOrdenDePrueba + 127_840,
		});
		const [orden] = await consultar(
			"SELECT sin_recepcion, valor_recibido_centavos::int AS valor FROM factura_proveedor_ordenes WHERE factura_proveedor_id = $1",
			[factura.id],
		);
		expect(orden).toEqual({ sin_recepcion: true, valor: 0 });
	});

	it("Las tres puntas: cobrando más de lo recibido, detenida a cargo de Contaduría", async () => {
		// Llegan 80 de 100 m: lo recibido vale $6,240 + $190 = $6,430 y la factura cobra los $7,990.
		const factura = await facturaDePrueba(servidor, { metros: 80 });
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
			motivo: "La factura dice $7,990 sin IVA y lo recibido suma $6,430",
			valor_recibido: 643_000,
			cuenta: "detenida",
		});
	});

	it("Las tres puntas: si no, conciliada, y una factura parcial no se detiene", async () => {
		const completa = await facturaDePrueba(servidor);
		expect(completa.estado).toBe("conciliada");
		const conciliada = await facturaComoQuedo(servidor, completa.id);
		expect(conciliada).toMatchObject({ cuenta: "por_pagar", valor_recibido: valorDeLaOrdenDePrueba, motivo: null });
		// Una nota parcial: cobra $5,000 de lo recibido.
		const parcial = await facturaDePrueba(servidor, { subtotal: 500_000 });
		expect(parcial.estado).toBe("conciliada");
		// Otra factura de la misma orden: ya solo quedan $2,990 por cubrir, así que $3,000 la detienen y $2,990 no.
		const segunda = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: parcial.orden.id }],
			subtotal_centavos: 300_000,
		});
		expect(segunda.cuerpo.resultado).toMatchObject({ estado: "detenida" });
		const tercera = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: parcial.orden.id }],
			subtotal_centavos: 299_000,
		});
		expect(tercera.cuerpo.resultado).toMatchObject({ estado: "detenida" });
	});

	it("Los precios de la nota pasan a Compras antes de comparar, con un renglón de bitácora por precio, y la comparación es por cantidad", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		// La nota cobra la tela a $82 y no a $78: 100 m valen $8,200 y la factura, con el avío, $8,390.
		const respuesta = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: orden.id }],
			subtotal_centavos: 839_000,
			precios_nota: [{ orden_compra_linea_id: orden.lineaTela, precio_centavos: 8_200 }],
		});
		expect(respuesta.estado).toBe(200);
		const resultado = respuesta.cuerpo.resultado as { mensaje: string; factura_proveedor_id: string };
		expect(resultado.mensaje).toMatch(/^FP-\d{4} conciliada con la orden y la recepción\. Precio nuevo: .+ a \$82$/);
		// Sube 5 %: menos que el umbral, no avisa.
		expect(respuesta.cuerpo.avisos ?? []).toEqual([]);
		expect(
			await consultar("SELECT precio_nota_centavos::int AS p FROM orden_compra_lineas WHERE id = $1", [
				orden.lineaTela,
			]),
		).toEqual([{ p: 8_200 }]);
		const renglones = await consultar(
			"SELECT descripcion, comando_id FROM bitacora WHERE entidad_id IN ($1, $2) ORDER BY ocurrido_en, id",
			[resultado.factura_proveedor_id, orden.lineaTela],
		);
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual([
			expect.stringMatching(/ capturó la factura FP-\d{4} de /),
			expect.stringMatching(/^Precio de .+ con .+: \$78 → \$82 \(OC-\d{4}, según la nota\)$/),
		]);
		expect(new Set(renglones.map((renglon) => renglon.comando_id)).size).toBe(1);
		// Un precio que sube 15 % o más avisa, sin detener.
		const otra = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, otra);
		const conAviso = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: otra.id }],
			subtotal_centavos: 919_000,
			precios_nota: [{ orden_compra_linea_id: otra.lineaTela, precio_centavos: 9_000 }],
		});
		expect(conAviso.cuerpo.resultado).toMatchObject({ estado: "conciliada" });
		expect(conAviso.cuerpo.avisos).toEqual([expect.stringMatching(/: sube 15 % · antes \$78$/)]);
	});

	it("con varias órdenes, lo de cada una suma el subtotal, del mismo proveedor; vence con los días menores", async () => {
		const una = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, una);
		const otra = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, otra);
		const deOtro = await capturarDePrueba(servidor, {
			ordenes: [
				{ orden_compra_id: una.id, importe_sin_iva_centavos: 500_000 },
				{ orden_compra_id: otra.id, importe_sin_iva_centavos: 500_000 },
			],
			subtotal_centavos: 1_000_000,
		});
		expect(deOtro.cuerpo).toMatchObject({ codigo: "ordenes_de_otro_proveedor" });
		// Las dos del mismo proveedor: se pone la segunda a su nombre, con 10 días de crédito.
		await consultar(
			"UPDATE ordenes_compra SET proveedor_id = (SELECT proveedor_id FROM ordenes_compra WHERE id = $1), dias_credito = 10 WHERE id = $2",
			[una.id, otra.id],
		);
		const noSuman = await capturarDePrueba(servidor, {
			ordenes: [
				{ orden_compra_id: una.id, importe_sin_iva_centavos: 500_000 },
				{ orden_compra_id: otra.id, importe_sin_iva_centavos: 400_000 },
			],
			subtotal_centavos: 1_000_000,
		});
		expect(noSuman.cuerpo).toMatchObject({
			codigo: "importes_no_suman",
			mensaje: "Lo de cada orden suma $9,000 y el subtotal es $10,000.",
		});
		const junta = await capturarDePrueba(servidor, {
			ordenes: [
				{ orden_compra_id: una.id, importe_sin_iva_centavos: 500_000 },
				{ orden_compra_id: otra.id, importe_sin_iva_centavos: 500_000 },
			],
			subtotal_centavos: 1_000_000,
			fecha_factura: "2026-11-01",
		});
		const { factura_proveedor_id: id } = junta.cuerpo.resultado as { factura_proveedor_id: string };
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({ estado: "conciliada", vence: "2026-11-11" });
	});

	it("lo que se rechaza: total que no suma, folio repetido, UUID repetido, orden en borrador, línea de otra orden y fecha futura", async () => {
		const factura = await facturaDePrueba(servidor);
		const orden = factura.orden;
		const base = { ordenes: [{ orden_compra_id: orden.id }], subtotal_centavos: 100_000 };
		expect((await capturarDePrueba(servidor, { ...base, total_centavos: 1 })).cuerpo).toMatchObject({
			codigo: "total_no_suma",
		});
		const [{ folio_proveedor: folio }] = (await consultar(
			"SELECT folio_proveedor FROM facturas_proveedor WHERE id = $1",
			[factura.id],
		)) as [{ folio_proveedor: string }];
		expect((await capturarDePrueba(servidor, { ...base, folio_proveedor: folio.toLowerCase() })).cuerpo).toMatchObject({
			codigo: "folio_repetido",
			mensaje: expect.stringMatching(new RegExp(`ya tiene la factura ${folio}: es ${factura.folio}\\.$`)),
		});
		const uuid = uuidv7();
		expect((await capturarDePrueba(servidor, { ...base, uuid_cfdi: uuid })).estado).toBe(200);
		expect((await capturarDePrueba(servidor, { ...base, uuid_cfdi: uuid })).cuerpo).toMatchObject({
			codigo: "uuid_repetido",
		});
		const otra = await ordenParaRecibir(servidor);
		expect(
			(
				await capturarDePrueba(servidor, {
					...base,
					precios_nota: [{ orden_compra_linea_id: otra.lineaTela, precio_centavos: 100 }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "linea_de_otra_orden" });
		await ordenEnEstado(servidor, otra.id, "cancelada");
		expect(
			(await capturarDePrueba(servidor, { ordenes: [{ orden_compra_id: otra.id }], subtotal_centavos: 100 })).cuerpo,
		).toMatchObject({
			codigo: "orden_no_facturable",
			mensaje: `${otra.folio} está en borrador o cancelada: no se le captura factura.`,
		});
		expect((await capturarDePrueba(servidor, { ...base, fecha_factura: "2099-01-01" })).cuerpo).toMatchObject({
			campos: { fecha_factura: "La fecha de la factura no puede ser futura" },
		});
		// Aduana no captura facturas.
		expect((await capturarDePrueba(servidor, base, "aduana")).estado).toBe(403);
	});

	it("`contaduria.facturacion_de_orden` dice a Compras, sin montos, las facturas de cada orden y si quedaron pagadas", async () => {
		const factura = await facturaDePrueba(servidor);
		const sinFactura = await ordenParaRecibir(servidor);
		expect(
			await leerDePrueba(servidor, "contaduria.facturacion_de_orden", {
				orden_compra_ids: [factura.orden.id, sinFactura.id],
			}),
		).toEqual({
			ordenes: {
				[factura.orden.id]: [
					{ factura_proveedor_id: factura.id, folio: factura.folio, estado: "conciliada", pagada: false },
				],
				[sinFactura.id]: [],
			},
		});
	});
});
