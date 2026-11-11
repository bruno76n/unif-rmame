/**
 * Las lecturas de las órdenes que usa Inventario: las órdenes por recibir, sin precios, y el precio vigente de unas
 * líneas, para el costo de los rollos.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md (reglas 8 a 10, «Lecturas»)
 */

import { deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { parametroNumero } from "../dominio/comunes.ts";
import { faltanteDeLineas, lineasDeOrdenes, precioVigente } from "../dominio/ordenes.ts";
import { ordenCompraLineas, ordenesCompra, proveedores } from "../tablas.ts";

/** Lo que recibe `compras.ordenes_por_recibir`: unas órdenes, o ninguna para todas. */
const pedidoPorRecibir = z.object({ orden_compra_ids: z.array(z.uuid()).optional() }).strict();

/** Lo que recibe `compras.precio_vigente_lineas`. */
const pedidoDePrecios = z.object({ orden_compra_linea_ids: z.array(z.uuid()) }).strict();

/** Las que se pueden recibir: enviadas o recibidas en parte. */
const porRecibir = ["enviada", "recibida_en_parte"];

/**
 * `compras.ordenes_por_recibir`: por orden, su folio, su proveedor, su estado, si se puede recibir, cuándo se espera
 * lo que falta, si está atrasada y cuántos días, y sus líneas con lo pedido y lo que falta. Sin precios.
 * @param contexto El contexto de quien lee (Aduana).
 * @param datos Las órdenes, o ninguna para todas las enviadas y recibidas en parte.
 */
export async function ordenesPorRecibir(contexto: ContextoDeAccion, datos: unknown) {
	const { orden_compra_ids } = pedidoPorRecibir.parse(datos);
	const ordenes = await contexto.transaccion
		.select({
			id: ordenesCompra.id,
			folio: ordenesCompra.folio,
			estado: ordenesCompra.estado,
			fechaPrometida: ordenesCompra.fechaPrometida,
			proveedor: terceros.nombre,
		})
		.from(ordenesCompra)
		.innerJoin(proveedores, eq(proveedores.id, ordenesCompra.proveedorId))
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(
			orden_compra_ids === undefined
				? inArray(ordenesCompra.estado, porRecibir)
				: and(inArray(ordenesCompra.id, orden_compra_ids)),
		)
		.orderBy(asc(ordenesCompra.fechaPrometida), asc(ordenesCompra.folio));
	const lineas = await lineasDeOrdenes(
		contexto.transaccion,
		ordenes.map((orden) => orden.id),
	);
	const faltante = await faltanteDeLineas(contexto, lineas);
	const espera = await parametroNumero(contexto, "compras.dias_espera_orden_atrasada");
	const hoy = contexto.diaDeNegocio;
	return {
		ordenes: ordenes.map((orden) => {
			const prometida = orden.fechaPrometida === null ? null : Temporal.PlainDate.from(orden.fechaPrometida);
			const atrasada =
				porRecibir.includes(orden.estado) && prometida !== null && Temporal.PlainDate.compare(prometida, hoy) < 0;
			return {
				orden_compra_id: orden.id,
				folio: orden.folio,
				proveedor: orden.proveedor,
				estado: orden.estado,
				se_puede_recibir: porRecibir.includes(orden.estado),
				// Lo que falta se espera en la fecha prometida; si ya pasó, hoy más los días de espera.
				llegada_esperada: atrasada ? hoy.add({ days: espera }).toString() : orden.fechaPrometida,
				atrasada,
				dias_atraso: atrasada && prometida !== null ? prometida.until(hoy).days : 0,
				lineas: lineas
					.filter((linea) => linea.ordenCompraId === orden.id)
					.map((linea) => ({
						orden_compra_linea_id: linea.id,
						material_id: linea.materialId,
						material: linea.material,
						unidad: linea.unidad,
						pedido: linea.cantidad,
						falta: deMilesimos(faltante.get(linea.id) ?? 0n),
					})),
			};
		}),
	};
}

/**
 * `compras.precio_vigente_lineas`: el precio vigente de unas líneas (el de la nota, si cobró otro, o el de la
 * orden), para el costo del metro de los rollos. Nunca viaja a la pantalla de Aduana.
 * @param contexto El contexto de quien lee (Inventario).
 * @param datos `orden_compra_linea_ids`.
 * @returns Por línea, su precio en centavos.
 */
export async function precioVigenteLineas(contexto: ContextoDeAccion, datos: unknown): Promise<Record<string, number>> {
	const { orden_compra_linea_ids } = pedidoDePrecios.parse(datos);
	if (orden_compra_linea_ids.length === 0) return {};
	const lineas = await contexto.transaccion
		.select({
			id: ordenCompraLineas.id,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.where(inArray(ordenCompraLineas.id, orden_compra_linea_ids));
	return Object.fromEntries(lineas.map((linea) => [linea.id, precioVigente(linea)]));
}
