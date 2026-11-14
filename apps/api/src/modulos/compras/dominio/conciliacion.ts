/**
 * La conciliación de facturas de proveedor: por factura, sus tres puntas (orden, recibido y factura) y su estado. La
 * leen la pestaña de Compras y las de Contaduría (Cuentas por pagar), así que vive en el dominio: las dos ven lo mismo.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Conciliación de facturas») y docs/interfaz/fabrica/contaduria.md
 */

import { cantidadConUnidad } from "@uniformame/compartido/calculos/compras";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { conciliacionFacturas, estadoArmado } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { condicionDeOrden, type OrdenResumida, ordenesResumidas } from "./ordenes-resumidas.ts";

/** Un estado con su color, como lo pide el contrato. */
type EstadoArmado = z.infer<typeof estadoArmado>;

/** Un renglón de la conciliación, como lo pide el contrato. */
export type RenglonDeConciliacion = z.infer<typeof conciliacionFacturas.resultado>["renglones"][number];

/** Una factura detenida o esperando autorización, con la orden que cubre. */
const deFacturas = z.array(
	z.object({
		id: z.uuid(),
		folio: z.string(),
		folio_proveedor: z.string(),
		estado: z.string(),
		motivo: z.string().nullable(),
		responsable: z.string().nullable(),
		subtotal: z.coerce.number(),
		fecha: z.string(),
		orden_compra_id: z.uuid(),
	}),
);

/** Lo que regresa `contaduria.facturacion_de_orden`. */
const deFacturacion = z.object({ ordenes: z.record(z.string(), z.array(z.object({ estado: z.string() }))) });

/** Los estados de una orden con algo recibido que espera su factura. */
const recibidas = ["recibida_en_parte", "recibida", "cerrada_con_faltante"];

/**
 * El punto «Orden»: una línea con su cantidad y su precio, o cuántos materiales y el total.
 * @param orden La orden.
 */
function puntoDeOrden(orden: OrdenResumida): string {
	const [unica] = orden.lineas;
	if (orden.lineas.length === 1 && unica !== undefined) {
		return `${cantidadConUnidad(unica.pedido, unica.unidad)} a ${enPesos(unica.precioCentavos)}`;
	}
	return `${plural(orden.lineas.length, "material", "materiales")} · ${enPesos(orden.totalCentavos)}`;
}

/**
 * Lo recibido de una orden: la cantidad si es un material, o cuántos materiales llegaron.
 * @param orden La orden.
 */
function loRecibido(orden: OrdenResumida): string {
	const conAlgo = orden.lineas.filter((linea) => linea.recibido > 0n);
	const [unica] = conAlgo;
	if (conAlgo.length === 1 && unica !== undefined) return cantidadConUnidad(unica.recibido, unica.unidad);
	return plural(conAlgo.length, "material", "materiales");
}

/**
 * El estado de una factura detenida: a cargo de quién está.
 * @param estado El estado de la factura.
 * @param responsable A cargo de quién (`aduana` o `contaduria`).
 */
function estadoDeFactura(estado: string, responsable: string | null): EstadoArmado {
	if (estado === "esperando_autorizacion") return { texto: "Esperando autorización", color: "ambar", abajo: null };
	return responsable === "aduana"
		? { texto: "Esperando a Aduana", color: "verde-azulado", abajo: null }
		: { texto: "Esperando a Contaduría", color: "morado", abajo: null };
}

/**
 * Los renglones de la conciliación: primero las facturas que no cuadran, después las órdenes que esperan su factura.
 * @param accion El contexto de la lectura.
 */
export async function renglonesDeConciliacion(accion: ContextoDeAccion): Promise<RenglonDeConciliacion[]> {
	const facturas = deFacturas.parse(
		(
			await accion.transaccion.execute(sql`SELECT f.id, f.folio, f.folio_proveedor, f.estado,
				f.motivo_detencion AS motivo, f.responsable_detencion AS responsable, f.subtotal_centavos AS subtotal,
				coalesce(f.fecha_factura, f.fecha_captura)::text AS fecha, fo.orden_compra_id
			FROM facturas_proveedor f JOIN factura_proveedor_ordenes fo ON fo.factura_proveedor_id = f.id
			WHERE f.estado IN ('detenida', 'esperando_autorizacion') ORDER BY f.folio, fo.orden_compra_id`)
		).rows,
	);
	const conRecepcion = await ordenesResumidas(accion, { estados: recibidas });
	const ordenesDeFacturas = await ordenesResumidas(accion, {
		ids: [...new Set(facturas.map((factura) => factura.orden_compra_id))],
	});
	const facturacion = deFacturacion.parse(
		await accion.lectura("contaduria.facturacion_de_orden", {
			orden_compra_ids: conRecepcion.map((orden) => orden.id),
		}),
	).ordenes;
	const porId = new Map(ordenesDeFacturas.map((orden) => [orden.id, orden]));
	const detenidas = facturas.flatMap((factura) => {
		const orden = porId.get(factura.orden_compra_id);
		if (orden === undefined) return [];
		const sinRecibir = orden.recepciones.length === 0;
		const ultima = orden.recepciones.at(-1);
		return [
			{
				clave: `${factura.id}:${orden.id}`,
				factura: factura.folio,
				folio_proveedor: factura.folio_proveedor,
				orden_compra_id: orden.id,
				orden: orden.folio,
				proveedor: orden.proveedor,
				condicion: condicionDeOrden(orden),
				puntos: {
					orden: { texto: puntoDeOrden(orden), como: "coincide" as const },
					recepcion:
						sinRecibir || ultima === undefined
							? { texto: "Sin recibir", como: "falta" as const }
							: { texto: `${loRecibido(orden)} · ${textoDeDiaCorto(ultima)}`, como: "coincide" as const },
					factura: {
						texto: `${enPesos(factura.subtotal)} · ${textoDeDiaCorto(factura.fecha)}`,
						como: factura.responsable === "aduana" ? ("coincide" as const) : ("no_coincide" as const),
					},
				},
				que_no_cuadra: factura.motivo ?? "",
				estado: estadoDeFactura(factura.estado, factura.responsable),
			},
		];
	});
	const esperandoFactura = conRecepcion.flatMap((orden) => {
		const ultima = orden.recepciones.at(-1);
		if (ultima === undefined || (facturacion[orden.id] ?? []).length > 0) return [];
		return [
			{
				clave: orden.id,
				factura: null,
				folio_proveedor: null,
				orden_compra_id: orden.id,
				orden: orden.folio,
				proveedor: orden.proveedor,
				condicion: condicionDeOrden(orden),
				puntos: {
					orden: { texto: puntoDeOrden(orden), como: "coincide" as const },
					recepcion: { texto: `${loRecibido(orden)} · ${textoDeDiaCorto(ultima)}`, como: "coincide" as const },
					factura: { texto: "No ha llegado", como: "falta" as const },
				},
				que_no_cuadra: `Se recibieron ${loRecibido(orden)} el ${textoDeDiaCorto(ultima)} y la factura no ha llegado`,
				estado: { texto: "Esperando al proveedor", color: "naranja" as const, abajo: null },
			},
		];
	});
	return [...detenidas, ...esperandoFactura];
}
