/**
 * El trabajo «Cuadre de saldos»: cada noche, al terminar el cuadre de inventario, revisa que el saldo guardado de cada
 * cuenta por cobrar y por pagar sea su importe menos sus aplicaciones vigentes, y que ningún anticipo disponible ni
 * saldo a favor quede negativo. Lo que no cuadra no se corrige solo: avisa a la dueña.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md (regla 8, «Cuadre de saldos»)
 *
 * Es repetible: una vez por fecha. Si ese día ya avisó, otra vuelta no vuelve a avisar.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";

/** Una diferencia: qué cuenta o qué cliente, y lo que dice cada lado. */
export interface DiferenciaDeSaldo {
	tipo: "cuenta_por_cobrar" | "cuenta_por_pagar" | "anticipo" | "saldo_a_favor";
	id: string;
	guardado: number;
	calculado: number;
}

/** Una fila de las consultas del cuadre. */
const fila = z.object({ id: z.uuid(), guardado: z.coerce.number(), calculado: z.coerce.number() });

/**
 * Lo que no cuadra hoy, con una consulta por regla.
 * @param contexto El contexto de la transacción.
 * @returns Las diferencias, en el orden de las reglas.
 */
export async function saldosQueNoCuadran(contexto: ContextoDeAccion): Promise<DiferenciaDeSaldo[]> {
	const leer = async (tipo: DiferenciaDeSaldo["tipo"], consulta: ReturnType<typeof sql>) =>
		(await contexto.transaccion.execute(consulta)).rows.map((renglon) => ({ tipo, ...fila.parse(renglon) }));
	return [
		// El saldo de cada cuenta por cobrar: su importe menos sus aplicaciones vigentes.
		...(await leer(
			"cuenta_por_cobrar",
			sql`SELECT c.id, c.saldo_centavos AS guardado,
				c.importe_centavos - coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
					WHERE a.cuenta_por_cobrar_id = c.id AND a.estado = 'vigente'), 0) AS calculado
			 FROM cuentas_por_cobrar c ORDER BY c.id`,
		)),
		// Lo mismo con las cuentas por pagar que no se cancelaron.
		...(await leer(
			"cuenta_por_pagar",
			sql`SELECT c.id, c.saldo_centavos AS guardado,
				c.importe_centavos - coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
					WHERE a.cuenta_por_pagar_id = c.id AND a.estado = 'vigente'), 0) AS calculado
			 FROM cuentas_por_pagar c WHERE c.estado <> 'cancelada' ORDER BY c.id`,
		)),
		// El anticipo disponible de cada pedido: lo recibido y regresado menos lo aplicado y lo pasado a favor.
		...(await leer(
			"anticipo",
			sql`SELECT pedido_id AS id, 0 AS guardado,
				sum(CASE WHEN tipo IN ('recibido', 'regresado') THEN monto_centavos ELSE -monto_centavos END) AS calculado
			 FROM anticipos WHERE estado = 'vigente' GROUP BY pedido_id ORDER BY pedido_id`,
		)),
		// El saldo a favor de cada cliente: lo que entra menos lo aplicado y lo devuelto.
		...(await leer(
			"saldo_a_favor",
			sql`SELECT cliente_id AS id, 0 AS guardado,
				sum(CASE WHEN tipo = 'entra' THEN monto_centavos ELSE -monto_centavos END) AS calculado
			 FROM saldo_favor_movimientos WHERE estado = 'vigente' GROUP BY cliente_id ORDER BY cliente_id`,
		)),
	].filter((diferencia) =>
		diferencia.tipo === "cuenta_por_cobrar" || diferencia.tipo === "cuenta_por_pagar"
			? diferencia.guardado !== diferencia.calculado
			: diferencia.calculado < 0,
	);
}

/** Cómo se lee una diferencia en la bitácora. */
const queEs: Readonly<Record<DiferenciaDeSaldo["tipo"], string>> = {
	cuenta_por_cobrar: "cuenta por cobrar",
	cuenta_por_pagar: "cuenta por pagar",
	anticipo: "anticipo del pedido",
	saldo_a_favor: "saldo a favor del cliente",
};

/**
 * Cuadra los saldos y, si algo no cuadra y hoy no se ha avisado, avisa a la dueña con un renglón de bitácora del
 * sistema por las diferencias.
 * @param contexto El contexto de la transacción del trabajo.
 * @returns Las diferencias que encontró.
 */
export async function cuadrarSaldos(contexto: ContextoDeAccion): Promise<DiferenciaDeSaldo[]> {
	const diferencias = await saldosQueNoCuadran(contexto);
	if (diferencias.length === 0) return [];
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT 1 FROM avisos WHERE tipo = 'saldos_no_cuadran'
			AND (creado_en at time zone 'America/Mexico_City')::date = ${contexto.diaDeNegocio.toString()}::date LIMIT 1`);
	if (rows.length > 0) return diferencias;
	await contexto.interna("admin.crear_aviso", {
		tipo: "saldos_no_cuadran",
		destinatarios: { regla: "duena" },
		texto: `Los saldos de ${diferencias.length} ${diferencias.length === 1 ? "cuenta no cuadran" : "cuentas no cuadran"} con sus pagos: soporte ya lo está revisando`,
		enlace: "contaduria",
	});
	contexto.bitacora({
		descripcion: `El cuadre de saldos encontró ${diferencias.length} que no cuadran`,
		entidad: "cuadre_saldos",
		despues: {
			diferencias: diferencias.map((diferencia) =>
				diferencia.tipo === "cuenta_por_cobrar" || diferencia.tipo === "cuenta_por_pagar"
					? `${queEs[diferencia.tipo]} ${diferencia.id}: guarda ${enPesos(diferencia.guardado)} y sus pagos dan ${enPesos(diferencia.calculado)}`
					: `${queEs[diferencia.tipo]} ${diferencia.id}: queda en ${enPesos(diferencia.calculado)}`,
			),
		},
	});
	return diferencias;
}

export const cuadreSaldos: Trabajo = {
	nombre: "contaduria.cuadre_saldos",
	trasEventos: ["cuadre.terminado"],
	correr: async (contexto) => {
		await contexto.enTransaccion(cuadrarSaldos);
	},
};
