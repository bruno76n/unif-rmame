/**
 * Los contratos de las consultas de lo que se cobra: `contaduria.antiguedad_saldos` y `contaduria.pagos_recibidos`
 * (la pestaña Cuentas por cobrar), `contaduria.cliente` (el cajón del cliente, consulta sensible) y
 * `contaduria.registrar_pago_opciones` (el cajón Registrar pago). Solo las pide Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por cobrar», «El cliente», «Registrar pago»)
 *
 * Los estados, los semáforos y los textos llegan armados; los montos, en su campo `*_centavos`.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { semaforoDeCredito } from "./credito.ts";
import { cuentasFabrica, cursor, estadoArmado, fechaConTexto, monto, opcion, pagina } from "./vistas.ts";

/** Un tramo de antigüedad: por vencer, 1 a 15 días, 16 a 30 días, más de 30. */
const tramoDeAntiguedad = z.object({
	etiqueta: z.string().describe("«Por vencer», «1 a 15 días»…"),
	color: colorDeEstado,
});

/** Un semáforo con su texto. */
const semaforoConTexto = z.object({
	clave: semaforoDeCredito,
	texto: z.string().describe("«Al corriente», «Cerca del límite» o «Detenido»"),
});

/** Dónde se recibió un pago, ya escrito: «Efectivo», «Cuenta de la fábrica» o «Cuenta de {tercero}». */
const dondeSeRecibio = z.string().describe("«Efectivo», «Cuenta de la fábrica» o «Cuenta de {tercero}»");

export const antiguedadSaldos = definirConsulta({
	nombre: "contaduria.antiguedad_saldos",
	descripcion:
		"Cuentas por cobrar: el saldo por tramo, la cobranza del mes por forma de recepción, lo cobrado por semana, la antigüedad de saldos por cliente con su crédito y su semáforo, los depósitos a terceros por aplicar, los saldos a favor y los anticipos de pedidos",
	entrada: z.object({
		desde: z.iso.date().optional().describe("El primer día del periodo de la cobranza; sin él, el primero del mes"),
		hasta: z.iso.date().optional().describe("El último día del periodo; sin él, hoy"),
		semanas: z.coerce.number().int().min(1).max(26).optional().describe("Cuántas semanas de lo cobrado; sin él, 8"),
		cursor,
	}),
	salida: z.object({
		tramos: z.array(tramoDeAntiguedad).describe("Los tramos de `contaduria.antiguedad_tramos_dias`, en orden"),
		por_cobrar: z.object({
			total_centavos: monto,
			por_tramo: z.array(z.object({ monto_centavos: monto })).describe("Uno por tramo, en el orden de `tramos`"),
			por_forma: z.object({
				fabrica_centavos: monto.describe("Cobrado en una cuenta de la fábrica en el periodo"),
				efectivo_centavos: monto.describe("Cobrado en efectivo"),
				tercero_centavos: monto.describe("Depositado a la cuenta de un tercero"),
			}),
		}),
		cobrado_por_semana: z.array(
			z.object({
				lunes: z.iso.date(),
				texto: z.string().describe("«3 nov»"),
				actual: z.boolean().describe("La semana que corre"),
				monto_centavos: monto,
			}),
		),
		clientes: z.array(
			z.object({
				cliente_id: z.uuid(),
				nombre: z.string(),
				detalle: z.string().describe("«{n} notas · {municipio}»"),
				saldo_centavos: monto,
				por_tramo: z.array(z.object({ monto_centavos: monto })).describe("Uno por tramo"),
				vencido_mas_centavos: monto.describe("Lo vencido de más del último corte"),
				vencido_centavos: monto.describe("Todo lo vencido"),
				limite_centavos: monto.describe("Su límite; 0 es sin crédito"),
				uso_porcentaje: z.number().int().nullable().describe("El saldo entre el límite; nulo sin crédito"),
				uso_tono: z.enum(["verde", "ambar", "rojo"]).describe("Verde; ámbar desde el porcentaje; rojo si lo pasa"),
				semaforo: semaforoConTexto,
				sugerido: semaforoConTexto.nullable().describe("El que sugiere el sistema, si es otro"),
				version_credito: z.number().int(),
			}),
		),
		...pagina,
		depositos: z.array(
			z.object({
				pago_id: z.uuid(),
				version: z.number().int(),
				folio: z.string(),
				fecha: z.iso.date(),
				detalle_fecha: z.string().describe("«{fecha} · hace {n} días»"),
				cliente: z.string(),
				documento: z.string().describe("La nota o el pedido del pago"),
				tercero: z.string().describe("A quién se le depositó"),
				referencia: z.string().nullable(),
				monto_centavos: monto,
				queda_centavos: monto.describe("Lo que queda sin aplicar"),
				deudas: z.array(
					z.object({
						cuenta_por_pagar_id: z.uuid(),
						documento: z.string().describe("«FP-8841» o «PR-08 · mensualidad 3 de 12»"),
						saldo_centavos: monto,
					}),
				),
			}),
		),
		depositos_queda_centavos: monto.describe("Lo que queda sin aplicar de todos los depósitos a terceros"),
		saldos_a_favor: z.array(z.object({ cliente_id: z.uuid(), nombre: z.string(), monto_centavos: monto })),
		anticipos: z.array(
			z.object({
				pedido_id: z.uuid(),
				folio: z.string(),
				cliente: z.string(),
				estado: estadoArmado,
				anticipo_centavos: monto.describe("Lo recibido, sin lo cancelado"),
				aplicado_centavos: monto.describe("Lo que se descontó de sus notas"),
				total_centavos: monto.describe("El total del pedido"),
			}),
		),
	}),
	permiso: { departamento: "contaduria" },
});

export const pagosRecibidos = definirConsulta({
	nombre: "contaduria.pagos_recibidos",
	descripcion: "Los pagos recibidos de los clientes, el más reciente arriba; los cancelados, solo si se piden",
	entrada: z.object({
		cliente_id: z.uuid().optional().describe("Solo los de ese cliente"),
		desde: z.iso.date().optional().describe("Desde ese día"),
		hasta: z.iso.date().optional().describe("Hasta ese día"),
		incluir_cancelados: z.enum(["si", "no"]).optional().describe("Con los cancelados"),
		cursor,
	}),
	salida: z.object({
		renglones: z.array(
			z.object({
				pago_id: z.uuid(),
				version: z.number().int(),
				folio: z.string(),
				fecha: z.iso.date(),
				fecha_texto: z.string().describe("«9 nov»"),
				cliente_id: z.uuid(),
				cliente: z.string(),
				documento: z.string().describe("La nota, o «anticipo · {PE}»"),
				donde: dondeSeRecibio,
				referencia: z.string().nullable(),
				aplicado: z
					.object({ texto: z.string(), ambar: z.boolean() })
					.nullable()
					.describe("En un depósito a un tercero: «aplicado a {deuda}» o «sin aplicar» en ámbar"),
				monto_centavos: monto,
				registro: z.string().describe("Quién lo registró"),
				cancelado: z.boolean(),
			}),
		),
		...pagina,
	}),
	permiso: { departamento: "contaduria" },
});

export const clienteDeContaduria = definirConsulta({
	nombre: "contaduria.cliente",
	descripcion:
		"El cajón del cliente: lo que nos debe, su crédito y su semáforo, sus notas con saldo, sus pagos y su saldo a favor; queda en la bitácora como consulta sensible",
	entrada: z.object({ cliente_id: z.uuid().describe("El cliente") }),
	salida: z.object({
		cliente_id: z.uuid(),
		nombre: z.string(),
		contexto: z.string().describe("«{tipo} · {municipio}»"),
		tercero_id: z.uuid(),
		pedidos_abiertos: z.number().int(),
		notas_con_saldo: z.number().int(),
		pagos_registrados: z.number().int(),
		le_debemos_centavos: monto.describe("Lo que le debemos como proveedor o acreedor; 0 si nada"),
		nos_debe_centavos: monto,
		limite_centavos: monto.describe("0 es sin crédito"),
		dias_credito: z.number().int(),
		semaforo: semaforoConTexto,
		sugerido: semaforoConTexto.nullable(),
		saldo_favor_centavos: monto,
		version_credito: z.number().int(),
		notas: z.array(
			z.object({
				nota_entrega_id: z.uuid(),
				folio: z.string(),
				entregada: z.string().describe("«9 nov»"),
				vence: fechaConTexto,
				saldo_centavos: monto,
			}),
		),
		pagos: z.array(
			z.object({
				pago_id: z.uuid(),
				version: z.number().int(),
				folio: z.string(),
				fecha: z.string().describe("«9 nov»"),
				detalle: z.string().describe("«{nota o pedido} · {dónde se recibió}»"),
				monto_centavos: monto,
				cancelado: z.boolean(),
			}),
		),
		movimientos_a_favor: z.array(
			z.object({
				fecha: z.string().describe("«9 nov»"),
				texto: z.string().describe("«Entró: anticipo de PE-0145», «Aplicado a NV-0151», «Devuelto · PG-0320»"),
				monto_centavos: monto.describe("Lo que entró (positivo) o salió (negativo)"),
			}),
		),
		cuentas_fabrica: cuentasFabrica,
	}),
	permiso: { departamento: "contaduria" },
});

export const registrarPagoOpciones = definirConsulta({
	nombre: "contaduria.registrar_pago_opciones",
	descripcion:
		"Lo que necesita el cajón Registrar pago: los clientes con algo por pagar, los documentos del escogido, las cuentas de la fábrica, los terceros a quienes se les debe y sus deudas",
	entrada: z.object({
		cliente_id: z.uuid().optional().describe("El cliente; sin él, el primero que tiene algo por pagar"),
		tercero_deposito_id: z.uuid().optional().describe("El tercero a quien se le depositó, para sus deudas"),
	}),
	salida: z.object({
		clientes: z.array(opcion).describe("Los clientes con una nota con saldo o un pedido abierto"),
		cliente_id: z.uuid().nullable().describe("El escogido"),
		documentos: z.array(
			z.object({
				tipo: z.enum(["nota", "pedido"]),
				id: z.uuid(),
				folio: z.string(),
				saldo_centavos: monto.describe("El saldo de la nota o lo que le falta al pedido"),
				detalle: z.string().describe("«vence {fecha}» o «anticipo del pedido»"),
			}),
		),
		cuentas_fabrica: cuentasFabrica,
		terceros: z.array(opcion).describe("Los proveedores y acreedores a quienes se les debe, sin el mismo cliente"),
		deudas: z.array(
			z.object({
				cuenta_por_pagar_id: z.uuid(),
				documento: z.string(),
				saldo_centavos: monto,
			}),
		),
	}),
	permiso: { departamento: "contaduria" },
});
