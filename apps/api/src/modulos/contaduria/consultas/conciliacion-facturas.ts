/**
 * `contaduria.conciliacion_facturas`: «Facturas de proveedor» en Cuentas por pagar. Las facturas con sus tres puntas y
 * su estado, sin las detenidas sin autorización (esas van en Pagos detenidos), y al final las órdenes recibidas que
 * esperan su factura.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Facturas de proveedor») y
 * docs/modulos/contaduria/facturas-de-proveedor.md
 *
 * Las puntas de una factura salen de lo que guardó su última revisión (`factura_proveedor_ordenes`); las órdenes que
 * esperan factura son las de la conciliación de Compras.
 */

import { conciliacionFacturasDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { renglonesDeConciliacion } from "../../compras/dominio/conciliacion.ts";
import { paginar } from "./comun.ts";

/** Un renglón de la lista. */
type Renglon = z.infer<typeof conciliacionFacturasDeContaduria.resultado>["renglones"][number];

/** Una factura con su cuenta y sus órdenes. */
const facturaLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	folio_proveedor: z.string(),
	proveedor_id: z.uuid(),
	proveedor: z.string(),
	estado: z.enum(["detenida", "esperando_autorizacion", "conciliada", "autorizada", "cancelada"]),
	motivo: z.string().nullable(),
	total: z.coerce.number(),
	autorizado: z.coerce.number().nullable(),
	diferencia: z.coerce.number().nullable(),
	nota_credito: z.string().nullable(),
	cuenta_estado: z.string(),
	saldo: z.coerce.number(),
	importe: z.coerce.number(),
	ordenes: z.string(),
	orden_ids: z.array(z.uuid()),
	sin_recepcion: z.boolean(),
});

/**
 * El estado de una factura como se lee en la lista.
 * @param factura La factura.
 */
function estadoDe(factura: z.infer<typeof facturaLeida>): Renglon["estado"] {
	if (factura.estado === "cancelada") return { texto: "Cancelada", color: "rojo", abajo: null };
	if (factura.cuenta_estado === "pagada") return { texto: "Pagada", color: "verde", abajo: null };
	if (factura.estado === "esperando_autorizacion")
		return { texto: "Esperando autorización", color: "ambar", abajo: null };
	if (factura.estado === "autorizada") return { texto: "Autorizada por Dirección", color: "verde", abajo: null };
	return { texto: "Lista para pagar", color: "verde", abajo: null };
}

/**
 * El estado del filtro de una factura: el de su factura, o «pagada» si su cuenta ya se pagó.
 * @param factura La factura.
 */
function estadoDelFiltro(factura: z.infer<typeof facturaLeida>): string {
	return factura.cuenta_estado === "pagada" && factura.estado !== "cancelada" ? "pagada" : factura.estado;
}

/**
 * Las facturas sin las detenidas, con sus tres puntas.
 * @param contexto El contexto de la consulta.
 */
async function facturas(contexto: ContextoDeConsulta): Promise<(Renglon & { filtro: Filtro })[]> {
	const { rows } = await contexto.base.execute(sql`SELECT f.id, f.version, f.folio, f.folio_proveedor, f.proveedor_id,
			t.nombre AS proveedor, f.estado, f.motivo_detencion AS motivo, f.total_facturado_centavos AS total,
			f.monto_autorizado_centavos AS autorizado, f.diferencia_por_aclarar_centavos AS diferencia,
			f.nota_credito_proveedor AS nota_credito, c.estado AS cuenta_estado, c.saldo_centavos AS saldo,
			c.importe_centavos AS importe,
			string_agg(o.folio, ', ' ORDER BY o.folio) AS ordenes, array_agg(o.id ORDER BY o.folio) AS orden_ids,
			bool_or(fo.sin_recepcion) AS sin_recepcion
		FROM facturas_proveedor f
		JOIN terceros t ON t.id = f.tercero_id
		JOIN cuentas_por_pagar c ON c.factura_proveedor_id = f.id
		JOIN factura_proveedor_ordenes fo ON fo.factura_proveedor_id = f.id
		JOIN ordenes_compra o ON o.id = fo.orden_compra_id
		WHERE f.estado <> 'detenida'
		GROUP BY f.id, t.nombre, c.estado, c.saldo_centavos, c.importe_centavos
		ORDER BY f.fecha_captura DESC, f.folio DESC`);
	return z
		.array(facturaLeida)
		.parse(rows)
		.map((factura) => {
			const cuadra = factura.estado === "conciliada";
			return {
				clave: factura.id,
				factura_proveedor_id: factura.id,
				version: factura.version,
				folio: factura.folio,
				folio_proveedor: factura.folio_proveedor,
				ordenes: factura.ordenes,
				proveedor: factura.proveedor,
				motivo: cuadra ? null : factura.motivo,
				puntas: {
					orden: { texto: factura.ordenes, como: "coincide" as const },
					recepcion: factura.sin_recepcion
						? { texto: "Sin recibir", como: "falta" as const }
						: { texto: "Recibida", como: "coincide" as const },
					factura: {
						texto: cuadra ? "Cuadra" : "No cuadra",
						como: cuadra ? ("coincide" as const) : ("no_coincide" as const),
					},
				},
				total_centavos: factura.total,
				estado: estadoDe(factura),
				autorizada:
					factura.estado === "autorizada"
						? {
								monto_autorizado_centavos: factura.autorizado ?? 0,
								diferencia_centavos: factura.diferencia ?? 0,
								aclarada_con: factura.nota_credito,
							}
						: null,
				cancelable: cuadra && factura.saldo === factura.importe,
				filtro: { proveedorId: factura.proveedor_id, ordenIds: factura.orden_ids, estado: estadoDelFiltro(factura) },
			};
		});
}

/** Con qué se filtra un renglón. */
interface Filtro {
	proveedorId: string | null;
	ordenIds: readonly string[];
	estado: string | null;
}

/**
 * Las órdenes recibidas que esperan su factura, de la conciliación de Compras.
 * @param contexto El contexto de la consulta.
 */
async function esperandoFactura(contexto: ContextoDeConsulta): Promise<(Renglon & { filtro: Filtro })[]> {
	const conciliacion = await contexto.comoAccion(renglonesDeConciliacion);
	return conciliacion
		.filter((renglon) => renglon.factura === null)
		.map((renglon) => ({
			clave: `orden:${renglon.orden_compra_id}`,
			factura_proveedor_id: null,
			version: null,
			folio: null,
			folio_proveedor: null,
			ordenes: renglon.orden,
			proveedor: renglon.proveedor,
			motivo: null,
			puntas: renglon.puntos,
			estado: { texto: "Esperando factura", color: "ambar", abajo: null },
			autorizada: null,
			cancelable: false,
			filtro: { proveedorId: null, ordenIds: [renglon.orden_compra_id], estado: null },
		}));
}

export const consultaConciliacionFacturas = implementarConsulta(
	conciliacionFacturasDeContaduria,
	async (contexto, parametros) => {
		const todos = [...(await facturas(contexto)), ...(await esperandoFactura(contexto))];
		const filtrados = todos.filter(
			({ filtro }) =>
				(parametros.estado === undefined || filtro.estado === parametros.estado) &&
				(parametros.orden_compra_id === undefined || filtro.ordenIds.includes(parametros.orden_compra_id)) &&
				(parametros.proveedor_id === undefined || filtro.proveedorId === parametros.proveedor_id),
		);
		const pagina = paginar(filtrados, parametros.cursor);
		return {
			resultado: {
				renglones: pagina.renglones.map(({ filtro: _filtro, ...renglon }) => renglon),
				cursor: pagina.cursor,
				hay_mas: pagina.hay_mas,
			},
		};
	},
);
