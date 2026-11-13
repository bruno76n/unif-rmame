/**
 * Lo que comparten las consultas de las pantallas de Contaduría: sus parámetros, las cuentas de la fábrica y los
 * valores de una lista, las cuentas por cobrar con saldo, las cuentas por pagar que se deben con su documento, los
 * depósitos a terceros por aplicar, los saldos a favor, los textos de los tramos, de los vencimientos y de dónde se
 * recibió un pago, y la página de una lista larga.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md y docs/modulos/contaduria/cuentas-por-cobrar.md,
 * cuentas-por-pagar.md y pagos-y-saldo-a-favor.md
 *
 * Solo leen: las reglas (la antigüedad, el saldo por pagar, el flujo, el semáforo) son las funciones del dominio.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { QuienLlama } from "../../../nucleo/acceso/quien.ts";
import { paginarLista } from "../../../nucleo/http/consultas.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { leerTramos } from "../dominio/antiguedad.ts";
import type { CuentaParaPagar } from "../dominio/saldo-por-pagar.ts";
import { listaDeCuentasFabrica } from "../siembra.ts";

/** Cuántos renglones trae cada página de una lista larga. */
export const renglonesPorPagina = 50;

/** Un número de la base, que llega como texto en los `bigint`. */
const numero = z.coerce.number();

/**
 * Los cortes de los tramos de antigüedad (`contaduria.antiguedad_tramos_dias`).
 * @param contexto El contexto de la consulta.
 */
export async function cortesDeAntiguedad(contexto: ContextoDeConsulta): Promise<number[]> {
	return leerTramos(String(await contexto.lectura("admin.parametro", { clave: "contaduria.antiguedad_tramos_dias" })));
}

/** Los colores de los tramos: por vencer, los vencidos de menos a más y el último. */
const coloresDeTramo = ["verde", "ambar", "naranja", "rojo"] as const;

/**
 * Los tramos de antigüedad con su etiqueta y su color: «Por vencer», «1 a 15 días», «16 a 30 días», «Más de 30».
 * @param cortes Los cortes de los tramos.
 */
export function tramosDeAntiguedad(cortes: readonly number[]) {
	const vencidos = cortes.map((corte, i) => ({
		etiqueta: `${i === 0 ? 1 : (cortes[i - 1] ?? 0) + 1} a ${corte} días`,
		color: coloresDeTramo[Math.min(i + 1, coloresDeTramo.length - 2)] ?? "ambar",
	}));
	return [
		{ etiqueta: "Por vencer", color: "verde" as const },
		...vencidos,
		{ etiqueta: `Más de ${cortes.at(-1) ?? 0}`, color: "rojo" as const },
	];
}

/**
 * Un monto escrito para un texto armado: «$1,250»; a la cuenta de soporte, que nunca ve montos, «—».
 * @param quien Quién pide la consulta.
 * @param monto En centavos.
 */
export function pesosPara(quien: QuienLlama, monto: number): string {
	return quien.tipo === "cuenta" && quien.esSoporte ? "—" : enPesos(monto);
}

/**
 * Cuándo vence algo, como lo dice la pantalla: «hace 3 días», «hoy», «en 4 días».
 * @param vence El día en que vence.
 * @param hoy Hoy.
 */
export function cuandoVence(vence: string, hoy: Temporal.PlainDate): string {
	return textoEnDias(hoy.until(vence, { largestUnit: "days" }).days);
}

/**
 * Una fecha con su texto y su tono, para las tablas: «24 nov», «hace 3 días» en rojo si ya pasó.
 * @param fecha El día.
 * @param hoy Hoy.
 */
export function fechaConTextoDe(fecha: string, hoy: Temporal.PlainDate) {
	const dias = hoy.until(fecha, { largestUnit: "days" }).days;
	return {
		fecha,
		texto: textoDeDiaCorto(fecha),
		cuando: textoEnDias(dias),
		tono: dias < 0 ? ("rojo" as const) : dias === 0 ? ("ambar" as const) : ("normal" as const),
	};
}

/**
 * Dónde se recibió un pago: «Efectivo», «Cuenta de la fábrica» o «Cuenta de {tercero}».
 * @param medio El medio del pago.
 * @param tercero El tercero a quien se le depositó, si fue a su cuenta.
 */
export function dondeSeRecibio(medio: string, tercero: string | null): string {
	if (medio === "efectivo") return "Efectivo";
	if (medio === "cuenta_tercero") return `Cuenta de ${tercero ?? "un tercero"}`;
	return "Cuenta de la fábrica";
}

/**
 * Una página de una lista ya ordenada.
 * @param lista La lista completa.
 * @param cursor Dónde empieza: el cursor opaco que regresó la página anterior (`nucleo/http/consultas.ts`).
 */
export function paginar<Renglon>(lista: readonly Renglon[], cursor: string | undefined) {
	return paginarLista(lista, cursor, renglonesPorPagina);
}

/**
 * Las cuentas de la fábrica vigentes, en su orden.
 * @param contexto El contexto de la consulta.
 */
export async function cuentasDeLaFabrica(contexto: ContextoDeConsulta) {
	return valoresDeLista(contexto, listaDeCuentasFabrica);
}

/**
 * Los valores vigentes de una lista de Configuración, en su orden (`admin.valores_de_lista`).
 * @param contexto El contexto de la consulta.
 * @param lista La clave de la lista.
 * @param soloSeleccionables Sin los que pone el sistema («Reparación de máquinas»).
 */
export async function valoresDeLista(contexto: ContextoDeConsulta, lista: string, soloSeleccionables = false) {
	return valoresLeidos.parse(
		await contexto.lectura("admin.valores_de_lista", { lista, solo_seleccionables: soloSeleccionables }),
	).valores;
}

/** Lo que regresa `admin.valores_de_lista`. */
const valoresLeidos = z.object({ valores: z.array(z.object({ id: z.uuid(), nombre: z.string() })) });

/** Una cuenta por cobrar con saldo, con su cliente y su nota. */
const cuentaPorCobrarLeida = z.object({
	id: z.uuid(),
	cliente_id: z.uuid(),
	cliente: z.string(),
	nota_entrega_id: z.uuid(),
	nota: z.string(),
	fecha_entrega: z.string(),
	vence: z.string(),
	saldo: numero,
});

/** Una cuenta por cobrar con saldo. */
export type CuentaPorCobrarLeida = z.infer<typeof cuentaPorCobrarLeida>;

/**
 * Las cuentas por cobrar con saldo, con su cliente y el folio de su nota; de un cliente, si se dice.
 * @param contexto El contexto de la consulta.
 * @param clienteId El cliente, si solo son las suyas.
 */
export async function cuentasPorCobrarConSaldo(
	contexto: ContextoDeConsulta,
	clienteId?: string,
): Promise<CuentaPorCobrarLeida[]> {
	const { rows } = await contexto.base.execute(sql`SELECT c.id, c.cliente_id, t.nombre AS cliente,
			c.nota_entrega_id, n.folio AS nota, c.fecha_entrega::text, c.vence::text, c.saldo_centavos AS saldo
		FROM cuentas_por_cobrar c
		JOIN terceros t ON t.id = c.tercero_id
		JOIN notas_entrega n ON n.id = c.nota_entrega_id
		WHERE c.saldo_centavos > 0 AND (${clienteId ?? null}::uuid IS NULL OR c.cliente_id = ${clienteId ?? null}::uuid)
		ORDER BY c.vence, n.folio`);
	return z.array(cuentaPorCobrarLeida).parse(rows);
}

/** Una cuenta por pagar que se debe, con su beneficiario y su documento. */
const cuentaPorPagarLeida = z.object({
	id: z.uuid(),
	version: numero,
	tercero_id: z.uuid(),
	beneficiario: z.string(),
	tipo: z.enum(["proveedor", "acreedor"]),
	estado: z.enum(["detenida", "por_pagar", "pagada_en_parte", "pagada", "cancelada"]),
	vence: z.string(),
	importe: numero,
	saldo: numero,
	factura_proveedor_id: z.uuid().nullable(),
	factura: z.string().nullable(),
	factura_estado: z.string().nullable(),
	ordenes: z.string().nullable(),
	deuda: z.string().nullable(),
	numero: z.number().int().nullable(),
	de: z.number().int().nullable(),
	prestamo: numero.nullable(),
});

/** Una cuenta por pagar que se debe. */
export type CuentaPorPagarLeida = z.infer<typeof cuentaPorPagarLeida>;

/**
 * Las cuentas por pagar que se deben (ni pagadas ni canceladas, también las detenidas), con su beneficiario, su
 * factura y sus órdenes, o su deuda y su mensualidad; de un tercero, si se dice.
 * @param contexto El contexto de la consulta.
 * @param terceroId El tercero, si solo son las suyas.
 */
export async function cuentasPorPagarQueSeDeben(
	contexto: ContextoDeConsulta,
	terceroId?: string,
): Promise<CuentaPorPagarLeida[]> {
	const { rows } = await contexto.base.execute(sql`SELECT c.id, c.version, c.tercero_id, t.nombre AS beneficiario,
			c.tipo, c.estado, c.vence::text, c.importe_centavos AS importe, c.saldo_centavos AS saldo,
			c.factura_proveedor_id, f.folio AS factura, f.estado AS factura_estado,
			(SELECT string_agg(o.folio, ', ' ORDER BY o.folio) FROM factura_proveedor_ordenes fo
				JOIN ordenes_compra o ON o.id = fo.orden_compra_id WHERE fo.factura_proveedor_id = f.id) AS ordenes,
			d.folio AS deuda, m.numero, d.numero_mensualidades AS de,
			(SELECT sum(c2.saldo_centavos) FROM cuentas_por_pagar c2 JOIN deuda_mensualidades m2
				ON m2.id = c2.deuda_mensualidad_id WHERE m2.deuda_id = d.id AND c2.estado <> 'cancelada') AS prestamo
		FROM cuentas_por_pagar c
		JOIN terceros t ON t.id = c.tercero_id
		LEFT JOIN facturas_proveedor f ON f.id = c.factura_proveedor_id
		LEFT JOIN deuda_mensualidades m ON m.id = c.deuda_mensualidad_id
		LEFT JOIN deudas d ON d.id = m.deuda_id
		WHERE c.estado NOT IN ('pagada', 'cancelada')
			AND (${terceroId ?? null}::uuid IS NULL OR c.tercero_id = ${terceroId ?? null}::uuid)
		ORDER BY c.vence, t.nombre, c.id`);
	return z.array(cuentaPorPagarLeida).parse(rows);
}

/**
 * La cuenta por pagar como la usan las funciones del dominio.
 * @param cuenta La cuenta leída.
 */
export function paraElDominio(cuenta: CuentaPorPagarLeida): CuentaParaPagar {
	return { estado: cuenta.estado, vence: cuenta.vence, saldoCentavos: cuenta.saldo };
}

/**
 * El documento de una cuenta por pagar: «Factura {FP} · {OC}» o «{PR} · mensualidad {n} de {m}».
 * @param cuenta La cuenta leída.
 */
export function documentoDe(cuenta: CuentaPorPagarLeida): string {
	if (cuenta.factura !== null)
		return `Factura ${cuenta.factura}${cuenta.ordenes === null ? "" : ` · ${cuenta.ordenes}`}`;
	return `${cuenta.deuda ?? "Deuda"} · mensualidad ${cuenta.numero ?? 1} de ${cuenta.de ?? 1}`;
}

/** Un depósito de un cliente a la cuenta de un tercero que todavía tiene algo sin aplicar. */
const depositoLeido = z.object({
	id: z.uuid(),
	version: numero,
	folio: z.string(),
	fecha: z.string(),
	cliente_id: z.uuid(),
	cliente: z.string(),
	documento: z.string(),
	tercero_id: z.uuid(),
	tercero: z.string(),
	referencia: z.string().nullable(),
	monto: numero,
	queda: numero,
	aplicado_a: z.string().nullable(),
});

/** Un depósito a un tercero. */
export type DepositoLeido = z.infer<typeof depositoLeido>;

/**
 * Los depósitos de clientes a la cuenta de un tercero, registrados, con lo que queda sin aplicar (su monto menos lo
 * vigente que ya se aplicó a cuentas por pagar) y la última deuda a la que se aplicó.
 * @param contexto El contexto de la consulta.
 * @param filtro Solo los que tienen algo por aplicar, o los de un tercero.
 */
export async function depositosATerceros(
	contexto: ContextoDeConsulta,
	filtro: { porAplicar?: boolean; terceroId?: string } = {},
): Promise<DepositoLeido[]> {
	const { rows } = await contexto.base.execute(sql`SELECT * FROM (SELECT p.id, p.version, p.folio, p.fecha::text,
			p.cliente_id, tc.nombre AS cliente, coalesce(n.folio, pe.folio, '') AS documento,
			p.tercero_deposito_id AS tercero_id, td.nombre AS tercero, p.referencia, p.monto_centavos AS monto,
			p.monto_centavos - coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
				WHERE a.pago_id = p.id AND a.cuenta_por_pagar_id IS NOT NULL AND a.estado = 'vigente'), 0) AS queda,
			(SELECT coalesce(f.folio, d.folio) FROM aplicaciones_pago a
				JOIN cuentas_por_pagar c ON c.id = a.cuenta_por_pagar_id
				LEFT JOIN facturas_proveedor f ON f.id = c.factura_proveedor_id
				LEFT JOIN deuda_mensualidades m ON m.id = c.deuda_mensualidad_id
				LEFT JOIN deudas d ON d.id = m.deuda_id
				WHERE a.pago_id = p.id AND a.estado = 'vigente' ORDER BY a.id DESC LIMIT 1) AS aplicado_a
		FROM pagos p
		JOIN terceros tc ON tc.id = p.tercero_id
		JOIN terceros td ON td.id = p.tercero_deposito_id
		LEFT JOIN notas_entrega n ON n.id = p.nota_entrega_id
		LEFT JOIN pedidos pe ON pe.id = p.pedido_id
		WHERE p.medio = 'cuenta_tercero' AND p.estado = 'registrado'
			AND (${filtro.terceroId ?? null}::uuid IS NULL OR p.tercero_deposito_id = ${filtro.terceroId ?? null}::uuid)
		) d WHERE (${filtro.porAplicar !== true} OR d.queda > 0) ORDER BY d.fecha, d.folio`);
	return z.array(depositoLeido).parse(rows);
}

/** El saldo a favor de un cliente, desde cuándo lo tiene. */
const saldoAFavorLeido = z.object({
	cliente_id: z.uuid(),
	nombre: z.string(),
	desde: z.string(),
	monto: numero,
});

/**
 * Los clientes con saldo a favor: lo que entró menos lo aplicado y lo devuelto, vigente; desde su entrada más vieja.
 * @param contexto El contexto de la consulta.
 */
export async function saldosAFavor(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT s.cliente_id, t.nombre,
			min(s.fecha) FILTER (WHERE s.tipo = 'entra')::text AS desde,
			sum(CASE WHEN s.tipo = 'entra' THEN s.monto_centavos ELSE -s.monto_centavos END) AS monto
		FROM saldo_favor_movimientos s JOIN terceros t ON t.id = s.tercero_id
		WHERE s.estado = 'vigente'
		GROUP BY s.cliente_id, t.nombre
		HAVING sum(CASE WHEN s.tipo = 'entra' THEN s.monto_centavos ELSE -s.monto_centavos END) > 0
		ORDER BY 4 DESC, t.nombre`);
	return z.array(saldoAFavorLeido).parse(rows);
}
