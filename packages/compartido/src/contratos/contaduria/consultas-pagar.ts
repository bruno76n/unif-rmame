/**
 * Los contratos de las consultas de lo que se paga: `contaduria.cuentas_por_pagar` y `contaduria.conciliacion_facturas`
 * (la pestaña Cuentas por pagar) y `contaduria.capturar_factura_opciones` (la ventana «Capturar nota o factura»).
 * Solo las pide Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por pagar», «Ventanas»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { cuentasFabrica, cursor, estadoArmado, monto, opcion, pagina } from "./vistas.ts";

/** Un cuadro de las tres puntas: su dato y si cuadra (verde), no cuadra (rojo) o falta (gris). */
const punta = z.object({
	texto: z.string().describe("«500 m a $78», «500 m · 28 sep», «Sin recibir»"),
	como: z.enum(["coincide", "no_coincide", "falta"]),
});

/** Las tres puntas de una orden. */
const puntas = z.object({ orden: punta, recepcion: punta, factura: punta });

/** Un renglón del calendario de pagos. */
const renglonDelCalendario = z.object({
	cuenta_por_pagar_id: z.uuid(),
	version: z.number().int(),
	beneficiario: z.string(),
	tipo: z.enum(["proveedor", "acreedor"]),
	documento: z.string().describe("«Factura {FP} · {OC}» o la deuda con su mensualidad"),
	abajo: z.string().nullable().describe("«{monto} pagados por {cliente}» o «Autorizado por Dirección»"),
	vence: z.iso.date(),
	vence_texto: z.string().describe("«hace 3 días», «en 4 días»"),
	saldo_centavos: monto,
});

/** Un grupo del calendario con su suma. */
const grupoDelCalendario = z.object({
	cuantos: z.number().int(),
	suma_centavos: monto,
	renglones: z.array(renglonDelCalendario),
});

export const cuentasPorPagarDeContaduria = definirConsulta({
	nombre: "contaduria.cuentas_por_pagar",
	descripcion:
		"Cuentas por pagar: los pagos programados por semana sin lo detenido, los pagos detenidos con sus tres puntas y el calendario (vencidos, próximos días y posteriores)",
	entrada: z.object({ cursor }),
	salida: z.object({
		ventana_dias: z.number().int().describe("`contaduria.ventana_dias`"),
		total_centavos: monto.describe("Lo programado, sin lo detenido"),
		detenidas: z.number().int().describe("Cuántas cuentas detenidas no entran"),
		por_semana: z.array(
			z.object({
				etiqueta: z.string().describe("«Vencido», «Próximos 7 días», «+1 sem.»…"),
				proveedores_centavos: monto,
				acreedores_centavos: monto,
			}),
		),
		pagos_detenidos: z.array(
			z.object({
				factura_proveedor_id: z.uuid(),
				version: z.number().int(),
				folio: z.string().describe("El FP-"),
				proveedor: z.string(),
				saldo_centavos: monto,
				documento: z.string().describe("«Factura {FP} · {folio del proveedor} · {OC}»"),
				ordenes: z.array(z.object({ folio: z.string(), puntas })),
				motivo: z.string(),
				responsable: z.enum(["contaduria", "aduana"]),
				autorizacion: z.string().nullable().describe("El AU- si ya se pidió a Dirección"),
				cancelable: z.boolean().describe("Sin pagos y no esperando a Dirección"),
			}),
		),
		vencidos: grupoDelCalendario,
		proximos: grupoDelCalendario,
		posteriores: grupoDelCalendario.extend(pagina),
		cuentas_fabrica: cuentasFabrica,
	}),
	permiso: { departamento: "contaduria" },
});

export const conciliacionFacturasDeContaduria = definirConsulta({
	nombre: "contaduria.conciliacion_facturas",
	descripcion:
		"Las facturas de proveedor con sus tres puntas y su estado (sin las detenidas sin autorización, que van en Pagos detenidos), y al final las órdenes recibidas que esperan su factura",
	entrada: z.object({
		proveedor_id: z.uuid().optional().describe("Solo las de ese proveedor"),
		orden_compra_id: z.uuid().optional().describe("Solo las de esa orden"),
		estado: z
			.enum(["conciliada", "esperando_autorizacion", "autorizada", "pagada", "cancelada"])
			.optional()
			.describe("Solo las de ese estado"),
		cursor,
	}),
	salida: z.object({
		renglones: z.array(
			z.object({
				clave: z.string(),
				factura_proveedor_id: z.uuid().nullable().describe("Nulo en una orden que espera su factura"),
				version: z.number().int().nullable(),
				folio: z.string().nullable().describe("El FP-"),
				folio_proveedor: z.string().nullable(),
				ordenes: z.string().describe("Los folios de sus órdenes"),
				proveedor: z.string(),
				motivo: z.string().nullable().describe("Lo que no cuadra, en rojo"),
				puntas,
				total_centavos: monto.describe("El total facturado, o el valor de lo recibido sin factura"),
				estado: estadoArmado,
				autorizada: z
					.object({
						monto_autorizado_centavos: monto,
						diferencia_centavos: monto,
						aclarada_con: z.string().nullable().describe("El folio de la nota de crédito, si ya llegó"),
					})
					.nullable(),
				cancelable: z.boolean().describe("Conciliada sin pagos"),
			}),
		),
		...pagina,
	}),
	permiso: { departamento: "contaduria" },
});

export const capturarFacturaOpciones = definirConsulta({
	nombre: "contaduria.capturar_factura_opciones",
	descripcion:
		"Lo que necesita la ventana «Capturar nota o factura»: los proveedores, sus órdenes facturables con lo que les toca, y por orden lo recibido con su precio",
	entrada: z.object({
		proveedor_id: z.uuid().optional().describe("El proveedor; sin él, el de la orden"),
		orden_compra_id: z.uuid().optional().describe("La orden ya escogida (desde Compras)"),
	}),
	salida: z.object({
		proveedores: z.array(opcion),
		proveedor_id: z.uuid().nullable(),
		umbral_cambio_precio_pct: z.number().describe("`compras.umbral_cambio_precio_pct`"),
		ordenes: z.array(
			z.object({
				orden_compra_id: z.uuid(),
				folio: z.string(),
				estado: z.string().describe("Enviada, recibida…"),
				propuesta: z.boolean().describe("Recibida y esperando factura: va escogida"),
				total_centavos: monto.describe("El total de la orden, sin IVA"),
				recibido_centavos: monto.describe("El valor de lo recibido, sin IVA"),
				lineas: z.array(
					z.object({
						orden_compra_linea_id: z.uuid(),
						material: z.string(),
						recibido: z.string().describe("«500 m»"),
						precio_centavos: monto.describe("El precio vigente de la línea"),
					}),
				),
			}),
		),
	}),
	permiso: { departamento: "contaduria" },
});
