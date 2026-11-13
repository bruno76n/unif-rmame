/**
 * `contaduria.pagos_recibidos`: los pagos recibidos de los clientes, el más reciente arriba, con su documento, dónde se
 * recibieron y, en un depósito a un tercero, si ya se aplicó a una deuda.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por cobrar», «Pagos recibidos») y
 * docs/modulos/contaduria/pagos-y-saldo-a-favor.md
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { pagosRecibidos } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { dondeSeRecibio, paginar } from "./comun.ts";

/** Un pago recibido, como lo lee la consulta. */
const pagoLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	fecha: z.string(),
	cliente_id: z.uuid(),
	cliente: z.string(),
	nota: z.string().nullable(),
	pedido: z.string().nullable(),
	medio: z.string(),
	tercero: z.string().nullable(),
	referencia: z.string().nullable(),
	monto: z.coerce.number(),
	aplicado_a_deuda: z.coerce.number(),
	deuda: z.string().nullable(),
	registro: z.string(),
	estado: z.string(),
});

/**
 * Lo aplicado de un depósito a un tercero: «aplicado a {deuda}», o «sin aplicar» en ámbar mientras no se aplica nada.
 * @param pago El pago.
 */
function aplicadoDe(pago: z.infer<typeof pagoLeido>) {
	if (pago.medio !== "cuenta_tercero") return null;
	return pago.aplicado_a_deuda > 0 && pago.deuda !== null
		? { texto: `aplicado a ${pago.deuda}`, ambar: false }
		: { texto: "sin aplicar", ambar: true };
}

export const consultaPagosRecibidos = implementarConsulta(pagosRecibidos, async (contexto, parametros) => {
	const { rows } = await contexto.base.execute(sql`SELECT p.id, p.version, p.folio, p.fecha::text, p.cliente_id,
			tc.nombre AS cliente, n.folio AS nota, pe.folio AS pedido, p.medio, td.nombre AS tercero, p.referencia,
			p.monto_centavos AS monto, p.estado,
			coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
				WHERE a.pago_id = p.id AND a.cuenta_por_pagar_id IS NOT NULL AND a.estado = 'vigente'), 0) AS aplicado_a_deuda,
			(SELECT coalesce(f.folio, d.folio) FROM aplicaciones_pago a
				JOIN cuentas_por_pagar c ON c.id = a.cuenta_por_pagar_id
				LEFT JOIN facturas_proveedor f ON f.id = c.factura_proveedor_id
				LEFT JOIN deuda_mensualidades m ON m.id = c.deuda_mensualidad_id
				LEFT JOIN deudas d ON d.id = m.deuda_id
				WHERE a.pago_id = p.id AND a.estado = 'vigente' ORDER BY a.id DESC LIMIT 1) AS deuda,
			coalesce(pr.nombre, u.nombre, u.correo, 'el sistema') AS registro
		FROM pagos p
		JOIN terceros tc ON tc.id = p.tercero_id
		LEFT JOIN terceros td ON td.id = p.tercero_deposito_id
		LEFT JOIN notas_entrega n ON n.id = p.nota_entrega_id
		LEFT JOIN pedidos pe ON pe.id = p.pedido_id
		LEFT JOIN usuarios u ON u.id = p.creado_por
		LEFT JOIN personas pr ON pr.id = u.persona_id
		WHERE p.direccion = 'recibido'
			AND (${parametros.incluir_cancelados === "si"} OR p.estado = 'registrado')
			AND (${parametros.cliente_id ?? null}::uuid IS NULL OR p.cliente_id = ${parametros.cliente_id ?? null}::uuid)
			AND (${parametros.desde ?? null}::date IS NULL OR p.fecha >= ${parametros.desde ?? null}::date)
			AND (${parametros.hasta ?? null}::date IS NULL OR p.fecha <= ${parametros.hasta ?? null}::date)
		ORDER BY p.fecha DESC, p.folio DESC`);
	const pagina = paginar(z.array(pagoLeido).parse(rows), parametros.cursor);
	return {
		resultado: {
			renglones: pagina.renglones.map((pago) => ({
				pago_id: pago.id,
				version: pago.version,
				folio: pago.folio,
				fecha: pago.fecha,
				fecha_texto: textoDeDiaCorto(pago.fecha),
				cliente_id: pago.cliente_id,
				cliente: pago.cliente,
				documento: pago.nota ?? `anticipo · ${pago.pedido ?? ""}`,
				donde: dondeSeRecibio(pago.medio, pago.tercero),
				referencia: pago.referencia,
				aplicado: aplicadoDe(pago),
				monto_centavos: pago.monto,
				registro: pago.registro,
				cancelado: pago.estado === "cancelado",
			})),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
		},
	};
});
