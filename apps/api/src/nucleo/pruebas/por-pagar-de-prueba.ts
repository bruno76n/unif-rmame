/**
 * Las ayudas de las pruebas de lo que la fábrica debe: una orden enviada que Aduana recibe completa o en parte,
 * capturar su factura, la versión de una factura o una cuenta por pagar, cómo quedaron y pagarlas.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md («Cómo se construye»: las pruebas usan
 * las órdenes y las recepciones reales)
 *
 * La orden de `ordenParaRecibir` lleva 100 m de una tela a $78 y 500 piezas de un avío a $0.38: recibida completa
 * vale $7,990 (799,000 centavos).
 */

import { z } from "zod";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import { type OrdenParaRecibir, ordenParaRecibir, recibirDePrueba } from "./aduana-de-prueba.ts";
import { conGoogle, mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Lo que vale la orden de prueba recibida completa, sin IVA. */
export const valorDeLaOrdenDePrueba = 799_000;

/** El IVA de un subtotal, al 16 %. */
export function ivaDe(subtotal: number): number {
	return Math.round(subtotal * 0.16);
}

/**
 * Aduana recibe la orden de prueba: los metros de la tela en un rollo y las piezas del avío.
 * @param servidor El servidor de prueba.
 * @param orden La orden.
 * @param metros Los metros que llegan; 0 para no recibir tela.
 * @param piezas Las piezas del avío que llegan; 0 para no recibirlo.
 */
export async function recibirOrden(servidor: ServidorDePrueba, orden: OrdenParaRecibir, metros = 100, piezas = 500) {
	const respuesta = await recibirDePrueba(
		servidor,
		orden,
		metros === 0 ? [] : [{ metros: String(metros), partida: "A" }],
		piezas === 0 ? undefined : piezas,
	);
	if (respuesta.estado !== 200) throw new Error(`no se recibió ${orden.folio}: ${JSON.stringify(respuesta.cuerpo)}`);
	return z.object({ mensaje: z.string() }).passthrough().parse(respuesta.cuerpo.resultado);
}

/** Lo que se captura de una factura; lo demás lo pone `capturarDePrueba`. */
export interface FacturaACapturar {
	ordenes: { orden_compra_id: string; importe_sin_iva_centavos?: number }[];
	subtotal_centavos: number;
	folio_proveedor?: string;
	iva_centavos?: number;
	total_centavos?: number;
	fecha_factura?: string;
	uuid_cfdi?: string;
	precios_nota?: { orden_compra_linea_id: string; precio_centavos: number }[];
}

/** El folio del proveedor de cada factura de prueba: uno nuevo cada vez. */
let folioDeProveedor = 0;

/**
 * Contaduría captura una factura: el IVA es el 16 % del subtotal y el total, su suma, si no se dicen.
 * @param servidor El servidor de prueba.
 * @param factura Lo que se captura.
 * @param quien Quién la captura.
 */
export function capturarDePrueba(servidor: ServidorDePrueba, factura: FacturaACapturar, quien = "contaduria") {
	folioDeProveedor += 1;
	const iva = factura.iva_centavos ?? ivaDe(factura.subtotal_centavos);
	return mandarAccion(
		servidor,
		"contaduria.capturar_factura_proveedor",
		{
			datos: {
				folio_proveedor: `A-${folioDeProveedor}`,
				iva_centavos: iva,
				total_centavos: factura.subtotal_centavos + iva,
				...factura,
			},
		},
		quien,
	);
}

/** Una factura de prueba, con su orden y su cuenta por pagar. */
export interface FacturaDePrueba {
	id: string;
	folio: string;
	estado: string;
	cuentaId: string;
	orden: OrdenParaRecibir;
}

/**
 * Una orden de prueba, recibida como se diga, y su factura capturada.
 * @param servidor El servidor de prueba.
 * @param opciones Lo que se recibe (`metros` y `piezas`; por omisión todo) y el subtotal de la factura (por omisión,
 * lo que vale la orden completa).
 */
export async function facturaDePrueba(
	servidor: ServidorDePrueba,
	opciones: { metros?: number; piezas?: number; subtotal?: number; orden?: OrdenParaRecibir } = {},
): Promise<FacturaDePrueba> {
	const orden = opciones.orden ?? (await ordenParaRecibir(servidor));
	const metros = opciones.metros ?? 100;
	const piezas = opciones.piezas ?? 500;
	if (opciones.orden === undefined && (metros > 0 || piezas > 0)) await recibirOrden(servidor, orden, metros, piezas);
	const respuesta = await capturarDePrueba(servidor, {
		ordenes: [{ orden_compra_id: orden.id }],
		subtotal_centavos: opciones.subtotal ?? valorDeLaOrdenDePrueba,
	});
	if (respuesta.estado !== 200) throw new Error(`no se capturó la factura: ${JSON.stringify(respuesta.cuerpo)}`);
	const capturada = z
		.object({ factura_proveedor_id: z.uuid(), folio: z.string(), estado: z.string() })
		.parse(respuesta.cuerpo.resultado);
	const { rows } = await servidor.base.dueno.query("SELECT id FROM cuentas_por_pagar WHERE factura_proveedor_id = $1", [
		capturada.factura_proveedor_id,
	]);
	return {
		id: capturada.factura_proveedor_id,
		folio: capturada.folio,
		estado: capturada.estado,
		cuentaId: String(rows[0]?.id),
		orden,
	};
}

/**
 * La versión de un renglón de las tablas de lo que se debe.
 * @param servidor El servidor de prueba.
 * @param tabla La tabla.
 * @param id El renglón.
 */
export async function versionPorPagar(
	servidor: ServidorDePrueba,
	tabla: "facturas_proveedor" | "cuentas_por_pagar",
	id: string,
): Promise<number> {
	const { rows } = await servidor.base.dueno.query(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id]);
	return z.number().parse(rows[0]?.v);
}

/**
 * Cómo quedó una factura y su cuenta.
 * @param servidor El servidor de prueba.
 * @param facturaId La factura.
 */
export async function facturaComoQuedo(servidor: ServidorDePrueba, facturaId: string) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT f.estado, f.responsable_detencion AS responsable, f.motivo_detencion AS motivo,
			f.valor_recibido_centavos::int AS valor_recibido, c.estado AS cuenta, c.importe_centavos::int AS importe,
			c.saldo_centavos::int AS saldo, c.vence::text AS vence
		 FROM facturas_proveedor f JOIN cuentas_por_pagar c ON c.factura_proveedor_id = f.id WHERE f.id = $1`,
		[facturaId],
	);
	return rows[0];
}

/**
 * Contaduría paga una cuenta por pagar, con «Confirmar con Google» y la versión de ahora.
 * @param servidor El servidor de prueba.
 * @param cuentaId La cuenta.
 * @param monto Lo que paga.
 * @param encabezados Los encabezados de más; por omisión, «Confirmar con Google».
 */
export async function pagarCuentaDePrueba(
	servidor: ServidorDePrueba,
	cuentaId: string,
	monto: number,
	encabezados: Record<string, string> = conGoogle(),
) {
	return mandarAccion(
		servidor,
		"contaduria.pagar_cuenta_por_pagar",
		{
			datos: { cuenta_por_pagar_id: cuentaId, monto_centavos: monto, medio: "efectivo", referencia: "Recibo 7" },
			version: await versionPorPagar(servidor, "cuentas_por_pagar", cuentaId),
		},
		"contaduria",
		encabezados,
	);
}

/**
 * Lee una lectura entre módulos en su propia transacción, como la leería otro módulo.
 * @param servidor El servidor de prueba.
 * @param nombre La lectura (`contaduria.facturacion_de_orden`).
 * @param datos Lo que recibe.
 */
export function leerDePrueba(servidor: ServidorDePrueba, nombre: string, datos: unknown): Promise<unknown> {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		contexto.lectura(nombre, datos),
	);
}
