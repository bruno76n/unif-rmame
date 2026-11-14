/**
 * `contaduria.antiguedad_saldos`: lo de arriba de Cuentas por cobrar (el saldo por tramo, la cobranza por forma de
 * recepción y lo cobrado por semana), la antigüedad de saldos por cliente con su crédito y su semáforo, los depósitos a
 * terceros por aplicar, los saldos a favor y los anticipos de pedidos.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por cobrar») y docs/modulos/contaduria/cuentas-por-cobrar.md
 * y credito-de-clientes.md
 *
 * La antigüedad es `saldoPorTramo` y el semáforo sugerido es `semaforoSugerido`, del dominio. Salen los clientes con
 * saldo y los de semáforo distinto de «Al corriente», del que más debe al que menos.
 */

import { sumarCentavos } from "@uniformame/compartido/calculos/dinero";
import { inicioDeSemana, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { antiguedadSaldos } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { saldoPorTramo } from "../dominio/antiguedad.ts";
import { type SemaforoDeCredito, semaforoSugerido } from "../dominio/semaforo-sugerido.ts";
import {
	type CuentaPorCobrarLeida,
	cortesDeAntiguedad,
	cuentasPorCobrarConSaldo,
	cuentasPorPagarQueSeDeben,
	depositosATerceros,
	documentoDe,
	paginar,
	saldosAFavor,
	tramosDeAntiguedad,
} from "./comun.ts";

/** Cómo se lee cada semáforo. */
export const textosDeSemaforo: Readonly<Record<SemaforoDeCredito, string>> = {
	al_corriente: "Al corriente",
	cerca_del_limite: "Cerca del límite",
	detenido: "Detenido",
};

/** El semáforo con su texto. */
export function semaforoConTexto(clave: SemaforoDeCredito) {
	return { clave, texto: textosDeSemaforo[clave] };
}

/** El crédito de un cliente, con su nombre y su municipio. */
const creditoLeido = z.object({
	cliente_id: z.uuid(),
	nombre: z.string(),
	municipio: z.string(),
	limite: z.coerce.number(),
	semaforo: z.enum(["al_corriente", "cerca_del_limite", "detenido"]),
	version: z.coerce.number(),
});

/**
 * Los parámetros del semáforo sugerido.
 * @param contexto El contexto de la consulta.
 */
export async function parametrosDelSemaforo(contexto: ContextoDeConsulta) {
	return {
		diasVencidoDetenido: await parametroNumero(contexto, "contaduria.credito_dias_vencido_detenido"),
		porcentajeCercaLimite: String(
			await contexto.lectura("admin.parametro", { clave: "contaduria.credito_porcentaje_cerca_limite" }),
		),
	};
}

/**
 * Los clientes con saldo o con un semáforo distinto de «Al corriente», del que más debe al que menos.
 * @param contexto El contexto de la consulta.
 * @param cuentas Las cuentas por cobrar con saldo.
 * @param cortes Los cortes de los tramos.
 */
async function clientesConSaldo(
	contexto: ContextoDeConsulta,
	cuentas: readonly CuentaPorCobrarLeida[],
	cortes: readonly number[],
) {
	const { rows } = await contexto.base.execute(sql`SELECT c.cliente_id, t.nombre, cl.municipio,
			c.limite_centavos AS limite, c.semaforo, c.version
		FROM credito_clientes c JOIN clientes cl ON cl.id = c.cliente_id JOIN terceros t ON t.id = c.tercero_id
		ORDER BY t.nombre`);
	const parametros = await parametrosDelSemaforo(contexto);
	const porCliente = Map.groupBy(cuentas, (cuenta) => cuenta.cliente_id);
	return z
		.array(creditoLeido)
		.parse(rows)
		.flatMap((credito) => {
			const suyas = (porCliente.get(credito.cliente_id) ?? []).map((cuenta) => ({
				vence: cuenta.vence,
				saldoCentavos: cuenta.saldo,
			}));
			if (suyas.length === 0 && credito.semaforo === "al_corriente") return [];
			const tramos = saldoPorTramo(suyas, contexto.diaDeNegocio, cortes);
			const calculado = semaforoSugerido({
				limiteCentavos: credito.limite,
				cuentas: suyas,
				hoy: contexto.diaDeNegocio,
				...parametros,
			});
			return [
				{
					cliente_id: credito.cliente_id,
					nombre: credito.nombre,
					detalle: `${suyas.length} ${suyas.length === 1 ? "nota" : "notas"} · ${credito.municipio}`,
					saldo_centavos: tramos.total,
					por_tramo: tramos.tramos.map((monto) => ({ monto_centavos: monto })),
					vencido_mas_centavos: tramos.vencidoDeMas,
					vencido_centavos: tramos.vencido,
					limite_centavos: credito.limite,
					uso_porcentaje: calculado.usoPorcentaje,
					uso_tono: calculado.pasaElLimite
						? ("rojo" as const)
						: calculado.cercaDelLimite
							? ("ambar" as const)
							: ("verde" as const),
					semaforo: semaforoConTexto(credito.semaforo),
					sugerido: calculado.sugerido === credito.semaforo ? null : semaforoConTexto(calculado.sugerido),
					version_credito: credito.version,
				},
			];
		})
		.sort((uno, otro) => otro.saldo_centavos - uno.saldo_centavos || uno.nombre.localeCompare(otro.nombre));
}

/**
 * Lo cobrado en un periodo por forma de recepción: en una cuenta de la fábrica, en efectivo o a la cuenta de un tercero.
 * @param contexto El contexto de la consulta.
 * @param desde El primer día.
 * @param hasta El último día.
 */
async function cobradoPorForma(contexto: ContextoDeConsulta, desde: string, hasta: string) {
	const { rows } = await contexto.base.execute(sql`SELECT medio, sum(monto_centavos) AS monto FROM pagos
		WHERE direccion = 'recibido' AND estado = 'registrado' AND fecha BETWEEN ${desde}::date AND ${hasta}::date
		GROUP BY medio`);
	const porMedio = new Map(
		z
			.array(z.object({ medio: z.string(), monto: z.coerce.number() }))
			.parse(rows)
			.map((fila) => [fila.medio, fila.monto]),
	);
	return {
		fabrica_centavos: porMedio.get("cuenta_fabrica") ?? 0,
		efectivo_centavos: porMedio.get("efectivo") ?? 0,
		tercero_centavos: porMedio.get("cuenta_tercero") ?? 0,
	};
}

/**
 * Lo cobrado cada una de las últimas semanas, de lunes a domingo, con la que corre al final.
 * @param contexto El contexto de la consulta.
 * @param semanas Cuántas.
 */
async function cobradoPorSemana(contexto: ContextoDeConsulta, semanas: number) {
	const actual = inicioDeSemana(contexto.diaDeNegocio);
	const lunes = Array.from({ length: semanas }, (_, i) => actual.subtract({ weeks: semanas - 1 - i }));
	const { rows } = await contexto.base.execute(sql`SELECT date_trunc('week', fecha)::date::text AS lunes,
			sum(monto_centavos) AS monto
		FROM pagos WHERE direccion = 'recibido' AND estado = 'registrado' AND fecha >= ${lunes[0]?.toString()}::date
		GROUP BY 1`);
	const porLunes = new Map(
		z
			.array(z.object({ lunes: z.string(), monto: z.coerce.number() }))
			.parse(rows)
			.map((fila) => [fila.lunes, fila.monto]),
	);
	return lunes.map((dia, i) => ({
		lunes: dia.toString(),
		texto: textoDeDiaCorto(dia),
		actual: i === semanas - 1,
		monto_centavos: porLunes.get(dia.toString()) ?? 0,
	}));
}

/**
 * Los depósitos a terceros por aplicar, cada uno con las deudas abiertas no detenidas de su tercero.
 * @param contexto El contexto de la consulta.
 */
async function depositosPorAplicar(contexto: ContextoDeConsulta) {
	const depositos = await depositosATerceros(contexto, { porAplicar: true });
	const deudas = (await cuentasPorPagarQueSeDeben(contexto)).filter((cuenta) => cuenta.estado !== "detenida");
	return depositos.map((deposito) => {
		const dias = Math.max(0, contexto.diaDeNegocio.since(deposito.fecha, { largestUnit: "days" }).days);
		return {
			pago_id: deposito.id,
			version: deposito.version,
			folio: deposito.folio,
			fecha: deposito.fecha,
			detalle_fecha: `${textoDeDiaCorto(deposito.fecha)} · hace ${dias} ${dias === 1 ? "día" : "días"}`,
			cliente: deposito.cliente,
			documento: deposito.documento,
			tercero: deposito.tercero,
			referencia: deposito.referencia,
			monto_centavos: deposito.monto,
			queda_centavos: deposito.queda,
			deudas: deudas
				.filter((cuenta) => cuenta.tercero_id === deposito.tercero_id)
				.map((cuenta) => ({
					cuenta_por_pagar_id: cuenta.id,
					documento: documentoDe(cuenta),
					saldo_centavos: cuenta.saldo,
				})),
		};
	});
}

/** El anticipo de un pedido. */
const anticipoLeido = z.object({
	pedido_id: z.uuid(),
	folio: z.string(),
	cliente: z.string(),
	estado: z.string(),
	recibido: z.coerce.number(),
	aplicado: z.coerce.number(),
});

/** Lo que regresa `ventas.pedido_para_cobro`: el total del pedido. */
const paraCobro = z.object({ total_centavos: z.number() });

/** El estado de un pedido como se pinta en «Anticipos de pedidos». */
const estadosDePedido: Readonly<Record<string, { texto: string; color: "azul" | "verde" | "rojo" | "gris" }>> = {
	confirmado: { texto: "Confirmado", color: "azul" },
	entregado: { texto: "Entregado", color: "verde" },
	cancelado: { texto: "Cancelado", color: "rojo" },
	borrador: { texto: "Borrador", color: "gris" },
};

/**
 * Los pedidos con anticipo: lo recibido, lo aplicado a sus notas (sin lo regresado) y su total, de Ventas.
 * @param contexto El contexto de la consulta.
 */
async function anticiposDePedidos(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT a.pedido_id, p.folio, t.nombre AS cliente, p.estado,
			sum(a.monto_centavos) FILTER (WHERE a.tipo = 'recibido') AS recibido,
			coalesce(sum(a.monto_centavos) FILTER (WHERE a.tipo = 'aplicado'), 0)
				- coalesce(sum(a.monto_centavos) FILTER (WHERE a.tipo = 'regresado'), 0) AS aplicado
		FROM anticipos a JOIN pedidos p ON p.id = a.pedido_id JOIN clientes c ON c.id = p.cliente_id
		JOIN terceros t ON t.id = c.tercero_id
		WHERE a.estado = 'vigente'
		GROUP BY a.pedido_id, p.folio, t.nombre, p.estado
		HAVING sum(a.monto_centavos) FILTER (WHERE a.tipo = 'recibido') > 0
		ORDER BY p.folio DESC`);
	const pedidos = z.array(anticipoLeido).parse(rows);
	return Promise.all(
		pedidos.map(async (pedido) => ({
			pedido_id: pedido.pedido_id,
			folio: pedido.folio,
			cliente: pedido.cliente,
			estado: { ...(estadosDePedido[pedido.estado] ?? { texto: pedido.estado, color: "gris" as const }), abajo: null },
			anticipo_centavos: pedido.recibido,
			aplicado_centavos: pedido.aplicado,
			total_centavos: paraCobro.parse(
				await contexto.lectura("ventas.pedido_para_cobro", { pedido_id: pedido.pedido_id }),
			).total_centavos,
		})),
	);
}

export const consultaAntiguedadSaldos = implementarConsulta(antiguedadSaldos, async (contexto, parametros) => {
	const cortes = await cortesDeAntiguedad(contexto);
	const cuentas = await cuentasPorCobrarConSaldo(contexto);
	const total = saldoPorTramo(
		cuentas.map((cuenta) => ({ vence: cuenta.vence, saldoCentavos: cuenta.saldo })),
		contexto.diaDeNegocio,
		cortes,
	);
	const hoy = contexto.diaDeNegocio;
	const desde = parametros.desde ?? hoy.with({ day: 1 }).toString();
	const hasta = parametros.hasta ?? hoy.toString();
	const pagina = paginar(await clientesConSaldo(contexto, cuentas, cortes), parametros.cursor);
	const depositos = await depositosPorAplicar(contexto);
	return {
		resultado: {
			tramos: tramosDeAntiguedad(cortes),
			por_cobrar: {
				total_centavos: total.total,
				por_tramo: total.tramos.map((monto) => ({ monto_centavos: monto })),
				por_forma: await cobradoPorForma(contexto, desde, hasta),
			},
			cobrado_por_semana: await cobradoPorSemana(contexto, parametros.semanas ?? 8),
			clientes: pagina.renglones,
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
			depositos,
			depositos_queda_centavos: sumarCentavos(depositos.map((deposito) => deposito.queda_centavos)),
			saldos_a_favor: (await saldosAFavor(contexto)).map((saldo) => ({
				cliente_id: saldo.cliente_id,
				nombre: saldo.nombre,
				monto_centavos: saldo.monto,
			})),
			anticipos: await anticiposDePedidos(contexto),
		},
	};
});
