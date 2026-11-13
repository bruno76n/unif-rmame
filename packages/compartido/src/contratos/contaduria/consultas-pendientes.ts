/**
 * Los contratos de las consultas de Pendientes de Contaduría: `contaduria.pendientes` (las cuatro cifras y la cola de
 * trabajo) y `contaduria.flujo_proximos_dias` (lo que entra y sale cada uno de los próximos días). Solo las pide
 * Contaduría: ve saldos, pagos y cuentas.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Pendientes»)
 *
 * Los renglones llegan armados, con su estado y su color: la pantalla solo los pinta y abre lo que dice su botón. El
 * monto de la nómina viaja en `total_nomina_centavos`, un campo de sueldo: sin «ven sueldos y tarifas» no viaja y la
 * pantalla pinta «••••».
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { cuentasFabrica, estadoArmado, monto } from "./vistas.ts";

/** Los grupos de Pendientes. */
export const gruposDePendientesDeContaduria = [
	"pagos",
	"cobranza",
	"nomina",
	"contador_externo",
	"excepciones",
] as const;

/** Los tipos de pendiente. */
export const tiposDePendienteDeContaduria = [
	"pago_proveedor",
	"pago_acreedor",
	"pago_detenido",
	"deposito_tercero",
	"cobranza",
	"saldo_favor",
	"nomina",
	"contador_externo",
	"excepcion",
] as const;

/** Lo que hace el botón de un pendiente. */
export const accionesDePendienteDeContaduria = [
	"pagar",
	"pagar_lo_recibido",
	"revisar",
	"aplicar",
	"ver_cliente",
	"ver_nomina",
	"pagar_nomina",
	"preparar_paquete",
	"resolver",
] as const;

/** Un tramo de la barra repartida de una cifra, con su monto. */
const tramoConMonto = z.object({
	etiqueta: z.string().describe("Qué suma: «1 a 15 días»"),
	color: colorDeEstado,
	monto_centavos: monto.describe("Lo que suma ese tramo"),
});

export const pendientesDeContaduria = definirConsulta({
	nombre: "contaduria.pendientes",
	descripcion:
		"Pendientes de Contaduría: el saldo por cobrar y por pagar, el flujo neto de los próximos días, los pagos detenidos y la cola de pagos, cobranza, nómina, paquete del contador y excepciones de dinero",
	entrada: z.object({
		grupo: z
			.enum(["todos", ...gruposDePendientesDeContaduria])
			.optional()
			.describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		ventana_dias: z.number().int().describe("`contaduria.ventana_dias`"),
		cifras: z.object({
			por_cobrar: z.object({
				total_centavos: monto.describe("Lo que deben los clientes en notas entregadas"),
				vencido_centavos: monto.describe("Lo vencido"),
				tramos: z.array(tramoConMonto).describe("Por vencer y cada tramo de `contaduria.antiguedad_tramos_dias`"),
			}),
			por_pagar: z.object({
				total_centavos: monto.describe("Lo que se debe, con lo detenido"),
				vencido_centavos: monto.describe("Lo vencido, sin lo detenido"),
				tramos: z.array(tramoConMonto).describe("Vencido · Próximos {n} días · Después"),
			}),
			flujo: z.object({
				entra_centavos: monto.describe("Lo que vence por cobrar en los próximos días"),
				sale_centavos: monto.describe("Lo que vence por pagar, sin lo detenido"),
				neto_centavos: monto.describe("Lo que entra menos lo que sale"),
				positivo: z.boolean().describe("Si el neto es mayor que cero: verde; si no, rojo"),
			}),
			detenidos: z.object({
				monto_centavos: monto.describe("El saldo de las facturas detenidas o esperando autorización"),
				cuantos: z.number().int(),
				tramos: z.array(tramoConMonto).describe("Por resolver · Esperando autorización"),
			}),
		}),
		renglones: z.array(
			z.object({
				clave: z.string(),
				grupo: z.enum(gruposDePendientesDeContaduria),
				tipo: z.enum(tiposDePendienteDeContaduria),
				titulo: z.string().describe("El beneficiario, el cliente, la semana o el paquete"),
				detalle: z.string().describe("La línea de abajo de la referencia"),
				fecha: z
					.object({
						fecha: z.iso.date(),
						texto: z.string().describe("«14 oct»"),
						roja: z.boolean().describe("Si ya pasó"),
					})
					.nullable(),
				importe_centavos: monto.describe("El saldo, lo vencido o lo que queda; no en la nómina"),
				total_nomina_centavos: monto.describe("El total de la nómina, solo con «ven sueldos y tarifas»"),
				estado: estadoArmado,
				accion: z.object({
					tipo: z.enum(accionesDePendienteDeContaduria),
					texto: z.string().describe("El texto del botón"),
					principal: z.boolean().describe("Negro: lo vencido"),
					id: z.uuid().nullable().describe("La cuenta, la factura, el cliente, la nómina, el paquete o la excepción"),
					version: z.number().int().nullable().describe("La versión de lo que cambia la acción"),
				}),
			}),
		),
		conteos: z.object({
			todos: z.number().int(),
			pagos: z.number().int(),
			cobranza: z.number().int(),
			nomina: z.number().int(),
			contador_externo: z.number().int(),
			excepciones: z.number().int(),
		}),
		cuentas_fabrica: cuentasFabrica,
	}),
	permiso: { departamento: "contaduria" },
	recortables: ["total_nomina_centavos"],
});

export const flujoProximosDias = definirConsulta({
	nombre: "contaduria.flujo_proximos_dias",
	descripcion:
		"El flujo de los próximos días: por día, de hoy a `contaduria.ventana_dias` − 1, lo que vence por cobrar y lo que vence por pagar sin lo detenido; lo vencido no sale",
	entrada: z.object({}),
	salida: z.object({
		ventana_dias: z.number().int().describe("`contaduria.ventana_dias`"),
		dias: z.array(
			z.object({
				dia: z.iso.date(),
				texto: z.string().describe("«dom 11»"),
				hoy: z.boolean(),
				entra_centavos: monto.describe("Lo que vence por cobrar ese día"),
				sale_centavos: monto.describe("Lo que vence por pagar ese día, sin lo detenido"),
			}),
		),
	}),
	permiso: { departamento: "contaduria" },
});
