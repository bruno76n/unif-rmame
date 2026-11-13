/**
 * La cuenta del paquete del contador: qué suma cada concepto de un mes, y qué gastos entran en él. La cuenta es una
 * función pura; la lectura de lo que lleva el mes, aparte.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md (reglas 2 a 4, «Lo que lleva el paquete»)
 *
 * La usan «Marcar como enviado», que congela lo que da, y la consulta del paquete (fase 19), que la muestra al momento
 * mientras no se manda.
 */

import { textoDeMes } from "@uniformame/compartido/calculos/fechas";
import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import {
	anticipos,
	aplicacionesPago,
	type ConceptoDelPaquete,
	conceptosDelPaquete,
	gastos,
	nominas,
	pagos,
	paquetesContador,
} from "../tablas.ts";

/** Un documento del mes que suma a un concepto (todo menos los gastos). */
export interface MovimientoDelPaquete {
	concepto: Exclude<ConceptoDelPaquete, "gasto">;
	/** Su fecha: la del pago, la del renglón del anticipo, la de la aplicación o el día en que se pagó la nómina. */
	fecha: string;
	montoCentavos: number;
}

/** Un gasto, con su paquete si ya salió en uno. */
export interface GastoDelPaquete {
	id: string;
	fecha: string;
	categoriaId: string;
	montoCentavos: number;
	paqueteContadorId: string | null;
	cancelado: boolean;
}

/** Un renglón del paquete. */
export interface RenglonDelPaquete {
	concepto: ConceptoDelPaquete;
	categoriaId: string | null;
	deMesesAnteriores: boolean;
	montoCentavos: number;
	documentos: number;
}

/**
 * El mes de una fecha: su primer día.
 * @param fecha Una fecha `AAAA-MM-DD`.
 */
export function mesDe(fecha: string): string {
	return `${fecha.slice(0, 7)}-01`;
}

/**
 * La cuenta del paquete de un mes (reglas 2 a 4): cada concepto con lo de ese mes, aunque sea cero; y los gastos que
 * entran, por categoría: los de ese mes que no han salido en ningún paquete, y aparte, «de meses anteriores», los de
 * un mes cuyo paquete ya se mandó y que tampoco han salido.
 * @param mes El primer día del mes.
 * @param movimientos Lo que suma a cada concepto (los de otros meses se ignoran).
 * @param gastosDelPaquete Los gastos sin paquete hasta el fin del mes (los cancelados y los de otro paquete se ignoran).
 * @param mesesEnviados Los meses cuyo paquete ya se mandó.
 * @returns Los renglones y los gastos que entran, para ligarlos al paquete al mandarlo.
 * Es pura: así «Marcar como enviado» congela exactamente lo que la pantalla mostraba, y la prueba al azar la recorre.
 */
export function cuentaDelPaquete(
	mes: string,
	movimientos: readonly MovimientoDelPaquete[],
	gastosDelPaquete: readonly GastoDelPaquete[],
	mesesEnviados: ReadonlySet<string>,
): { renglones: RenglonDelPaquete[]; gastoIds: string[] } {
	const renglones: RenglonDelPaquete[] = conceptosDelPaquete
		.filter((concepto) => concepto !== "gasto")
		.map((concepto) => {
			const delMes = movimientos.filter(
				(movimiento) => movimiento.concepto === concepto && mesDe(movimiento.fecha) === mes,
			);
			return {
				concepto,
				categoriaId: null,
				deMesesAnteriores: false,
				montoCentavos: delMes.reduce((suma, movimiento) => suma + movimiento.montoCentavos, 0),
				documentos: delMes.length,
			};
		});
	// Los gastos que entran: los del mes y los que llegaron tarde a un mes ya mandado (regla 4).
	const entran = gastosDelPaquete.filter(
		(gasto) =>
			!gasto.cancelado &&
			gasto.paqueteContadorId === null &&
			(mesDe(gasto.fecha) === mes || (mesDe(gasto.fecha) < mes && mesesEnviados.has(mesDe(gasto.fecha)))),
	);
	const porCategoria = new Map<string, RenglonDelPaquete>();
	for (const gasto of entran) {
		const deMesesAnteriores = mesDe(gasto.fecha) !== mes;
		const llave = `${gasto.categoriaId}:${deMesesAnteriores}`;
		const renglon = porCategoria.get(llave) ?? {
			concepto: "gasto",
			categoriaId: gasto.categoriaId,
			deMesesAnteriores,
			montoCentavos: 0,
			documentos: 0,
		};
		renglon.montoCentavos += gasto.montoCentavos;
		renglon.documentos += 1;
		porCategoria.set(llave, renglon);
	}
	const deGastos = [...porCategoria.values()].sort(
		(uno, otro) =>
			Number(uno.deMesesAnteriores) - Number(otro.deMesesAnteriores) ||
			(uno.categoriaId ?? "").localeCompare(otro.categoriaId ?? ""),
	);
	return { renglones: [...renglones, ...deGastos], gastoIds: entran.map((gasto) => gasto.id) };
}

/**
 * Lee lo que lleva un mes: los pagos, los anticipos aplicados, lo abonado a cuentas por pagar y las nóminas pagadas de
 * ese mes; los gastos sin paquete hasta su fin, con candado; y los meses ya mandados, leídos después del candado.
 * La usan `marcar_paquete_enviado` (con candado) y la pestaña Contador externo, que solo lee y la pide sin candado.
 * @param transaccion La transacción.
 * @param mes El primer día del mes.
 * @param opciones `conCandado: false` en una transacción de solo lectura: lee lo mismo sin bloquear los gastos.
 */
export async function lecturaDelPaquete(transaccion: Transaccion, mes: string, { conCandado = true } = {}) {
	const siguiente = Temporal.PlainDate.from(mes).add({ months: 1 }).toString();
	const enElMes = (columna: typeof pagos.fecha | typeof anticipos.fecha | typeof aplicacionesPago.fecha) =>
		and(gte(columna, mes), lt(columna, siguiente));
	const movimientos: MovimientoDelPaquete[] = [];
	// Los pagos: cobranza a notas, anticipos a pedidos y devoluciones de saldo a favor.
	const deLosPagos = await transaccion
		.select({ direccion: pagos.direccion, concepto: pagos.concepto, fecha: pagos.fecha, monto: pagos.montoCentavos })
		.from(pagos)
		.where(and(eq(pagos.estado, "registrado"), enElMes(pagos.fecha)));
	for (const pago of deLosPagos) {
		const concepto =
			pago.direccion === "recibido"
				? pago.concepto === "nota"
					? "cobranza_clientes"
					: "anticipos_recibidos"
				: pago.concepto === "devolucion_saldo_favor"
					? "devoluciones_saldo_favor"
					: null;
		if (concepto !== null) movimientos.push({ concepto, fecha: pago.fecha, montoCentavos: pago.monto });
	}
	// Los anticipos que se descontaron de una nota: informativo.
	const aplicados = await transaccion
		.select({ fecha: anticipos.fecha, monto: anticipos.montoCentavos })
		.from(anticipos)
		.where(and(eq(anticipos.tipo, "aplicado"), eq(anticipos.estado, "vigente"), enElMes(anticipos.fecha)));
	for (const aplicado of aplicados) {
		movimientos.push({ concepto: "anticipos_aplicados", fecha: aplicado.fecha, montoCentavos: aplicado.monto });
	}
	// Lo abonado a cuentas por pagar: pagos emitidos, depósitos de clientes a terceros y compensaciones.
	const abonos = await transaccion
		.select({ fecha: aplicacionesPago.fecha, monto: aplicacionesPago.montoCentavos })
		.from(aplicacionesPago)
		.where(
			and(
				eq(aplicacionesPago.estado, "vigente"),
				isNotNull(aplicacionesPago.cuentaPorPagarId),
				enElMes(aplicacionesPago.fecha),
			),
		);
	for (const abono of abonos) {
		movimientos.push({ concepto: "pagos_proveedores_acreedores", fecha: abono.fecha, montoCentavos: abono.monto });
	}
	// Las nóminas, en el mes en que se pagaron (hora de México).
	const diaDePago = sql<string>`((${nominas.pagadaEn} at time zone 'America/Mexico_City')::date)::text`;
	const pagadas = await transaccion
		.select({ fecha: diaDePago, monto: nominas.totalCentavos })
		.from(nominas)
		.where(and(eq(nominas.estado, "pagada"), sql`${diaDePago} >= ${mes} and ${diaDePago} < ${siguiente}`));
	for (const nomina of pagadas) {
		movimientos.push({ concepto: "nomina", fecha: nomina.fecha, montoCentavos: nomina.monto ?? 0 });
	}
	const deLosGastos = transaccion
		.select({
			id: gastos.id,
			fecha: gastos.fecha,
			categoriaId: gastos.categoriaId,
			montoCentavos: gastos.montoCentavos,
			paqueteContadorId: gastos.paqueteContadorId,
			cancelado: sql<boolean>`${gastos.estado} = 'cancelado'`,
		})
		.from(gastos)
		.where(and(isNull(gastos.paqueteContadorId), eq(gastos.estado, "registrado"), lt(gastos.fecha, siguiente)))
		// Con candado y en orden de id: una cancelación o el envío de otro mes a la vez se ponen en fila, y al soltarse
		// Postgres vuelve a revisar la condición, así que el gasto que ya se canceló o ya salió en otro paquete no entra.
		.orderBy(asc(gastos.id));
	const gastosDelPaquete = conCandado ? await deLosGastos.for("update") : await deLosGastos;
	const enviados = await transaccion
		.select({ mes: paquetesContador.mes })
		.from(paquetesContador)
		.where(eq(paquetesContador.estado, "enviado"));
	return { movimientos, gastos: gastosDelPaquete, mesesEnviados: new Set(enviados.map((paquete) => paquete.mes)) };
}

/**
 * Si el paquete del mes de una fecha ya se mandó, su mes en palabras; si no (o no existe todavía), nada. Lee el paquete
 * con candado compartido: si se está mandando a la vez, espera y ve lo que quedó.
 * @param transaccion La transacción.
 * @param fecha La fecha del pago, la compensación o el gasto.
 * Lo usan cancelar un pago, una compensación o un gasto (`paquete_ya_enviado`) y registrar un gasto (su aviso).
 */
export async function mesYaEnviado(transaccion: Transaccion, fecha: string): Promise<string | null> {
	const [paquete] = await transaccion
		.select({ estado: paquetesContador.estado })
		.from(paquetesContador)
		.where(eq(paquetesContador.mes, mesDe(fecha)))
		.for("share");
	return paquete?.estado === "enviado" ? textoDeMes(mesDe(fecha)) : null;
}
