/**
 * `contaduria.cuentas_por_pagar`: los pagos programados por semana, los pagos detenidos con sus tres puntas y el
 * calendario de lo que se debe.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por pagar») y docs/modulos/contaduria/cuentas-por-pagar.md y
 * facturas-de-proveedor.md
 *
 * Lo programado es `antiguedadPorPagar` del dominio, aparte para proveedores y acreedores. Las tres puntas de cada orden
 * de una factura detenida son las de la conciliación de Compras (`renglonesDeConciliacion`), la misma que ve Compras.
 */

import { cuentasPorPagarDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { renglonesDeConciliacion } from "../../compras/dominio/conciliacion.ts";
import { antiguedadPorPagar } from "../dominio/saldo-por-pagar.ts";
import {
	type CuentaPorPagarLeida,
	cuandoVence,
	cuentasDeLaFabrica,
	cuentasPorPagarQueSeDeben,
	documentoDe,
	paginar,
	paraElDominio,
	pesosPara,
} from "./comun.ts";

/** Una factura detenida o esperando autorización, con su cuenta y su autorización. */
const detenidaLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	folio_proveedor: z.string(),
	proveedor: z.string(),
	estado: z.enum(["detenida", "esperando_autorizacion"]),
	motivo: z.string().nullable(),
	responsable: z.enum(["contaduria", "aduana"]),
	autorizacion: z.string().nullable(),
	saldo: z.coerce.number(),
	importe: z.coerce.number(),
	ordenes: z.string(),
});

/**
 * Los pagos detenidos: una tarjeta por factura detenida o esperando a Dirección, con sus tres puntas por orden.
 * @param contexto El contexto de la consulta.
 */
async function pagosDetenidos(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT f.id, f.version, f.folio, f.folio_proveedor,
			t.nombre AS proveedor, f.estado, f.motivo_detencion AS motivo, f.responsable_detencion AS responsable,
			a.folio AS autorizacion, c.saldo_centavos AS saldo, c.importe_centavos AS importe,
			(SELECT string_agg(o.folio, ', ' ORDER BY o.folio) FROM factura_proveedor_ordenes fo
				JOIN ordenes_compra o ON o.id = fo.orden_compra_id WHERE fo.factura_proveedor_id = f.id) AS ordenes
		FROM facturas_proveedor f
		JOIN terceros t ON t.id = f.tercero_id
		JOIN cuentas_por_pagar c ON c.factura_proveedor_id = f.id
		LEFT JOIN autorizaciones a ON a.id = f.autorizacion_id AND f.estado = 'esperando_autorizacion'
		WHERE f.estado IN ('detenida', 'esperando_autorizacion')
		ORDER BY f.folio`);
	const facturas = z.array(detenidaLeida).parse(rows);
	const conciliacion = facturas.length === 0 ? [] : await contexto.comoAccion(renglonesDeConciliacion);
	return facturas.map((factura) => ({
		factura_proveedor_id: factura.id,
		version: factura.version,
		folio: factura.folio,
		proveedor: factura.proveedor,
		saldo_centavos: factura.saldo,
		documento: `Factura ${factura.folio} · ${factura.folio_proveedor} · ${factura.ordenes}`,
		ordenes: conciliacion
			.filter((renglon) => renglon.factura === factura.folio)
			.map((renglon) => ({ folio: renglon.orden, puntas: renglon.puntos })),
		motivo: factura.motivo ?? "",
		responsable: factura.responsable,
		autorizacion: factura.autorizacion,
		cancelable: factura.estado === "detenida" && factura.saldo === factura.importe,
	}));
}

/** Lo pagado a una cuenta por depósitos de clientes, con el cliente. */
const depositoACuenta = z.object({ cuenta_id: z.uuid(), cliente: z.string(), monto: z.coerce.number() });

/**
 * La línea de abajo de cada cuenta: «{monto} pagados por {cliente}» si un cliente le depositó a ese tercero, o
 * «Autorizado por Dirección» si su factura se autorizó por lo recibido.
 * @param contexto El contexto de la consulta.
 * @param cuentas Las cuentas del calendario.
 */
async function lineasDeAbajo(contexto: ContextoDeConsulta, cuentas: readonly CuentaPorPagarLeida[]) {
	const { rows } = await contexto.base.execute(sql`SELECT a.cuenta_por_pagar_id AS cuenta_id, t.nombre AS cliente,
			sum(a.monto_centavos) AS monto
		FROM aplicaciones_pago a JOIN pagos p ON p.id = a.pago_id JOIN terceros t ON t.id = p.tercero_id
		WHERE a.estado = 'vigente' AND a.cuenta_por_pagar_id IS NOT NULL AND p.direccion = 'recibido'
		GROUP BY a.cuenta_por_pagar_id, t.nombre`);
	const depositos = Map.groupBy(z.array(depositoACuenta).parse(rows), (fila) => fila.cuenta_id);
	return new Map(
		cuentas.map((cuenta) => {
			const suyos = depositos.get(cuenta.id) ?? [];
			const abajo =
				suyos.length > 0
					? suyos.map((fila) => `${pesosPara(contexto.quien, fila.monto)} pagados por ${fila.cliente}`).join(" · ")
					: cuenta.factura_estado === "autorizada"
						? "Autorizado por Dirección"
						: null;
			return [cuenta.id, abajo];
		}),
	);
}

/**
 * Un grupo del calendario con su suma.
 * @param contexto El contexto de la consulta.
 * @param cuentas Sus cuentas.
 * @param abajo La línea de abajo de cada cuenta.
 */
function grupoDelCalendario(
	contexto: ContextoDeConsulta,
	cuentas: readonly CuentaPorPagarLeida[],
	abajo: ReadonlyMap<string, string | null>,
) {
	return {
		cuantos: cuentas.length,
		suma_centavos: cuentas.reduce((suma, cuenta) => suma + cuenta.saldo, 0),
		renglones: cuentas.map((cuenta) => ({
			cuenta_por_pagar_id: cuenta.id,
			version: cuenta.version,
			beneficiario: cuenta.beneficiario,
			tipo: cuenta.tipo,
			documento: documentoDe(cuenta),
			abajo: abajo.get(cuenta.id) ?? null,
			vence: cuenta.vence,
			vence_texto: cuandoVence(cuenta.vence, contexto.diaDeNegocio),
			saldo_centavos: cuenta.saldo,
		})),
	};
}

/**
 * Los pagos programados por semana: lo vencido, la ventana y las cuatro semanas siguientes, de proveedores y de
 * acreedores, sin lo detenido.
 * @param contexto El contexto de la consulta.
 * @param cuentas Las cuentas que se deben.
 * @param ventana `contaduria.ventana_dias`.
 */
function porSemana(contexto: ContextoDeConsulta, cuentas: readonly CuentaPorPagarLeida[], ventana: number) {
	const de = (tipo: "proveedor" | "acreedor") =>
		antiguedadPorPagar(
			cuentas.filter((cuenta) => cuenta.tipo === tipo).map(paraElDominio),
			contexto.diaDeNegocio,
			ventana,
		);
	const proveedores = de("proveedor");
	const acreedores = de("acreedor");
	return [
		{ etiqueta: "Vencido", proveedores_centavos: proveedores.vencido, acreedores_centavos: acreedores.vencido },
		{
			etiqueta: `Próximos ${ventana} días`,
			proveedores_centavos: proveedores.estaSemana,
			acreedores_centavos: acreedores.estaSemana,
		},
		...proveedores.semanas.map((monto, i) => ({
			etiqueta: `+${i + 1} sem.`,
			proveedores_centavos: monto,
			acreedores_centavos: acreedores.semanas[i] ?? 0,
		})),
	];
}

export const consultaCuentasPorPagar = implementarConsulta(
	cuentasPorPagarDeContaduria,
	async (contexto, parametros) => {
		const ventana = await parametroNumero(contexto, "contaduria.ventana_dias");
		const cuentas = await cuentasPorPagarQueSeDeben(contexto);
		const enCalendario = cuentas.filter((cuenta) => cuenta.estado !== "detenida");
		const dias = (cuenta: CuentaPorPagarLeida) =>
			contexto.diaDeNegocio.until(cuenta.vence, { largestUnit: "days" }).days;
		const abajo = await lineasDeAbajo(contexto, enCalendario);
		const posteriores = enCalendario.filter((cuenta) => dias(cuenta) >= ventana);
		const pagina = paginar(posteriores, parametros.cursor);
		return {
			resultado: {
				ventana_dias: ventana,
				total_centavos: enCalendario.reduce((suma, cuenta) => suma + cuenta.saldo, 0),
				detenidas: cuentas.length - enCalendario.length,
				por_semana: porSemana(contexto, cuentas, ventana),
				pagos_detenidos: await pagosDetenidos(contexto),
				vencidos: grupoDelCalendario(
					contexto,
					enCalendario.filter((cuenta) => dias(cuenta) < 0),
					abajo,
				),
				proximos: grupoDelCalendario(
					contexto,
					enCalendario.filter((cuenta) => dias(cuenta) >= 0 && dias(cuenta) < ventana),
					abajo,
				),
				posteriores: {
					...grupoDelCalendario(contexto, pagina.renglones, abajo),
					cuantos: posteriores.length,
					suma_centavos: posteriores.reduce((suma, cuenta) => suma + cuenta.saldo, 0),
					cursor: pagina.cursor,
					hay_mas: pagina.hay_mas,
				},
				cuentas_fabrica: await cuentasDeLaFabrica(contexto),
			},
		};
	},
);
