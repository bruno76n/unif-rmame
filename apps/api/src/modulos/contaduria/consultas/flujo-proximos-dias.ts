/**
 * `contaduria.flujo_proximos_dias`: lo que vence por cobrar y por pagar cada uno de los próximos días.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Flujo de los próximos {n} días») y
 * docs/modulos/contaduria/cuentas-por-pagar.md («La antigüedad y el saldo por pagar»)
 *
 * La cuenta es `flujoDeLosProximosDias` del dominio: sin lo detenido ni lo ya vencido. Lo usan también las cifras de
 * Pendientes.
 */

import { flujoProximosDias } from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { Temporal } from "temporal-polyfill";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { type DiaDelFlujo, flujoDeLosProximosDias } from "../dominio/saldo-por-pagar.ts";
import { cuentasPorCobrarConSaldo, cuentasPorPagarQueSeDeben, paraElDominio } from "./comun.ts";

/**
 * El flujo de los próximos días con las cuentas de hoy.
 * @param contexto El contexto de la consulta.
 * @returns La ventana y lo de cada día.
 */
export async function flujoDeHoy(contexto: ContextoDeConsulta): Promise<{ ventana: number; dias: DiaDelFlujo[] }> {
	const ventana = await parametroNumero(contexto, "contaduria.ventana_dias");
	const porCobrar = await cuentasPorCobrarConSaldo(contexto);
	const porPagar = await cuentasPorPagarQueSeDeben(contexto);
	const dias = flujoDeLosProximosDias(
		porCobrar.map((cuenta) => ({ vence: cuenta.vence, saldoCentavos: cuenta.saldo })),
		porPagar.map(paraElDominio),
		contexto.diaDeNegocio,
		ventana,
	);
	return { ventana, dias };
}

/**
 * Cómo se lee un día en la gráfica: «dom 11».
 * @param dia El día.
 */
function textoDelDia(dia: string): string {
	const fecha = Temporal.PlainDate.from(dia);
	const nombre = fecha.toLocaleString("es-MX", { weekday: "short" }).replace(".", "");
	return `${nombre} ${fecha.day}`;
}

export const consultaFlujoProximosDias = implementarConsulta(flujoProximosDias, async (contexto) => {
	const { ventana, dias } = await flujoDeHoy(contexto);
	return {
		resultado: {
			ventana_dias: ventana,
			dias: dias.map((dia, i) => ({
				dia: dia.dia,
				texto: textoDelDia(dia.dia),
				hoy: i === 0,
				entra_centavos: dia.porCobrar,
				sale_centavos: dia.porPagar,
			})),
		},
	};
});
