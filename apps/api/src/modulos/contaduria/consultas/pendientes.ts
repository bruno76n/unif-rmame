/**
 * `contaduria.pendientes` y la pastilla de Contaduría en el menú.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Quién entra», «Pendientes»)
 *
 * Las cifras salen de las funciones del dominio (la antigüedad, el saldo por pagar y el flujo). La cola junta los
 * pagos que vencen en la ventana o ya vencieron, sin lo detenido; los detenidos; los depósitos a terceros sin aplicar;
 * la cobranza vencida, uno por cliente; los saldos a favor; la nómina más vieja por pagar; el paquete del contador por
 * enviar; y las excepciones de dinero. La pastilla cuenta las facturas detenidas sin autorización, los depósitos por
 * aplicar y los pagos vencidos sin detener, y va en rojo si uno lleva `contaduria.pago_atrasado_rojo_dias` vencido.
 */

import { textoDeDiaCorto, textoDeMes } from "@uniformame/compartido/calculos/fechas";
import { pendientesDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { textoDeSemana } from "../../personal/dominio/asistencia.ts";
import { diasVencida, saldoPorTramo } from "../dominio/antiguedad.ts";
import { asistenciaDeLaNomina, cuentaDeLaNomina } from "../dominio/nomina.ts";
import { antiguedadPorPagar, saldoPorPagar } from "../dominio/saldo-por-pagar.ts";
import {
	type CuentaPorCobrarLeida,
	type CuentaPorPagarLeida,
	cortesDeAntiguedad,
	cuentasDeLaFabrica,
	cuentasPorCobrarConSaldo,
	cuentasPorPagarQueSeDeben,
	type DepositoLeido,
	depositosATerceros,
	documentoDe,
	paraElDominio,
	pesosPara,
	saldosAFavor,
	tramosDeAntiguedad,
} from "./comun.ts";
import { flujoDeHoy } from "./flujo-proximos-dias.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof pendientesDeContaduria.resultado>;
/** Un renglón de Pendientes. */
type Renglon = Resultado["renglones"][number];

/** Los días desde hoy hasta una fecha: negativo si ya pasó. */
function diasDesdeHoy(contexto: ContextoDeConsulta, fecha: string): number {
	return contexto.diaDeNegocio.until(fecha, { largestUnit: "days" }).days;
}

/**
 * Una fecha de un renglón: su texto corto y si ya pasó.
 * @param contexto El contexto de la consulta.
 * @param fecha El día.
 */
function fechaDeRenglon(contexto: ContextoDeConsulta, fecha: string): NonNullable<Renglon["fecha"]> {
	return { fecha, texto: textoDeDiaCorto(fecha), roja: diasDesdeHoy(contexto, fecha) < 0 };
}

/** Si una cuenta por pagar entra al calendario: no está detenida. */
function sinDetener(cuenta: CuentaPorPagarLeida): boolean {
	return cuenta.estado !== "detenida";
}

/**
 * Los pagos que vencen en la ventana o ya vencieron, sin lo detenido.
 * @param contexto El contexto de la consulta.
 * @param cuentas Las cuentas por pagar que se deben.
 * @param ventana `contaduria.ventana_dias`.
 */
function renglonesDePagos(
	contexto: ContextoDeConsulta,
	cuentas: readonly CuentaPorPagarLeida[],
	ventana: number,
): Renglon[] {
	return cuentas.filter(sinDetener).flatMap((cuenta) => {
		const dias = diasDesdeHoy(contexto, cuenta.vence);
		if (dias >= ventana) return [];
		const estado =
			dias < 0
				? { texto: "Vencido", color: "rojo" as const, abajo: null }
				: {
						texto: dias === 0 ? "Vence hoy" : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`,
						color: "ambar" as const,
						abajo: null,
					};
		const proveedor = cuenta.tipo === "proveedor";
		return [
			{
				clave: `pago:${cuenta.id}`,
				grupo: "pagos",
				tipo: proveedor ? "pago_proveedor" : "pago_acreedor",
				titulo: cuenta.beneficiario,
				detalle: documentoDe(cuenta),
				fecha: fechaDeRenglon(contexto, cuenta.vence),
				importe_centavos: cuenta.saldo,
				estado,
				accion: { tipo: "pagar", texto: "Pagar", principal: dias < 0, id: cuenta.id, version: cuenta.version },
			},
		];
	});
}

/** Una factura detenida o esperando autorización, con su cuenta. */
const facturaDetenida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	folio: z.string(),
	proveedor: z.string(),
	estado: z.enum(["detenida", "esperando_autorizacion"]),
	motivo: z.string().nullable(),
	responsable: z.string().nullable(),
	vence: z.string(),
	saldo: z.coerce.number(),
});

/**
 * Las facturas detenidas o esperando autorización, con el saldo y el vencimiento de su cuenta.
 * @param contexto El contexto de la consulta.
 */
async function facturasDetenidas(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT f.id, f.version, f.folio, t.nombre AS proveedor, f.estado,
			f.motivo_detencion AS motivo, f.responsable_detencion AS responsable, c.vence::text, c.saldo_centavos AS saldo
		FROM facturas_proveedor f
		JOIN terceros t ON t.id = f.tercero_id
		JOIN cuentas_por_pagar c ON c.factura_proveedor_id = f.id
		WHERE f.estado IN ('detenida', 'esperando_autorizacion')
		ORDER BY c.vence, f.folio`);
	return z.array(facturaDetenida).parse(rows);
}

/**
 * Los pagos detenidos: «Pagar lo recibido» si están a cargo de Contaduría; «Revisar» si esperan a Aduana o a Dirección.
 * @param contexto El contexto de la consulta.
 * @param facturas Las facturas detenidas o esperando autorización.
 */
function renglonesDeDetenidos(contexto: ContextoDeConsulta, facturas: z.infer<typeof facturaDetenida>[]): Renglon[] {
	return facturas.map((factura) => {
		const detenida = factura.estado === "detenida";
		const pagarLoRecibido = detenida && factura.responsable === "contaduria";
		return {
			clave: `detenido:${factura.id}`,
			grupo: "pagos",
			tipo: "pago_detenido",
			titulo: factura.proveedor,
			detalle: `${factura.folio} · ${factura.motivo ?? ""}`,
			fecha: fechaDeRenglon(contexto, factura.vence),
			importe_centavos: factura.saldo,
			estado: detenida
				? { texto: "Detenido · no cuadra", color: "rojo", abajo: null }
				: { texto: "Esperando autorización", color: "ambar", abajo: null },
			accion: pagarLoRecibido
				? {
						tipo: "pagar_lo_recibido",
						texto: "Pagar lo recibido",
						principal: false,
						id: factura.id,
						version: factura.version,
					}
				: { tipo: "revisar", texto: "Revisar", principal: false, id: null, version: null },
		};
	});
}

/**
 * Los depósitos de clientes a la cuenta de un tercero que tienen algo sin aplicar.
 * @param contexto El contexto de la consulta.
 * @param depositos Los depósitos por aplicar.
 */
function renglonesDeDepositos(contexto: ContextoDeConsulta, depositos: readonly DepositoLeido[]): Renglon[] {
	return depositos.map((deposito) => ({
		clave: `deposito:${deposito.id}`,
		grupo: "cobranza",
		tipo: "deposito_tercero",
		titulo: deposito.cliente,
		detalle: `${deposito.folio} · depositado a ${deposito.tercero}`,
		fecha: fechaDeRenglon(contexto, deposito.fecha),
		importe_centavos: deposito.queda,
		estado: { texto: "Por aplicar", color: "ambar", abajo: null },
		accion: { tipo: "aplicar", texto: "Aplicar", principal: false, id: deposito.id, version: deposito.version },
	}));
}

/**
 * La cobranza vencida, un renglón por cliente: sus notas vencidas (hasta tres folios), lo vencido y la más vieja.
 * Pasado el último tramo, «Vencido hace más de {n} días» en rojo; antes, «Vencido» en ámbar.
 * @param contexto El contexto de la consulta.
 * @param cuentas Las cuentas por cobrar con saldo.
 * @param cortes Los cortes de los tramos de antigüedad.
 */
function renglonesDeCobranza(
	contexto: ContextoDeConsulta,
	cuentas: readonly CuentaPorCobrarLeida[],
	cortes: readonly number[],
): Renglon[] {
	const vencidas = cuentas.filter((cuenta) => diasVencida(cuenta.vence, contexto.diaDeNegocio) > 0);
	const porCliente = Map.groupBy(vencidas, (cuenta) => cuenta.cliente_id);
	const ultimoCorte = cortes.at(-1) ?? 0;
	return [...porCliente.entries()].map(([clienteId, suyas]) => {
		const [primera] = suyas;
		const masVieja = Math.max(...suyas.map((cuenta) => diasVencida(cuenta.vence, contexto.diaDeNegocio)));
		const folios = suyas.slice(0, 3).map((cuenta) => cuenta.nota);
		return {
			clave: `cobranza:${clienteId}`,
			grupo: "cobranza",
			tipo: "cobranza",
			titulo: primera?.cliente ?? "",
			detalle: `${suyas.length} ${suyas.length === 1 ? "nota vencida" : "notas vencidas"} · ${folios.join(", ")}`,
			fecha: fechaDeRenglon(contexto, primera?.vence ?? contexto.diaDeNegocio.toString()),
			importe_centavos: suyas.reduce((suma, cuenta) => suma + cuenta.saldo, 0),
			estado:
				masVieja > ultimoCorte
					? { texto: `Vencido hace más de ${ultimoCorte} días`, color: "rojo", abajo: null }
					: { texto: "Vencido", color: "ambar", abajo: null },
			accion: { tipo: "ver_cliente", texto: "Ver cliente", principal: false, id: clienteId, version: null },
		};
	});
}

/**
 * Los clientes con saldo a favor sin usar.
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeSaldosAFavor(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	return (await saldosAFavor(contexto)).map((saldo) => ({
		clave: `a_favor:${saldo.cliente_id}`,
		grupo: "cobranza",
		tipo: "saldo_favor",
		titulo: saldo.nombre,
		detalle: `${pesosPara(contexto.quien, saldo.monto)} a favor sin usar`,
		fecha: fechaDeRenglon(contexto, saldo.desde),
		importe_centavos: saldo.monto,
		estado: { texto: "Por aplicar", color: "ambar", abajo: null },
		accion: { tipo: "ver_cliente", texto: "Ver cliente", principal: false, id: saldo.cliente_id, version: null },
	}));
}

/** Una nómina por pagar, o una semana que ya terminó sin cerrar su asistencia. */
const nominaPendiente = z.object({
	nomina_id: z.uuid().nullable(),
	version: z.coerce.number().nullable(),
	asistencia_semana_id: z.uuid(),
	inicio: z.string(),
	fin: z.string(),
	fecha_pago: z.string().nullable(),
});

/**
 * La nómina más vieja por pagar; si no hay, la semana más vieja que ya terminó con la asistencia sin cerrar. Con el
 * permiso de sueldos, su total sale de la misma cuenta con que se paga y su botón la paga.
 * @param contexto El contexto de la consulta.
 */
async function renglonDeNomina(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`(SELECT n.id AS nomina_id, n.version, n.asistencia_semana_id,
			n.fecha_inicio::text AS inicio, n.fecha_fin::text AS fin, n.fecha_pago::text
		FROM nominas n WHERE n.estado = 'por_pagar' ORDER BY n.fecha_inicio LIMIT 1)
		UNION ALL
		(SELECT NULL, NULL, s.id, s.fecha_inicio::text, s.fecha_fin::text, NULL
		FROM asistencia_semanas s WHERE s.estado = 'abierta' AND s.fecha_fin < ${contexto.diaDeNegocio.toString()}::date
			AND NOT EXISTS (SELECT 1 FROM nominas n WHERE n.asistencia_semana_id = s.id)
		ORDER BY s.fecha_inicio LIMIT 1)`);
	const [pendiente] = z.array(nominaPendiente).parse(rows);
	if (pendiente === undefined) return [];
	const semana = `Semana del ${textoDeSemana(pendiente.inicio, pendiente.fin)}`;
	const { nomina_id: nominaId, fecha_pago: fechaPago } = pendiente;
	if (nominaId === null || fechaPago === null) {
		return [
			{
				clave: `nomina:${pendiente.asistencia_semana_id}`,
				grupo: "nomina",
				tipo: "nomina",
				titulo: semana,
				detalle: "Personal todavía no cierra la semana",
				fecha: fechaDeRenglon(contexto, pendiente.fin),
				estado: { texto: "Asistencia sin cerrar", color: "gris", abajo: null },
				accion: { tipo: "ver_nomina", texto: "Ver nómina", principal: false, id: null, version: null },
			},
		];
	}
	const cuenta = await contexto.comoAccion(async (accion) => {
		const asistencia = await asistenciaDeLaNomina(accion, { asistenciaSemanaId: pendiente.asistencia_semana_id });
		return (await cuentaDeLaNomina(accion, { fechaFin: pendiente.fin }, asistencia)).cuenta;
	});
	const paga = veSueldosYTarifas(contexto.quien);
	return [
		{
			clave: `nomina:${nominaId}`,
			grupo: "nomina",
			tipo: "nomina",
			titulo: semana,
			detalle: `${cuenta.renglones.length} ${cuenta.renglones.length === 1 ? "persona" : "personas"}`,
			fecha: fechaDeRenglon(contexto, fechaPago),
			...(paga ? { total_nomina_centavos: cuenta.totalCentavos } : {}),
			estado: { texto: "Por pagar", color: "ambar", abajo: null },
			accion: paga
				? { tipo: "pagar_nomina", texto: "Pagar nómina", principal: true, id: nominaId, version: pendiente.version }
				: { tipo: "ver_nomina", texto: "Ver nómina", principal: false, id: null, version: null },
		},
	];
}

/** El paquete del contador por enviar. */
const paquetePorEnviar = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	mes: z.string(),
	fecha_limite: z.string(),
});

/**
 * El paquete del contador por enviar más viejo: «Por enviar», o «Vencido» pasada su fecha límite.
 * @param contexto El contexto de la consulta.
 */
async function renglonDelContador(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`SELECT id, version, mes::text, fecha_limite::text
		FROM paquetes_contador WHERE estado = 'por_enviar' ORDER BY mes`);
	return z
		.array(paquetePorEnviar)
		.parse(rows)
		.map((paquete) => {
			const vencido = diasDesdeHoy(contexto, paquete.fecha_limite) < 0;
			return {
				clave: `contador:${paquete.id}`,
				grupo: "contador_externo",
				tipo: "contador_externo",
				titulo: `Paquete de ${textoDeMes(paquete.mes).replace(" de ", " ")}`,
				detalle: "Ingresos, egresos, nómina y gastos",
				fecha: fechaDeRenglon(contexto, paquete.fecha_limite),
				estado: vencido
					? { texto: "Vencido", color: "rojo", abajo: null }
					: { texto: "Por enviar", color: "ambar", abajo: null },
				accion: {
					tipo: "preparar_paquete",
					texto: "Preparar paquete",
					principal: false,
					id: paquete.id,
					version: paquete.version,
				},
			};
		});
}

/** Cómo se nombra cada excepción de dinero. */
const nombresDeExcepcion: Readonly<Record<string, string>> = {
	totales_no_cuadran: "Los totales no cuadran",
	pago_de_pedido_cancelado: "Pago de un pedido cancelado",
	anticipo_mayor_total: "El anticipo pasa del total",
	corte_no_coincide: "El corte no coincide",
	corte_repetido: "Corte repetido",
};

/** Una excepción de dinero por resolver. */
const excepcionLeida = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	tipo: z.string(),
	descripcion: z.string(),
	documento: z.string().nullable(),
	detectada: z.string(),
});

/**
 * Las excepciones de dinero por resolver (la bandeja de Contaduría).
 * @param contexto El contexto de la consulta.
 */
async function renglonesDeExcepciones(contexto: ContextoDeConsulta): Promise<Renglon[]> {
	const { rows } = await contexto.base.execute(sql`SELECT id, version, tipo, descripcion,
			documento_folio AS documento, (detectada_en AT TIME ZONE 'America/Mexico_City')::date::text AS detectada
		FROM excepciones WHERE area = 'contaduria' AND estado = 'por_revisar' ORDER BY detectada_en`);
	return z
		.array(excepcionLeida)
		.parse(rows)
		.map((excepcion) => ({
			clave: `excepcion:${excepcion.id}`,
			grupo: "excepciones",
			tipo: "excepcion",
			titulo: nombresDeExcepcion[excepcion.tipo] ?? excepcion.descripcion,
			detalle: excepcion.documento ?? excepcion.descripcion,
			fecha: { fecha: excepcion.detectada, texto: textoDeDiaCorto(excepcion.detectada), roja: false },
			estado: { texto: "Por resolver", color: "rojo", abajo: null },
			accion: { tipo: "resolver", texto: "Resolver", principal: false, id: excepcion.id, version: excepcion.version },
		}));
}

/**
 * Las cuatro cifras de arriba.
 * @param contexto El contexto de la consulta.
 * @param leido Las cuentas por cobrar y por pagar, los cortes, la ventana y las facturas detenidas.
 */
async function cifrasDePendientes(
	contexto: ContextoDeConsulta,
	leido: {
		porCobrar: readonly CuentaPorCobrarLeida[];
		porPagar: readonly CuentaPorPagarLeida[];
		cortes: readonly number[];
		ventana: number;
		detenidas: z.infer<typeof facturaDetenida>[];
	},
): Promise<Resultado["cifras"]> {
	const hoy = contexto.diaDeNegocio;
	const cobrar = saldoPorTramo(
		leido.porCobrar.map((cuenta) => ({ vence: cuenta.vence, saldoCentavos: cuenta.saldo })),
		hoy,
		leido.cortes,
	);
	const pagar = antiguedadPorPagar(leido.porPagar.map(paraElDominio), hoy, leido.ventana);
	const { dias } = await flujoDeHoy(contexto);
	const entra = dias.reduce((suma, dia) => suma + dia.porCobrar, 0);
	const sale = dias.reduce((suma, dia) => suma + dia.porPagar, 0);
	const sumaDe = (estado: string) =>
		leido.detenidas.filter((factura) => factura.estado === estado).reduce((suma, factura) => suma + factura.saldo, 0);
	return {
		por_cobrar: {
			total_centavos: cobrar.total,
			vencido_centavos: cobrar.vencido,
			tramos: tramosDeAntiguedad(leido.cortes).map((tramo, i) => ({ ...tramo, monto_centavos: cobrar.tramos[i] ?? 0 })),
		},
		por_pagar: {
			total_centavos: saldoPorPagar(leido.porPagar.map(paraElDominio)),
			vencido_centavos: pagar.vencido,
			tramos: [
				{ etiqueta: "Vencido", color: "rojo", monto_centavos: pagar.vencido },
				{ etiqueta: `Próximos ${leido.ventana} días`, color: "ambar", monto_centavos: pagar.estaSemana },
				{
					etiqueta: "Después",
					color: "gris",
					monto_centavos: pagar.semanas.reduce((suma, semana) => suma + semana, 0) + pagar.despues,
				},
			],
		},
		flujo: { entra_centavos: entra, sale_centavos: sale, neto_centavos: entra - sale, positivo: entra - sale > 0 },
		detenidos: {
			monto_centavos: sumaDe("detenida") + sumaDe("esperando_autorizacion"),
			cuantos: leido.detenidas.length,
			tramos: [
				{ etiqueta: "Por resolver", color: "rojo", monto_centavos: sumaDe("detenida") },
				{ etiqueta: "Esperando autorización", color: "ambar", monto_centavos: sumaDe("esperando_autorizacion") },
			],
		},
	};
}

/**
 * La pastilla de Contaduría: las facturas detenidas sin autorización, los depósitos por aplicar y los pagos vencidos
 * sin detener; en rojo si un pago lleva `contaduria.pago_atrasado_rojo_dias` días vencido.
 * @param contexto El contexto de la consulta.
 */
export async function pastillaContaduria(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const rojoDesde = await parametroNumero(contexto, "contaduria.pago_atrasado_rojo_dias");
	const porPagar = await cuentasPorPagarQueSeDeben(contexto);
	const vencidos = porPagar
		.filter(sinDetener)
		.map((cuenta) => diasVencida(cuenta.vence, contexto.diaDeNegocio))
		.filter((dias) => dias > 0);
	const detenidas = (await facturasDetenidas(contexto)).filter((factura) => factura.estado === "detenida").length;
	const depositos = (await depositosATerceros(contexto, { porAplicar: true })).length;
	return { conteo: detenidas + depositos + vencidos.length, rojo: vencidos.some((dias) => dias >= rojoDesde) };
}

export const consultaPendientesContaduria = implementarConsulta(
	pendientesDeContaduria,
	async (contexto, parametros) => {
		const ventana = await parametroNumero(contexto, "contaduria.ventana_dias");
		const cortes = await cortesDeAntiguedad(contexto);
		const porCobrar = await cuentasPorCobrarConSaldo(contexto);
		const porPagar = await cuentasPorPagarQueSeDeben(contexto);
		const detenidas = await facturasDetenidas(contexto);
		const renglones = [
			...renglonesDePagos(contexto, porPagar, ventana),
			...renglonesDeDetenidos(contexto, detenidas),
			...renglonesDeDepositos(contexto, await depositosATerceros(contexto, { porAplicar: true })),
			...renglonesDeCobranza(contexto, porCobrar, cortes),
			...(await renglonesDeSaldosAFavor(contexto)),
			...(await renglonDeNomina(contexto)),
			...(await renglonDelContador(contexto)),
			...(await renglonesDeExcepciones(contexto)),
		];
		const cuantos = (grupo: Renglon["grupo"]) => renglones.filter((renglon) => renglon.grupo === grupo).length;
		const grupo = parametros.grupo ?? "todos";
		// Sin «ven sueldos y tarifas», el total de la nómina no se calcula ni viaja.
		const nominaSinTotal = renglones.some((renglon) => renglon.tipo === "nomina") && !veSueldosYTarifas(contexto.quien);
		return {
			resultado: {
				ventana_dias: ventana,
				cifras: await cifrasDePendientes(contexto, { porCobrar, porPagar, cortes, ventana, detenidas }),
				renglones: grupo === "todos" ? renglones : renglones.filter((renglon) => renglon.grupo === grupo),
				conteos: {
					todos: renglones.length,
					pagos: cuantos("pagos"),
					cobranza: cuantos("cobranza"),
					nomina: cuantos("nomina"),
					contador_externo: cuantos("contador_externo"),
					excepciones: cuantos("excepciones"),
				},
				cuentas_fabrica: await cuentasDeLaFabrica(contexto),
			},
			...(nominaSinTotal ? { recortado: ["total_nomina_centavos"] } : {}),
		};
	},
);
