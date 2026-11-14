/**
 * Las órdenes de compra resumidas: su proveedor, sus líneas con lo recibido, el total y su atraso. Las leen las
 * consultas de Compras y las de Contaduría (las órdenes que esperan factura), así que viven en el dominio.
 * Fase 19 · docs/interfaz/fabrica/compras.md y docs/interfaz/fabrica/contaduria.md («Capturar nota o factura»)
 */

import { condicionDePago } from "@uniformame/compartido/calculos/compras";
import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { listaDeUnidades } from "../siembra.ts";
import { materiales, ordenCompraLineas, ordenesCompra, proveedores } from "../tablas.ts";
import { recibidoDeOrdenes } from "./ordenes.ts";

/** Una línea de una orden con lo recibido. */
export interface LineaResumida {
	id: string;
	materialId: string;
	material: string;
	presentacion: string | null;
	unidad: string;
	multiplo: string;
	pedido: bigint;
	recibido: bigint;
	falta: bigint;
	precioCentavos: number;
	precioOrdenCentavos: number;
	precioNotaCentavos: number | null;
	importeCentavos: number;
}

/** Una orden con su proveedor, sus líneas, lo recibido y su atraso. */
export interface OrdenResumida {
	id: string;
	version: number;
	folio: string;
	estado: string;
	fecha: string;
	fechaPrometida: string | null;
	enviadaEn: string | null;
	creadoPor: string | null;
	proveedorId: string;
	proveedor: string;
	diasCredito: number;
	diasDiceTardar: number;
	pdfArchivoId: string | null;
	canceladoEn: string | null;
	canceladoPor: string | null;
	motivoCancelacion: string | null;
	cerradaEn: string | null;
	cerradaPor: string | null;
	motivoCierre: string | null;
	lineas: LineaResumida[];
	totalCentavos: number;
	diasAtraso: number;
	/** Los días de sus recepciones, del primero al último. */
	recepciones: string[];
}

/** Las que se pueden recibir: enviadas o recibidas en parte. */
const porRecibir = ["enviada", "recibida_en_parte"];

/**
 * Lo recibido de unas líneas y las recepciones de unas órdenes, de `inventario.recibido_de_ordenes`.
 * @param accion El contexto de la lectura.
 * @param lineaIds Las líneas.
 * @param ordenIds Las órdenes.
 */
async function recibido(
	accion: ContextoDeAccion,
	lineaIds: string[],
	ordenIds: string[],
): Promise<{ lineas: Record<string, string>; recepciones: Record<string, { dia: string }[]> }> {
	if (ordenIds.length === 0 || !accion.hayLectura("inventario.recibido_de_ordenes")) {
		return { lineas: {}, recepciones: {} };
	}
	return recibidoDeOrdenes.parse(
		await accion.lectura("inventario.recibido_de_ordenes", {
			orden_compra_linea_ids: lineaIds,
			orden_compra_ids: ordenIds,
		}),
	);
}

/**
 * Las órdenes que cumplen un filtro, con su proveedor, sus líneas, lo recibido, el total y su atraso; la más nueva
 * primero.
 * @param accion El contexto de la lectura.
 * @param filtro Unas órdenes, las de un proveedor o las de unos estados.
 */
export async function ordenesResumidas(
	accion: ContextoDeAccion,
	filtro: { ids?: readonly string[]; proveedorId?: string; estados?: readonly string[] },
): Promise<OrdenResumida[]> {
	const ordenes = await accion.transaccion
		.select({
			orden: ordenesCompra,
			proveedor: terceros.nombre,
			diasCreditoProveedor: proveedores.diasCredito,
			diasDiceTardar: proveedores.diasDiceTardar,
		})
		.from(ordenesCompra)
		.innerJoin(proveedores, eq(proveedores.id, ordenesCompra.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(
			and(
				filtro.ids === undefined ? undefined : inArray(ordenesCompra.id, [...filtro.ids]),
				filtro.proveedorId === undefined ? undefined : eq(ordenesCompra.proveedorId, filtro.proveedorId),
				filtro.estados === undefined ? undefined : inArray(ordenesCompra.estado, [...filtro.estados]),
			),
		)
		.orderBy(sql`${ordenesCompra.folio} DESC`);
	if (ordenes.length === 0) return [];
	const ids = ordenes.map((fila) => fila.orden.id);
	const lineas = await accion.transaccion
		.select({
			id: ordenCompraLineas.id,
			ordenId: ordenCompraLineas.ordenCompraId,
			materialId: materiales.id,
			material: materiales.nombre,
			presentacion: materiales.presentacion,
			unidad: sql<string>`coalesce(${listaValores.nombre}, ${materiales.unidad})`,
			multiplo: materiales.multiploCompra,
			cantidad: ordenCompraLineas.cantidad,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.innerJoin(materiales, eq(materiales.id, ordenCompraLineas.materialId))
		.innerJoin(listas, eq(listas.clave, listaDeUnidades))
		.leftJoin(listaValores, and(eq(listaValores.listaId, listas.id), eq(listaValores.clave, materiales.unidad)))
		.where(inArray(ordenCompraLineas.ordenCompraId, ids))
		.orderBy(asc(materiales.nombre));
	const llegado = await recibido(
		accion,
		lineas.map((linea) => linea.id),
		ids,
	);
	const hoy = accion.diaDeNegocio;
	return ordenes.map(({ orden, proveedor, diasCreditoProveedor, diasDiceTardar }) => {
		const suyas = lineas
			.filter((linea) => linea.ordenId === orden.id)
			.map((linea) => {
				const pedido = aMilesimosConSigno(linea.cantidad);
				const recibidoDeLinea = aMilesimosConSigno(llegado.lineas[linea.id] ?? "0");
				const falta = pedido - recibidoDeLinea;
				const precioCentavos = linea.precioNotaCentavos ?? linea.precioOrdenCentavos;
				return {
					id: linea.id,
					materialId: linea.materialId,
					material: linea.material,
					presentacion: linea.presentacion,
					unidad: linea.unidad,
					multiplo: linea.multiplo,
					pedido,
					recibido: recibidoDeLinea,
					falta: falta > 0n ? falta : 0n,
					precioCentavos,
					precioOrdenCentavos: linea.precioOrdenCentavos,
					precioNotaCentavos: linea.precioNotaCentavos,
					// El total es cada cantidad por su precio vigente (regla 15), al centavo.
					importeCentavos: Number((pedido * BigInt(precioCentavos) + 500n) / 1000n),
				};
			});
		const prometida = orden.fechaPrometida === null ? null : Temporal.PlainDate.from(orden.fechaPrometida);
		const atrasada =
			porRecibir.includes(orden.estado) && prometida !== null && Temporal.PlainDate.compare(prometida, hoy) < 0;
		return {
			id: orden.id,
			version: orden.version,
			folio: orden.folio,
			estado: orden.estado,
			fecha: orden.fecha,
			fechaPrometida: orden.fechaPrometida,
			enviadaEn: orden.enviadaEn,
			creadoPor: orden.creadoPor,
			proveedorId: orden.proveedorId,
			proveedor,
			diasCredito: orden.diasCredito ?? diasCreditoProveedor,
			diasDiceTardar,
			pdfArchivoId: orden.pdfArchivoId,
			canceladoEn: orden.canceladoEn,
			canceladoPor: orden.canceladoPor,
			motivoCancelacion: orden.motivoCancelacion,
			cerradaEn: orden.cerradaEn,
			cerradaPor: orden.cerradaPor,
			motivoCierre: orden.motivoCierre,
			lineas: suyas,
			totalCentavos: suyas.reduce((suma, linea) => suma + linea.importeCentavos, 0),
			diasAtraso: atrasada && prometida !== null ? prometida.until(hoy).days : 0,
			recepciones: (llegado.recepciones[orden.id] ?? []).map((recepcion) => recepcion.dia).sort(),
		};
	});
}

/**
 * La condición de pago de una orden: la que se copió al enviarla o, en borrador, la de su proveedor.
 * @param orden La orden.
 */
export function condicionDeOrden(orden: Pick<OrdenResumida, "diasCredito">): string {
	return condicionDePago(orden.diasCredito);
}
